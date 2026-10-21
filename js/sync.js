/* Sincronización sin conexión, reglas de acceso y bitácora */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U;

  // ======================= SINCRONIZACIÓN =======================
  var listeners = [];
  var Sync = (AP.Sync = {
    personas: [], visitas: [], movs: [], vigilantes: [], horarios: [], permisos: [], solicitudes: [], puntos: [], elementos: [], outbox: [],
    byToken: new Map(),
    state: { online: navigator.onLine, syncing: false, lastPull: null, lastPush: null, lastError: null, authProblem: false, skew: null, pullErrors: {} },
    on: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    emit: function () { listeners.slice().forEach(function (f) { try { f(Sync.state); } catch (e) { console.error(e); } }); },

    load: async function () {
      var S = AP.Store;
      Sync.personas = (await S.get('c:personas')) || [];
      Sync.visitas = (await S.get('c:visitas')) || [];
      Sync.movs = (await S.get('c:movs')) || [];
      Sync.vigilantes = (await S.get('c:vigilantes')) || [];
      Sync.horarios = (await S.get('c:horarios')) || [];
      Sync.permisos = (await S.get('c:permisos')) || [];
      Sync.solicitudes = (await S.get('c:solicitudes')) || [];
      Sync.puntos = (await S.get('c:puntos')) || [];
      Sync.elementos = (await S.get('c:elementos')) || [];
      var meta = (await S.get('c:meta')) || {};
      Sync.state.lastPull = meta.lastPull || null;
      Sync.state.lastPush = meta.lastPush || null;
      Sync.state.skew = meta.skew == null ? null : meta.skew;
      Sync.outbox = await S.outboxAll();
      Sync.reindex();
    },
    reindex: function () {
      var m = new Map();
      Sync.personas.forEach(function (p) { if (p.Token) m.set(p.Token, { tipo: 'persona', rec: p }); });
      Sync.visitas.forEach(function (v) { if (v.Token) m.set(v.Token, { tipo: 'visita', rec: v }); });
      Sync.byToken = m;
    },
    saveMeta: function () {
      return AP.Store.set('c:meta', { lastPull: Sync.state.lastPull, lastPush: Sync.state.lastPush, skew: Sync.state.skew });
    },
    pendingCount: function () { return Sync.outbox.length; },
    stale: function () {
      if (!Sync.state.lastPull) return true;
      return (Date.now() - new Date(Sync.state.lastPull).getTime()) > (AP.CFG.minutosAlertaSinSincronizar || 30) * 60000;
    },

    // Registra un movimiento o inspección en el dispositivo; se envía cuando haya conexión.
    enqueue: async function (kind, fields, photos) {
      var item = {
        id: fields.IdLocal, kind: kind, fields: fields, photos: photos || [], uploaded: {},
        createdAt: new Date().toISOString(), attempts: 0, error: null
      };
      await AP.Store.outboxPut(item);
      Sync.outbox.push(item);
      Sync.emit();
      setTimeout(function () { Sync.run(); }, 50);
      return item;
    },

    // Movimientos conocidos: los del servidor (recientes) más los pendientes de envío.
    allMovs: function () {
      var seen = new Set();
      var out = [];
      Sync.outbox.forEach(function (o) { if (o.kind === 'mov') { seen.add(o.fields.IdLocal); out.push(Object.assign({ _pendiente: true, _error: o.error }, o.fields)); } });
      Sync.movs.forEach(function (m) { if (!seen.has(m.IdLocal)) out.push(m); });
      return out.sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
    },

    _running: null,
    run: function (opts) {
      // Si llega un registro mientras se sincroniza, se repite el envío al terminar.
      if (Sync._running) { Sync._again = true; return Sync._running; }
      Sync._running = Sync._run(opts || {}).finally(function () {
        Sync._running = null;
        if (Sync._again) { Sync._again = false; if (Sync.outbox.length && Sync.state.online !== false) setTimeout(function () { Sync.run({ skipPull: true }); }, 50); }
      });
      return Sync._running;
    },
    _run: async function (opts) {
      var B = AP.B;
      if (!AP.Session || !AP.Session.user) return;   // sin sesión no se sincroniza
      Sync.state.syncing = true; Sync.emit();
      try {
        await Sync.push();
        if (opts.skipPull !== true) await Sync.pull();
        Sync.state.online = true;
        Sync.state.lastError = null;
      } catch (e) {
        if (e.offline) Sync.state.online = false;
        else if (e.authRequired) Sync.state.authProblem = true;
        Sync.state.lastError = e.message;
      } finally {
        Sync.state.syncing = false;
        Sync.emit();
      }
    },

    push: async function () {
      var B = AP.B;
      var items = (await AP.Store.outboxAll());
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        try {
          if (it.kind === 'insp') await Sync._pushInsp(it);
          else if (it.kind === 'ronda') await Sync._pushRonda(it);
          else if (SIMPLE[it.kind]) await Sync._pushSimple(SIMPLE[it.kind], it);
          else await Sync._pushMov(it);
          await AP.Store.outboxDel(it.id);
          Sync.outbox = Sync.outbox.filter(function (o) { return o.id !== it.id; });
          Sync.state.lastPush = new Date().toISOString();
          Sync.state.authProblem = false;
          if (B.skewSeconds != null) Sync.state.skew = B.skewSeconds;
          await Sync.saveMeta();
          Sync.emit();
        } catch (e) {
          // Una inspección o ronda con fotos en conexión lenta no detiene el envío de los demás registros
          if (e.timeout && navigator.onLine !== false && (it.kind === 'insp' || it.kind === 'ronda')) {
            it.error = 'Envío lento de fotografías: se reintentará automáticamente.';
            await AP.Store.outboxPut(it);
            Sync.outbox = Sync.outbox.map(function (o) { return o.id === it.id ? it : o; });
            Sync.emit();
            continue;
          }
          if (e.offline || e.authRequired) throw e;
          it.attempts = (it.attempts || 0) + 1;
          it.error = (e.status === 403 ? 'El servidor rechazó el registro. ' : '') + e.message;
          await AP.Store.outboxPut(it);
          Sync.outbox = Sync.outbox.map(function (o) { return o.id === it.id ? it : o; });
          Sync.emit();
        }
      }
    },
    _pushMov: async function (it) {
      var B = AP.B;
      if (it.attempts > 0) {
        var ya = await B.findBy('AP_Movimientos', 'IdLocal', it.fields.IdLocal);
        if (ya.length) { Sync._addServerMov(ya[0]); return; }
      }
      try {
        var rec = await B.create('AP_Movimientos', it.fields);
        Sync._addServerMov(rec);
      } catch (e) {
        if (e.status === 409) {
          var r = await B.findBy('AP_Movimientos', 'IdLocal', it.fields.IdLocal);
          if (r.length) { Sync._addServerMov(r[0]); return; }
        }
        throw e;
      }
    },
    _pushInsp: async function (it) {
      var B = AP.B;
      var f = Object.assign({}, it.fields);
      var p = U.partsCO(f.FechaHora);
      var folder = 'AP_Evidencias/' + p.year + '/' + p.month + '/' + U.safeName(f.Placa || 'SINPLACA') + '_' + f.IdLocal.slice(0, 8);
      var fotos = [];
      for (var j = 0; j < it.photos.length; j++) {
        var ph = it.photos[j];
        var done = it.uploaded[ph.name];
        if (!done) {
          var blob = new Blob([ph.data], { type: ph.type || 'image/jpeg' });
          done = await B.upload(folder + '/' + ph.name, blob);
          it.uploaded[ph.name] = done;
          await AP.Store.outboxPut(it);
        }
        fotos.push({ nombre: ph.name, etiqueta: ph.label, ruta: done.path, url: done.webUrl, sha256: ph.sha256 });
      }
      f.Fotos = JSON.stringify(fotos);
      if (it.attempts > 0) {
        var ya = await B.findBy('AP_Inspecciones', 'IdLocal', f.IdLocal);
        if (ya.length) return;
      }
      try { await B.create('AP_Inspecciones', f); }
      catch (e) {
        if (e.status === 409) { var r = await B.findBy('AP_Inspecciones', 'IdLocal', f.IdLocal); if (r.length) return; }
        throw e;
      }
    },
    // Marcación de ronda: primero las fotografías de la novedad (si las hay), luego el registro
    _pushRonda: async function (it) {
      var B = AP.B;
      var f = Object.assign({}, it.fields);
      var p = U.partsCO(f.FechaHora);
      var folder = 'AP_Rondas/' + p.year + '/' + p.month + '/' + f.IdLocal.slice(0, 12);
      var fotos = [];
      for (var j = 0; j < it.photos.length; j++) {
        var ph = it.photos[j];
        var done = it.uploaded[ph.name];
        if (!done) {
          done = await B.upload(folder + '/' + ph.name, new Blob([ph.data], { type: ph.type || 'image/jpeg' }));
          it.uploaded[ph.name] = done;
          await AP.Store.outboxPut(it);
        }
        fotos.push({ nombre: ph.name, etiqueta: ph.label, ruta: done.path, sha256: ph.sha256 });
      }
      if (fotos.length) f.Fotos = JSON.stringify(fotos);
      if (it.attempts > 0) {
        var ya = await B.findBy('AP_Rondas', 'IdLocal', f.IdLocal);
        if (ya.length) return;
      }
      try { await B.create('AP_Rondas', f); }
      catch (e) {
        if (e.status === 409) { var r = await B.findBy('AP_Rondas', 'IdLocal', f.IdLocal); if (r.length) return; }
        throw e;
      }
    },
    // Registros de solo agregar (turnos), con la misma protección contra duplicados
    _pushSimple: async function (list, it) {
      var B = AP.B;
      if (it.attempts > 0) {
        var ya = await B.findBy(list, 'IdLocal', it.fields.IdLocal);
        if (ya.length) { Sync._afterSimple(list, ya[0]); return; }
      }
      try { Sync._afterSimple(list, await B.create(list, it.fields)); }
      catch (e) {
        if (e.status === 409) { var r = await B.findBy(list, 'IdLocal', it.fields.IdLocal); if (r.length) { Sync._afterSimple(list, r[0]); return; } }
        throw e;
      }
    },
    _afterSimple: function () { /* sin copia local de turnos */ },
    _addServerMov: function (rec) {
      Sync.movs = Sync.movs.filter(function (m) { return m.IdLocal !== rec.IdLocal; });
      Sync.movs.push(rec);
      AP.Store.set('c:movs', Sync.movs);
    },

    // Solicitudes de ingreso de las últimas 24 horas (las ve el vigilante que espera y el Director que decide)
    pullSolicitudes: async function () {
      var sol = await AP.B.listRange('AP_Solicitudes', 'FechaSolicitud', U.addDays(new Date(), -1), null);
      Sync.solicitudes = sol;
      await AP.Store.set('c:solicitudes', sol);
      Sync.emit();
      return sol;
    },

    pull: async function () {
      var B = AP.B, S = AP.Store;
      var errs = {};
      // El rondero solo necesita los puntos de control y su propio perfil (minimización de datos, Ley 1581 de 2012)
      if (AP.Session.can('rondas') && !AP.Session.can('porteria')) {
        try {
          var pts = await B.listAll('AP_PuntosRonda');
          Sync.puntos = pts; await S.set('c:puntos', pts);
          var yo = await B.miPerfil();
          Sync.vigilantes = [yo].filter(Boolean); await S.set('c:vigilantes', Sync.vigilantes);
          Sync.state.lastPull = new Date().toISOString();
          Sync.state.pullErrors = {};
          await Sync.saveMeta();
        } catch (e) {
          if (e.offline || e.authRequired) throw e;
          Sync.state.pullErrors = { puntos: e.message };
          throw AP.mkErr('api', 'No fue posible actualizar los puntos de ronda: ' + e.message);
        }
        return;
      }
      // Personas: primero sin fotos; luego solo las fotos que cambiaron.
      try {
        var lista = await B.listAll('AP_Personas', { exclude: ['Foto'] });
        var prev = new Map(Sync.personas.map(function (p) { return [p.id, p]; }));
        var cambian = [];
        lista.forEach(function (p) {
          var old = prev.get(p.id);
          if (old && old._etag === p._etag && old._modified === p._modified) p.Foto = old.Foto;
          else cambian.push(p.id);
        });
        if (cambian.length) {
          var fotos = await B.getFields('AP_Personas', cambian, ['Foto']);
          lista.forEach(function (p) { if (fotos[p.id]) p.Foto = fotos[p.id].Foto || ''; });
        }
        Sync.personas = lista;
        await S.set('c:personas', lista);
      } catch (e) { if (e.offline || e.authRequired) throw e; errs.personas = e.message; }

      try {
        var vis = await B.listRange('AP_Visitas', 'FechaFin', U.addDays(new Date(), -1), null);
        Sync.visitas = vis;
        await S.set('c:visitas', vis);
      } catch (e) { if (e.offline || e.authRequired) throw e; errs.visitas = e.message; }

      try {
        var dias = AP.CFG.diasHistorialEnPorteria || 2;
        var movs = await B.listRange('AP_Movimientos', 'FechaHora', U.addDays(new Date(), -dias), null);
        Sync.movs = movs;
        await S.set('c:movs', movs);
      } catch (e) { if (e.offline || e.authRequired) throw e; errs.movs = e.message; }

      // Usuarios: el administrador los ve todos; los demás, solo su propio perfil (para detectar bajas y restablecimientos)
      try {
        var vg = AP.Session.can('admin') ? await B.listAll('AP_Vigilantes') : [await B.miPerfil()].filter(Boolean);
        Sync.vigilantes = vg;
        await S.set('c:vigilantes', vg);
      } catch (e) { if (e.offline || e.authRequired) throw e; errs.vigilantes = e.message; }

      // Solicitudes de ingreso: se leen ANTES que los permisos, porque al aprobar el Director primero crea el permiso
      // (si fallan, no se detiene la sincronización de lo demás)
      try { await Sync.pullSolicitudes(); }
      catch (e) { if (e.offline || e.authRequired) throw e; console.warn('[AP] Solicitudes de ingreso:', e.message); }

      // Horarios programados y permisos (los registra el Director; el celular solo los lee)
      try {
        var hr = await B.listAll('AP_Horarios');
        var pm = await B.listRange('AP_Permisos', 'Hasta', U.addDays(new Date(), -2), null);
        Sync.horarios = hr; Sync.permisos = pm;
        await S.set('c:horarios', hr); await S.set('c:permisos', pm);
      } catch (e) { if (e.offline || e.authRequired) throw e; errs.horarios = e.message; }

      // Elementos registrados por el Director en los últimos meses: el vigilante ve lo pendiente por salir, por ingresar
      // y por regresar, aunque la fecha prevista ya haya pasado (si falla, no se detiene la sincronización de lo demás)
      try {
        var el = await B.listRange('AP_Elementos', 'FechaCreacion', U.addDays(new Date(), -AP.DIAS_ELEMENTOS), null);
        Sync.elementos = el;
        await S.set('c:elementos', el);
      } catch (e) { if (e.offline || e.authRequired) throw e; console.warn('[AP] Elementos:', e.message); }

      Sync.reindex();
      Sync.state.pullErrors = errs;
      // Solo se considera "actualizado" si llegaron personas y visitas (base de las decisiones de acceso).
      if (!errs.personas && !errs.visitas) {
        Sync.state.lastPull = new Date().toISOString();
        await Sync.saveMeta();
      }
      if (Object.keys(errs).length) {
        var k = Object.keys(errs)[0];
        throw AP.mkErr('api', 'No fue posible actualizar ' + k + ': ' + errs[k]);
      }
    },

    // Borra la copia local de datos (no los registros pendientes de envío)
    limpiarLocal: async function () {
      var S = AP.Store;
      var keys = ['c:personas', 'c:visitas', 'c:movs', 'c:vigilantes', 'c:horarios', 'c:permisos', 'c:solicitudes', 'c:puntos', 'c:elementos', 'c:meta'];
      for (var i = 0; i < keys.length; i++) await S.del(keys[i]);
      Sync.personas = []; Sync.visitas = []; Sync.movs = []; Sync.vigilantes = []; Sync.horarios = []; Sync.permisos = []; Sync.solicitudes = []; Sync.puntos = []; Sync.elementos = [];
      Sync.state.lastPull = null; Sync.state.pullErrors = {};
      Sync.reindex();
    },

    _timer: null,
    start: function () {
      if (Sync._timer) return;
      window.addEventListener('online', function () { Sync.state.online = true; Sync.emit(); Sync.run(); });
      window.addEventListener('offline', function () { Sync.state.online = false; Sync.emit(); });
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') Sync.run(); });
      Sync._timer = setInterval(function () {
        // La consola del Director sigue consultando aunque la pestaña esté en segundo plano (visitas por aprobar)
        if (document.visibilityState === 'visible' || (AP.Session && AP.Session.can && AP.Session.can('consola'))) Sync.run();
      }, 90 * 1000);
      Sync.run();
    }
  });

  var SIMPLE = { turno: 'AP_Turnos' };

  // ======================= REGLAS DE ACCESO =======================
  var A = (AP.Access = {});

  A.keyOf = function (m) {
    if (m.Token) return m.Token;
    if (m.NumDoc) return 'DOC:' + U.normDoc(m.NumDoc);
    // Registro manual sin documento (p. ej., autoridad): la salida se asocia a su ingreso
    return 'ID:' + (m.Sentido === 'Salida' && m.EntradaId ? m.EntradaId : m.IdLocal);
  };

  A.lastFor = function (key) {
    var ms = Sync.allMovs();
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.Resultado !== 'Permitido') continue;
      if (A.keyOf(m) === key) return m;
    }
    return null;
  };

  // Personas actualmente dentro de las instalaciones (último movimiento permitido = ingreso)
  A.inside = function () {
    var ms = Sync.allMovs().slice().reverse(); // de más antiguo a más reciente
    var last = new Map();
    ms.forEach(function (m) { if (m.Resultado === 'Permitido') last.set(A.keyOf(m), m); });
    var out = [];
    last.forEach(function (m) { if (m.Sentido === 'Ingreso') out.push(m); });
    return out.sort(function (a, b) { return a.FechaHora < b.FechaHora ? -1 : 1; });
  };

  // Evalúa una credencial leída. Devuelve nivel ok | warn | deny y el sentido, que el sistema determina por el último
  // movimiento permitido (el vigilante no lo elige): si hay un ingreso abierto, lo que corresponde es la salida.
  A.evaluate = function (token, now) {
    now = now || new Date();
    var hit = Sync.byToken.get(token);
    var r = { token: token, tipo: hit ? hit.tipo : null, rec: hit ? hit.rec : null };
    r.ultimo = A.lastFor(token);
    var maxSin = (AP.Horario ? AP.Horario.cfg().horasMaxSinSalida : 14) * 3600000;
    var abierto = !!(r.ultimo && r.ultimo.Sentido === 'Ingreso');
    var viejo = abierto && now.getTime() - new Date(r.ultimo.FechaHora).getTime() > maxSin;
    r.sentido = abierto && !viejo ? 'Salida' : 'Ingreso';
    if (viejo) r.novedadPrevia = 'Ingreso anterior (' + U.fDateTime(r.ultimo.FechaHora) + ') sin salida registrada';
    var salida = r.sentido === 'Salida';
    if (!hit) {
      r.nivel = 'deny'; r.etiqueta = 'QR NO RECONOCIDO';
      r.detalle = Sync.stale()
        ? 'No figura en los datos del celular, que no se actualizan desde ' + U.rel(Sync.state.lastPull) + '. Verifique por teléfono o registre manualmente.'
        : 'La credencial no corresponde a ninguna persona ni visita registrada. Verifique identidad y, si procede, use el registro manual.';
    } else if (hit.tipo === 'persona') {
      var p = hit.rec;
      if (p.Estado !== 'Habilitado') {
        r.nivel = 'deny'; r.etiqueta = 'INHABILITADO'; r.detalle = p.MotivoEstado || 'La persona no está habilitada para ingresar.';
      } else if (p.VigenciaHasta && p.VigenciaHasta < U.ymd(now)) {
        r.nivel = 'warn'; r.etiqueta = 'HABILITACIÓN VENCIDA'; r.detalle = 'Vigente solo hasta el ' + p.VigenciaHasta + (p.Tipo === 'Contratista' ? ' (verificar seguridad social).' : '.');
      } else {
        r.nivel = 'ok'; r.etiqueta = 'HABILITADO'; r.detalle = p.VigenciaHasta ? 'Vigente hasta el ' + p.VigenciaHasta : '';
      }
      r.categoria = p.Tipo || 'Personal propio';
      // Horario y permisos
      if (AP.Horario && p.Estado === 'Habilitado') {
        var s = salida ? AP.Horario.evaluarSalida(p, now) : AP.Horario.evaluarIngreso(p, now, r.ultimo);
        if (s && (r.nivel === 'ok' || s.nivel === 'deny')) Object.assign(r, s);
        else if (s) { r.novedad = s.novedad; r.horarioInfo = s.horarioInfo; }
      }
    } else {
      var v = hit.rec;
      var ini = new Date(v.FechaInicio), fin = new Date(v.FechaFin);
      var antes = (AP.CFG.minutosAntelacionVisita || 0) * 60000;
      r.categoria = v.Categoria || 'Visitante';
      if (v.Estado === 'Pendiente') { r.nivel = 'deny'; r.etiqueta = 'VISITA SIN APROBAR'; r.detalle = 'La Dirección de Seguridad Integral aún no ha aprobado esta visita.'; r.sinExcepcion = !salida; }
      else if (v.Estado !== 'Aprobada') { r.nivel = 'deny'; r.etiqueta = 'VISITA ' + String(v.Estado || '').toUpperCase(); r.detalle = 'La visita no está autorizada.'; r.sinExcepcion = !salida; }
      else if (now.getTime() < ini.getTime() - antes) {
        // El QR del visitante solo sirve en el lapso que programó el Director: antes de su hora de inicio no abre
        r.nivel = 'deny'; r.sinExcepcion = true; r.etiqueta = 'QR AÚN NO VIGENTE'; r.detalle = 'Este QR empieza a valer el ' + U.fDateTime(ini) + '. Si debe ingresar antes, el Director de Seguridad Integral debe modificar la vigencia.';
      }
      else if (now.getTime() > fin.getTime()) {
        r.nivel = salida ? 'warn' : 'deny'; r.sinExcepcion = !salida; r.etiqueta = salida ? 'VIGENCIA VENCIDA — REGISTRE LA SALIDA' : 'QR VENCIDO';
        r.detalle = 'La autorización terminó el ' + U.fDateTime(fin) + (salida ? '. La salida no se impide: regístrela y avise al Director.' : '. Si debe ingresar, el Director de Seguridad Integral debe ampliar la vigencia.');
        if (salida) r.novedad = 'Salida posterior al vencimiento del QR';
      }
      else { r.nivel = 'ok'; r.etiqueta = 'VISITA AUTORIZADA'; r.detalle = 'Válida hasta las ' + U.fTime(fin) + (U.ymd(fin) !== U.ymd(now) ? ' del ' + U.fDate(fin) : ''); }
    }
    return r;
  };

  // Estado de una visita según sus movimientos: por llegar, dentro o ya salió (cada visita tiene su propio QR)
  A.estadoVisita = function (v) {
    var m = v && v.Token ? A.lastFor(v.Token) : null;
    if (!m) return { clave: 'porLlegar', texto: 'Por llegar' };
    return m.Sentido === 'Ingreso' ? { clave: 'dentro', texto: 'Dentro desde ' + U.fTime(m.FechaHora), mov: m } : { clave: 'salio', texto: 'Salió ' + U.fTime(m.FechaHora), mov: m };
  };
  // Visitas aprobadas para hoy que aún no han ingresado (al ingresar salen de la lista)
  A.visitasPorLlegar = function (now) {
    now = now || new Date();
    var hoy = U.ymd(now);
    return Sync.visitas.filter(function (v) {
      return v.Estado === 'Aprobada' && U.ymd(v.FechaInicio) <= hoy && U.ymd(v.FechaFin) >= hoy && new Date(v.FechaFin) > now && A.estadoVisita(v).clave === 'porLlegar';
    }).sort(function (a, b) { return a.FechaInicio < b.FechaInicio ? -1 : 1; });
  };

  // Evaluación al leer un QR: si el resultado no es favorable y hay conexión, se consulta primero el servidor,
  // porque el Director pudo aprobar la visita (o habilitar a la persona) hace unos segundos.
  A.evaluarActual = async function (token) {
    var r = A.evaluate(token);
    if (r.nivel === 'ok' || navigator.onLine === false || !AP.Session.user) return r;
    try {
      await Promise.race([(async function () {
        // Si ya hay una sincronización en curso, pudo empezar antes de la aprobación: se espera y se repite
        if (Sync._running) { try { await Sync._running; } catch (e) { /* */ } }
        if (AP.B.olvidarMarcador) AP.B.olvidarMarcador();
        await Sync.run();
      })(), U.sleep(8000)]);
    } catch (e) { /* se usa la copia local */ }
    return A.evaluate(token);
  };

  // ======================= BITÁCORA =======================
  AP.Audit = {
    log: async function (accion, referencia, detalle, hash) {
      try {
        var me = AP.Session.user, t = AP.Session.turno;
        await AP.B.create('AP_Bitacora', {
          Title: accion + (referencia ? ' — ' + referencia : ''), Accion: accion, Usuario: me ? me.upn + (t ? ' · turno de ' + t.nombre + ' (' + t.usuario + ')' : '') : '',
          FechaHora: new Date().toISOString(), Referencia: referencia || '', Detalle: detalle || '', Hash: hash || ''
        });
      } catch (e) { console.warn('No se pudo escribir la bitácora', e); }
    }
  };
})();
