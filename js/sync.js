/* Sincronización sin conexión, reglas de acceso y bitácora */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U;

  // ======================= SINCRONIZACIÓN =======================
  var listeners = [];
  var Sync = (AP.Sync = {
    personas: [], visitas: [], movs: [], vigilantes: [], horarios: [], permisos: [], outbox: [],
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
          // Una inspección con fotos en conexión lenta no detiene el envío de los demás registros
          if (e.timeout && navigator.onLine !== false && it.kind === 'insp') {
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

    pull: async function () {
      var B = AP.B, S = AP.Store;
      var errs = {};
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

      // Horarios programados y permisos (los registra el Director; el celular solo los lee)
      try {
        var hr = await B.listAll('AP_Horarios');
        var pm = await B.listRange('AP_Permisos', 'Hasta', U.addDays(new Date(), -2), null);
        Sync.horarios = hr; Sync.permisos = pm;
        await S.set('c:horarios', hr); await S.set('c:permisos', pm);
      } catch (e) { if (e.offline || e.authRequired) throw e; errs.horarios = e.message; }

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
      var keys = ['c:personas', 'c:visitas', 'c:movs', 'c:vigilantes', 'c:horarios', 'c:permisos', 'c:meta'];
      for (var i = 0; i < keys.length; i++) await S.del(keys[i]);
      Sync.personas = []; Sync.visitas = []; Sync.movs = []; Sync.vigilantes = []; Sync.horarios = []; Sync.permisos = [];
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
        if (document.visibilityState === 'visible') Sync.run();
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
    return 'ID:' + m.IdLocal;
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
