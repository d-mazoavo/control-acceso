/* Planta: personal a cargo de cada jefe con personal a cargo (las personas que lo tienen como jefe inmediato en su ficha),
 * turnos con horario, asignación de personas a turnos, programación semanal, permisos, estado en planta, estadísticas y
 * registro de cambios. El jefe con personal a cargo crea y modifica, nunca borra; cada cambio queda registrado. El Director de
 * Seguridad Integral está por encima: ve y programa a cualquier grupo y puede inhabilitar a cualquier persona. Gobierno
 * Corporativo consulta. La portería aplica a esta programación las mismas reglas de puntualidad. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h, J = function () { return AP.Jornada; };

  var DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  var DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  function errBox(e) {
    var link = e && e.indiceUrl ? h('a', { class: 'btn', href: e.indiceUrl, target: '_blank', rel: 'noopener' }, AP.icon('settings', 18), 'Crear el índice en Firebase (Director)') : null;
    var sinPermiso = e && (e.status === 403 || e.code === 'permission-denied');
    return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con el servidor' : 'No fue posible cargar la información',
      sinPermiso ? 'Sin permiso para esta operación. Es probable que las reglas de seguridad de Firebase no estén actualizadas: avise al Director de Seguridad Integral para que publique las reglas de la entrega del 24 de octubre.' : e && e.message, link);
  }
  function tabla(cols, rows, onRow) {
    return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { class: c[2] || '' }, c[0]); }))),
      h('tbody', null, rows.length ? rows.map(function (r) {
        return h('tr', { onclick: onRow ? function (e) { if (!e.target.closest('button,a,input,select')) onRow(r); } : null }, cols.map(function (c) { var v = c[1](r); return h('td', { 'data-label': c[0], class: c[2] || '' }, v == null ? '' : v); }));
      }) : h('tr', null, h('td', { colspan: cols.length, class: 'center muted' }, 'Sin registros')))));
  }
  function porNombre(a, b) { return U.fold(a.Title) < U.fold(b.Title) ? -1 : 1; }
  function kv(l, v) { return h('div', { class: 'kv' }, h('span', null, l), h('strong', null, v == null || v === '' ? '—' : v)); }
  function kpi(v, t, kind) { return h('div', { class: 'kpi ' + (kind || '') }, h('strong', null, String(v)), h('span', null, t)); }
  function fh(n) { return (Math.round((n || 0) * 10) / 10).toLocaleString('es-CO'); }
  function pct(a, b) { return b ? Math.round(a / b * 100) + ' %' : '—'; }
  function fDia(y) { return U.fDate(U.fromLocal(y, '12:00')); }
  function maxSemanal() { return Number(((AP.CFG || {}).jornada || {}).maximaSemanal) || 42; }
  var AVISO_LEGADO = 'Los registros anteriores a la actualización de la aplicación (octubre de 2026) no se pudieron consultar con este perfil; los posteriores se muestran completos. ' +
    'Si se necesitan, el Director de Seguridad Integral puede habilitarlos en «Instalación» → «Índices de la base de datos» (opcional).';
  var RE_SALUD = /(diagn[oó]stic|enfermedad|c[aá]ncer|embaraz|psiqui|psicol|terapia|cirug|incapacidad|v\.?i\.?h|medicament|tratamiento|m[eé]dic[oa]|\beps\b|\bips\b|hospital|cl[ií]nica|urgencias|odontol)/i;

  // Grupo «todo el personal» (todos los jefes inmediatos y el personal propio sin jefe) para el Director y Gobierno Corporativo
  var TODOS = '*';

  // ---------- Perfil de quien consulta ----------
  function rol() { return AP.Session.rol; }
  function esJefe() { return rol() === 'Jefe de Producción'; }
  function esTH() { return rol() === 'Talento Humano'; }
  function miPid() { return (AP.Session.user && AP.Session.user.personaId) || ''; }
  function completo() { return AP.Session.lectura(); }          // Director, Analista y Gobierno Corporativo
  function puedeEditar() { return AP.Session.can('editar') || esJefe(); }

  function conAviso(l, de) { if (de && de.avisoLegado) l.avisoLegado = true; return l; }

  // ---------- Datos según el perfil (el Jefe solo puede leer a su personal) ----------
  var D = {
    // Todas las personas visibles para el perfil (para armar los grupos por jefe inmediato)
    personasTodas: async function () {
      if (esJefe()) return D.personal(miPid());
      if (esTH()) return AP.B.consulta('AP_Personas', [['Tipo', '==', 'Personal propio']], { exclude: ['Observaciones'] });
      return AP.B.listAll('AP_Personas', { exclude: ['Foto', 'Observaciones'] });
    },
    // Personal de un grupo: quienes tienen a g como jefe inmediato ('' = personal propio sin jefe inmediato)
    // Al Jefe solo le aparecen las personas habilitadas: quien queda inhabilitado sale de sus listas
    personal: async function (g, todas) {
      var l;
      if (esJefe()) l = (await AP.B.consulta('AP_Personas', [['JefeId', '==', miPid()]], { exclude: ['Observaciones'] })).filter(function (p) { return p.Estado === 'Habilitado'; });
      else l = (todas || await D.personasTodas()).filter(function (p) { return g === TODOS ? (p.Tipo === 'Personal propio' || !!p.JefeId) : g ? p.JefeId === g : (p.Tipo === 'Personal propio' && !p.JefeId); });
      return l.sort(porNombre);
    },
    // Turnos del grupo y turnos generales (sin jefe)
    turnos: async function (g) {
      return (await AP.B.listAll('AP_TurnosPlanta')).filter(function (t) { return !t.JefeId || t.JefeId === g; })
        .sort(function (a, b) { return (a.JefeId ? 0 : 1) - (b.JefeId ? 0 : 1) || (String(a.Codigo) < String(b.Codigo) ? -1 : 1); });
    },
    semana: async function (ymd, g) {
      var l = esJefe() ? await AP.B.consulta('AP_ProgPlanta', [['JefeId', '==', miPid()], ['Semana', '==', ymd]], { limite: 20, probar: true })
        : await AP.B.findBy('AP_ProgPlanta', 'Semana', ymd);
      return l.filter(function (w) { return !w._borrado && (w.JefeId || '') === (g || ''); })[0] || null;
    },
    // Semanas cuyo lunes cae entre una semana antes de «desde» y «hasta» (g undefined = todos los grupos)
    semanas: async function (desdeYmd, hastaYmd, g) {
      var a = U.fromLocal(J().addYmd(J().lunes(desdeYmd), -7), '00:00').toISOString();
      var b = U.fromLocal(hastaYmd || J().addYmd(U.ymd(), 70), '23:59').toISOString();
      var l = esJefe() ? await AP.B.consulta('AP_ProgPlanta', [['JefeId', '==', miPid()]], { probar: true })
        : await AP.B.listRange('AP_ProgPlanta', 'Desde', a, null);
      return l.filter(function (w) { return !w._borrado && w.Desde >= a && w.Desde <= b && (g === undefined || (w.JefeId || '') === (g || '')); });
    },
    horarios: async function () { return AP.B.listAll('AP_Horarios'); },
    ausencias: async function (dias) {
      var desde = U.addDays(new Date(), -(dias || 60)).toISOString();
      if (esJefe()) return (await AP.B.consulta('AP_Ausencias', [['JefeId', '==', miPid()]], { probar: true })).filter(function (a) { return a.Hasta >= desde; });
      return AP.B.listRange('AP_Ausencias', 'Hasta', desde, null);
    },
    movimientos: async function (a, b, personas, progreso) {
      b = b || new Date(Date.now() + 864e5);
      // Día por día y solo con igualdades: no necesita índices compuestos en Firebase
      if (esJefe()) return J().movsPorDia({ scope: 'jefe:' + miPid(), filtros: [['JefeId', '==', miPid()]], desde: U.ymd(a), hasta: U.ymd(b) > U.ymd() ? U.ymd() : U.ymd(b), progreso: progreso,
        legado: function (x, y) { return [['JefeId', '==', miPid()], ['FechaHora', '>=', x], ['FechaHora', '<=', y]]; } });
      var toks = new Set(personas.map(function (p) { return p.Token; })), docs = new Set(personas.map(function (p) { return U.normDoc(p.NumDoc); }));
      return (await AP.B.listRange('AP_Movimientos', 'FechaHora', a, b)).filter(function (m) { return toks.has(m.Token) || (m.NumDoc && docs.has(U.normDoc(m.NumDoc))); });
    },
    permisos: async function (desde, personas) {
      // Mes por mes (desde dos meses antes hasta tres después) y solo con igualdades
      if (esJefe()) {
        var d0 = U.ymd(U.addDays(U.toDate(desde), -62)), d1 = U.ymd(U.addDays(new Date(), 100)), lim = U.toDate(desde).toISOString();
        var lp = await J().porMeses('AP_Permisos', [['JefeId', '==', miPid()]], d0, d1, [['JefeId', '==', miPid()]]);
        return conAviso(lp.filter(function (p) { return p.Hasta >= lim; }), lp);
      }
      var toks = new Set(personas.map(function (p) { return p.Token; }));
      return (await AP.B.listRange('AP_Permisos', 'Hasta', desde, null)).filter(function (p) { return toks.has(p.Token); });
    },
    cambios: async function (dias, g) {
      var desde = U.addDays(new Date(), -(dias || 90));
      if (esJefe()) {
        var lc = await J().porMeses('AP_CambiosPlanta', [['JefeId', '==', miPid()]], U.ymd(desde), U.ymd(), [['JefeId', '==', miPid()]]);
        return conAviso(lc.filter(function (c) { return c.FechaHora >= desde.toISOString(); }), lc);
      }
      var l = await AP.B.listRange('AP_CambiosPlanta', 'FechaHora', desde, null);
      return g === undefined ? l : l.filter(function (c) { return (c.JefeId || '') === (g || ''); });
    }
  };

  // Grupos de personal por jefe inmediato (Director, Gobierno Corporativo, Talento Humano)
  async function grupos(todas) {
    var map = {};
    todas.forEach(function (p) { if (p.JefeId) { map[p.JefeId] = map[p.JefeId] || { id: p.JefeId, n: 0, alt: p.JefeNombre }; map[p.JefeId].n++; } });
    var lista = Object.keys(map).map(function (k) {
      var g = map[k], j = todas.find(function (x) { return x.id === k; });
      g.nombre = j ? j.Title : (g.alt || 'Jefe registrado'); g.cargo = j ? j.Cargo || '' : '';
      return g;
    }).sort(function (a, b) { return U.fold(a.nombre) < U.fold(b.nombre) ? -1 : 1; });
    return { lista: lista, sinJefe: todas.filter(function (p) { return p.Tipo === 'Personal propio' && !p.JefeId; }).length };
  }

  // ---------- Registro de cambios (no se modifica ni se borra) ----------
  AP.Planta = {
    D: D, AVISO_LEGADO: AVISO_LEGADO,
    registrarCambio: async function (tipo, referencia, detalle, n, mismoDia, semana, motivo, jefeId) {
      var u = AP.Session.user;
      var jid = esJefe() ? miPid() : (jefeId || '');
      await AP.B.create('AP_CambiosPlanta', {
        Title: tipo + ' — ' + referencia, Tipo: tipo, Semana: semana || '', Referencia: referencia, FechaHora: new Date().toISOString(),
        Usuario: u.upn, UsuarioNombre: u.nombre, Rol: AP.Session.rol, Cambios: n || 0, MismoDia: mismoDia || 0, Detalle: detalle || '', Motivo: motivo || '',
        JefeId: jid || undefined, Mes: U.ymd().slice(0, 7)
      });
    }
  };

  // ---------- Ficha de consulta de una persona (jefe con personal a cargo y Talento Humano: sin modificar nada) ----------
  // info: { estado, ctx, ausencias, permisos, jefeNombre }
  AP.Planta.ficha = function (p, info) {
    info = info || {};
    var hoy = U.ymd(), ahora = Date.now();
    var prox = [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var y = J().addYmd(hoy, i), t = info.ctx ? J().turnoDe(info.ctx, p.Token, y) : null;
      return { y: y, t: t };
    });
    var aus = (info.ausencias || []).filter(function (a) { return a.Token === p.Token && a.Estado !== 'Anulada' && new Date(a.Hasta).getTime() >= ahora; });
    var per = (info.permisos || []).filter(function (x) { return x.Token === p.Token && AP.permisoActivo(x) && new Date(x.Hasta).getTime() >= ahora; });
    var uni = puedeUniforme() ? AP.input('uni', p.NumUniforme || '', { maxlength: 20, placeholder: 'Sin número asignado' }) : null;
    var uniBtn = uni ? h('button', { class: 'btn', type: 'button', onclick: async function () {
      uniBtn.disabled = true;
      try {
        if (await guardarUniforme(p, uni.value)) { AP.toast('Número de uniforme guardado.'); if (info.despues) info.despues(); }
        else AP.toast('El número de uniforme no cambió.', 'info');
      } catch (e) { AP.toast('No se pudo guardar: ' + e.message, 'error', 9000); }
      finally { uniBtn.disabled = false; }
    } }, AP.icon('check', 18), 'Guardar número de uniforme') : null;
    AP.modal({ title: p.Title, size: 'wide', body: h('div', { class: 'stack ficha-ro' },
      h('p', { class: 'muted small' }, 'Ficha de consulta. Los datos los registra y modifica únicamente el Director de Seguridad Integral, salvo el número de uniforme, que también actualizan el jefe inmediato y Talento Humano.'),
      h('div', { class: 'kv-grid' }, kv('Documento', [p.TipoDoc, p.NumDoc].filter(Boolean).join(' ')), kv('Tipo', p.Tipo), kv('Empresa', p.Empresa), kv('Cargo', p.Cargo),
        kv('Área', p.Area), kv('Clase de personal', p.TipoPersonal), kv('Jefe inmediato', info.jefeNombre || p.JefeNombre), kv('Teléfono', p.Telefono),
        kv('Número de uniforme', p.NumUniforme), kv('Habilitación', p.Estado + (p.VigenciaHasta ? ' hasta ' + p.VigenciaHasta : '')), info.estado ? kv('Ahora (según portería)', info.estado.txt) : null),
      uni ? h('div', { class: 'filters' }, AP.field('Número de uniforme', uni), uniBtn) : null,
      h('h3', null, 'Programación de los próximos 7 días'),
      tabla([['Día', function (x) { return DIAS_LARGOS[J().dow(x.y)] + ' ' + fDia(x.y) + (J().festivo(x.y) ? ' (festivo)' : ''); }],
        ['Turno', function (x) { return x.t ? (x.t.cod === 'D' ? 'Descanso' : x.t.e ? x.t.nombre + ' ' + x.t.e + '–' + x.t.s + (x.t.fuente === 'horario' ? ' (horario general)' : '') + (x.t.xa || x.t.xd ? ' · ' + J().extraTxt(x.t) : '') : 'Sin turno') : 'Sin turno'; }]], prox),
      h('h3', null, 'Permisos vigentes y próximos'),
      per.length ? tabla([['Tipo', function (x) { return x.Tipo; }], ['Desde', function (x) { return U.fDateTime(x.Desde); }], ['Hasta', function (x) { return AP.CAT.permisosSinFin.indexOf(x.Tipo) >= 0 ? 'Sin hora final' : U.fDateTime(x.Hasta); }], ['Autoriza', function (x) { return x.AutorizadoPor; }]], per)
        : h('p', { class: 'muted small' }, 'Sin permisos vigentes ni próximos.'),
      h('h3', null, 'Ausencias registradas por Talento Humano'),
      aus.length ? tabla([['Tipo', function (a) { return a.Tipo; }], ['Desde', function (a) { return U.fDate(a.Desde); }], ['Hasta', function (a) { return U.fDate(a.Hasta); }]], aus)
        : h('p', { class: 'muted small' }, 'Sin ausencias vigentes ni próximas.')) });
  };

  // ---------- Número de uniforme: lo actualizan el Director, el jefe inmediato (de su personal) y Talento Humano ----------
  function puedeUniforme() { return AP.Session.can('editar') || esJefe() || esTH(); }
  async function guardarUniforme(p, v) {
    v = String(v || '').trim().slice(0, 20);
    var antes = p.NumUniforme || '';
    if (v === antes) return false;
    await AP.B.update('AP_Personas', p.id, { NumUniforme: v });
    p.NumUniforme = v;
    var det = (antes || 'sin número') + ' → ' + (v || 'sin número');
    try { await AP.Planta.registrarCambio('Número de uniforme', p.Title, det, 1, 0, '', '', p.JefeId || ''); } catch (e) { /* el registro de cambios es complementario */ }
    await AP.Audit.log('Número de uniforme', p.Title + ' — ' + (p.NumDoc || ''), det);
    return true;
  }
  AP.Planta.puedeUniforme = puedeUniforme;
  // Varios números de uniforme a la vez
  AP.Planta.uniformes = function (personas, despues) {
    var l = personas.filter(function (p) { return p.Estado === 'Habilitado'; }).slice().sort(porNombre);
    if (!l.length) return AP.toast('No hay personas habilitadas en la lista.', 'warn');
    AP.modal({ title: 'Números de uniforme', size: 'wide', body: function (close) {
      var inputs = {};
      var filtro = h('input', { type: 'search', class: 'af-input', placeholder: 'Filtrar por nombre, documento, cargo o número de uniforme' });
      var cuerpo = h('tbody');
      function pintar() {
        var vis = l.filter(function (p) { return AP.coincide(p, filtro.value, ['Title', 'NumDoc', 'Cargo', 'Area', 'NumUniforme']); });
        cuerpo.replaceChildren.apply(cuerpo, vis.length ? vis.map(function (p) {
          var inp = inputs[p.id] = inputs[p.id] || AP.input('u_' + p.id, p.NumUniforme || '', { maxlength: 20, placeholder: 'Sin número', 'aria-label': 'Número de uniforme de ' + p.Title });
          return h('tr', null, h('td', { 'data-label': 'Persona' }, h('strong', null, p.Title), h('small', { class: 'block muted' }, [p.NumDoc, p.Cargo, p.Area].filter(Boolean).join(' · '))),
            h('td', { 'data-label': 'Número de uniforme' }, inp));
        }) : [h('tr', null, h('td', { colspan: 2, class: 'center muted' }, 'Sin registros'))]);
      }
      filtro.addEventListener('input', U.debounce(pintar, 150)); pintar();
      var prog = h('small', { class: 'muted' });
      var btn = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
        var ch = l.filter(function (p) { return inputs[p.id] && inputs[p.id].value.trim() !== (p.NumUniforme || ''); });
        if (!ch.length) return AP.toast('No hay cambios por guardar.', 'info');
        btn.disabled = true;
        var n = 0;
        try {
          for (var i = 0; i < ch.length; i++) { prog.textContent = 'Guardando ' + (i + 1) + ' de ' + ch.length + '…'; if (await guardarUniforme(ch[i], inputs[ch[i].id].value)) n++; }
          close(); AP.toast(n + ' número(s) de uniforme guardado(s).');
          if (despues) despues();
        } catch (e) { AP.toast('No se pudo guardar (' + n + ' guardado(s) antes del error): ' + e.message, 'error', 9000); btn.disabled = false; }
      } }, AP.icon('check', 18), 'Guardar');
      return h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, 'Escriba o corrija el número de uniforme de cada persona y oprima «Guardar». Solo se guardan los que cambiaron; cada cambio queda en el registro de cambios y en la bitácora.'),
        filtro, h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl no-filtro' }, h('thead', null, h('tr', null, h('th', null, 'Persona'), h('th', null, 'Número de uniforme'))), cuerpo)),
        prog, h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), btn));
    } });
  };

  // ---------- Tablero del estado del personal (también lo usa Talento Humano) ----------
  // opt: { clases: bool, claseDef: '' | 'operativas' | clase, onRow: fn(fila) }
  AP.Planta.tablero = function (box, personas, ctx, movs, ausencias, opt) {
    opt = opt || {};
    var grupos0 = J().agrupar(movs);
    var filas = personas.filter(function (p) { return p.Estado === 'Habilitado'; }).map(function (p) { return { p: p, e: J().estadoAhora(p, grupos0, ctx, ausencias) }; });
    var uniq = function (k) { return Array.from(new Set(filas.map(function (f) { return f.p[k] || ''; }).filter(Boolean))).sort(); };
    var fArea = AP.select('area', [['', 'Todas las áreas']].concat(uniq('Area')), '');
    var fCargo = AP.select('cargo', [['', 'Todos los cargos']].concat(uniq('Cargo')), '');
    var fEst = AP.select('est', [['', 'Todos los estados'], ['dentro', 'En planta (adentro)'], ['fuera', 'Fuera de planta'], ['falta', 'No ha llegado'], ['noasistio', 'Sin ingreso en su turno'], ['programado', 'Programado más tarde'],
      ['salio', 'Ya salió'], ['ausente', 'Ausencia registrada'], ['descanso', 'Descanso'], ['sin', 'Sin turno hoy']], '');
    var fClase = opt.clases ? AP.select('clase', [['', 'Toda clase de personal'], ['operativas', 'Operarios y personal operativo']].concat(AP.CAT.tiposPersonal), opt.claseDef || '') : null;
    // opt.jefe(p) → nombre del jefe inmediato: agrega el filtro y el dato (vista de todo el personal)
    var jefeTxt = function (p) { return opt.jefe ? opt.jefe(p) || 'Sin jefe inmediato' : ''; };
    var fJefe = opt.jefe ? AP.select('jefe', [['', 'Todos los jefes inmediatos']].concat(Array.from(new Set(filas.map(function (f) { return jefeTxt(f.p); }))).sort(function (a, b) { return U.fold(a) < U.fold(b) ? -1 : 1; })), '') : null;
    var q = AP.buscador(opt.jefe ? 'Buscar nombre, documento, uniforme, cargo, área o jefe' : 'Buscar nombre, documento, uniforme, cargo o área', pintar);
    var out = h('div', { class: 'stack' });
    [fArea, fCargo, fEst, fClase, fJefe].filter(Boolean).forEach(function (s) { s.addEventListener('change', pintar); });
    // sinEstado: cuenta cada situación respetando los demás filtros pero sin el filtro de estado (para las tarjetas)
    function filtradas(sinEstado) {
      return filas.filter(function (f) {
        if (fArea.value && f.p.Area !== fArea.value) return false;
        if (fCargo.value && f.p.Cargo !== fCargo.value) return false;
        if (!sinEstado) {
          if (fEst.value === 'fuera') { if (f.e.k === 'dentro') return false; }
          else if (fEst.value && f.e.k !== fEst.value) return false;
        }
        if (fClase && fClase.value === 'operativas') { if (AP.CAT.clasesOperativas.indexOf(f.p.TipoPersonal) < 0) return false; }
        else if (fClase && fClase.value && f.p.TipoPersonal !== fClase.value) return false;
        if (fJefe && fJefe.value && jefeTxt(f.p) !== fJefe.value) return false;
        return AP.coincide(f.p, q.value, ['Title', 'NumDoc', 'Cargo', 'Area', 'NumUniforme', jefeTxt]);
      });
    }
    // Cada tarjeta es un botón: al oprimirla se muestran las personas en esa situación (vuelve a oprimirla para ver todas)
    function tarjeta(valor, num, texto, kind) {
      var activa = fEst.value === valor;
      return h('button', { type: 'button', class: 'kpi kpi-link' + (kind ? ' ' + kind : '') + (activa ? ' on' : ''), 'aria-pressed': activa ? 'true' : 'false',
        onclick: function () {
          fEst.value = activa ? '' : valor;
          pintar();
          if (window.innerWidth < 900) { var t = out.querySelector('.tbl-scroll'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        } }, h('strong', null, String(num)), h('span', null, texto));
    }
    function pintar() {
      var base = filtradas(true), l = filtradas(), n = function (k) { return base.filter(function (f) { return f.e.k === k; }).length; };
      var orden = { falta: 0, noasistio: 1, dentro: 2, programado: 3, salio: 4, ausente: 5, descanso: 6, sin: 7 };
      var tit = fEst.value ? AP.textoOpcion(fEst) : 'Todas las personas';
      out.replaceChildren(
        h('div', { class: 'kpis' }, tarjeta('', base.length, 'Personas en la vista'), tarjeta('dentro', n('dentro'), 'En planta ahora (adentro)', 'brand'), tarjeta('fuera', base.length - n('dentro'), 'Fuera de planta'),
          tarjeta('falta', n('falta'), 'No han llegado a su turno', n('falta') ? 'deny' : ''), tarjeta('noasistio', n('noasistio'), 'Sin ingreso en su turno de hoy', n('noasistio') ? 'warn' : ''),
          tarjeta('programado', n('programado'), 'Programados más tarde'), tarjeta('ausente', n('ausente'), 'Con ausencia registrada'), tarjeta('salio', n('salio'), 'Ya salieron'),
          tarjeta('descanso', n('descanso'), 'En descanso hoy'), tarjeta('sin', n('sin'), 'Sin turno hoy')),
        h('p', { class: 'muted small' }, tit + ': ' + l.length + (l.length === 1 ? ' persona' : ' personas') + '. Oprima una tarjeta para ver solo a las personas en esa situación.'),
        tabla([
          ['Persona', function (f) { return h('div', null, h('strong', null, f.p.Title), h('small', { class: 'block muted' }, [f.p.NumDoc, f.p.NumUniforme ? 'Uniforme ' + f.p.NumUniforme : '', f.p.Cargo, f.p.Area, opt.clases ? f.p.TipoPersonal : ''].filter(Boolean).join(' · '))); }],
          opt.jefe ? ['Jefe inmediato', function (f) { return jefeTxt(f.p); }] : null,
          ['Turno de hoy', function (f) { return f.e.turno || '—'; }],
          ['Estado según portería', function (f) { return h('div', null, AP.pill(f.e.txt, f.e.kind), f.e.nov ? h('small', { class: 'block txt-warn' }, f.e.nov) : null); }],
          opt.onRow ? ['', function (f) { return h('button', { class: 'btn small', type: 'button', onclick: function () { opt.onRow(f); } }, AP.icon('eye', 16), 'Ficha'); }] : null
        ].filter(Boolean), l.slice().sort(function (a, b) { return (orden[a.e.k] - orden[b.e.k]) || porNombre(a.p, b.p); }), opt.onRow));
    }
    box.replaceChildren(
      h('div', { class: 'banner info' }, AP.icon('clock', 18), h('span', null, 'Estado a las ' + U.fTime(new Date()) + ' según los registros de ingreso y salida de portería, la programación de turnos y las ausencias de Talento Humano. ' +
        '«En planta» = su último registro en portería es un ingreso. Los registros hechos sin conexión aparecen cuando el celular de portería los envía.')),
      opt.aviso ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, opt.aviso)) : null,
      h('div', { class: 'filters' }, fClase, fJefe, fArea, fCargo, fEst, q, opt.uniformes ? h('button', { class: 'btn', type: 'button', onclick: opt.uniformes }, AP.icon('edit', 18), 'Números de uniforme') : null, AP.btnExcel(function () {
        var l = filtradas();
        if (!l.length) return AP.toast('No hay personas con el filtro actual.', 'warn');
        AP.exportar('Estado_del_personal', [['Persona', function (f) { return f.p.Title; }, 30], ['Documento', function (f) { return f.p.NumDoc; }, 15], ['Número de uniforme', function (f) { return f.p.NumUniforme; }, 11], ['Clase', function (f) { return f.p.TipoPersonal; }, 14],
          ['Cargo', function (f) { return f.p.Cargo; }, 22], ['Área', function (f) { return f.p.Area; }, 18]].concat(opt.jefe ? [['Jefe inmediato', function (f) { return jefeTxt(f.p); }, 28]] : [], [['Turno de hoy', function (f) { return f.e.turno; }, 22],
          ['Estado según portería', function (f) { return f.e.txt; }, 34], ['Novedad', function (f) { return f.e.nov; }, 30]]), l, 'xlsx',
          [['Corte', U.fDateTime(new Date())], ['Filtro', [fClase && AP.textoOpcion(fClase), fJefe && fJefe.value, fArea.value, fCargo.value, fEst.value, q.value].filter(Boolean).join(' · ') || 'ninguno'],
            ['Fuente', 'Registros de ingreso y salida de portería, programación de turnos y ausencias de Talento Humano'], ['Generado por', AP.Session.user.nombre]]);
      })), out);
    pintar();
  };

  // ---------- Horas extra (trabajo suplementario) ----------
  // Se asignan al turno programado de la persona en un día: minutos antes de la entrada y después de la salida. Límite de
  // referencia: 2 horas extra diarias y 12 semanales (art. 167A del Código Sustantivo del Trabajo). Desde la Ley 2466 de
  // 2025 no se pide permiso al Ministerio del Trabajo, pero el empleador debe llevar el registro del trabajo suplementario:
  // esta programación, con su motivo y el registro de cambios, le sirve de soporte. Los límites se ajustan en
  // AP.CFG.jornada (maxExtraDia, maxExtraSemana). El Jefe no puede superarlos; el Director, solo confirmándolo.
  function maxExtraDia() { return Number(((AP.CFG || {}).jornada || {}).maxExtraDia) || 2; }
  function maxExtraSemana() { return Number(((AP.CFG || {}).jornada || {}).maxExtraSemana) || 12; }
  function esDirector() { return AP.Session.can('editar'); }
  var OPS_EXTRA = [[0, 'Sin horas extra'], [30, '30 min'], [60, '1 h'], [90, '1 h 30 min'], [120, '2 h'], [150, '2 h 30 min'], [180, '3 h'], [240, '4 h']];
  function opsExtra(v) { v = Number(v) || 0; return OPS_EXTRA.some(function (o) { return o[0] === v; }) ? OPS_EXTRA : OPS_EXTRA.concat([[v, J().durTxt(v)]]); }
  function extraCorto(a, d) { return [a ? J().durTxt(a) + ' antes' : '', d ? J().durTxt(d) + ' después' : ''].filter(Boolean).join(' y ') || 'sin horas extra'; }
  function semanasEntre(a, b) { var out = [], l = J().lunes(a); while (l <= b) { out.push(l); l = J().addYmd(l, 7); } return out; }
  function diasEntre(a, b) { var out = [], y = a; while (y <= b && out.length < 400) { out.push(y); y = J().addYmd(y, 1); } return out; }
  function diaCorto(y) { return DIAS[(J().dow(y) + 6) % 7] + ' ' + y.slice(8) + '/' + y.slice(5, 7); }
  function rangoTxt(a, b) { return a === b ? fDia(a) : 'del ' + fDia(a) + ' al ' + fDia(b); }

  // Programación guardada de un rango de fechas (contexto para turnoDe)
  async function progRango(g, personal, a, b) {
    var docs = await D.semanas(a, b, g);
    return { semanas: J().indexarSemanas(docs, personal), horarios: [], docs: docs };
  }
  // Filas «persona en un turno» de un rango: { key, p, cod, nombre, e, s, dias: [fechas], horas, extra (min), detExtra }
  // Quien no tiene ningún turno ni descanso en el rango aparece con cod '' (sin programar)
  function filasTurno(ctx, personal, a, b) {
    var m = {}, dias = diasEntre(a, b);
    personal.forEach(function (p) {
      var alguno = false;
      dias.forEach(function (y) {
        var t = J().turnoDe(ctx, p.Token, y);
        if (!t || t.fuente !== 'planta' || !t.cod) return;
        alguno = true;
        var k = p.id + '|' + t.cod;
        var f = m[k] = m[k] || { key: k, p: p, cod: t.cod, nombre: t.cod === 'D' ? 'Descanso' : t.nombre, e: t.e, s: t.s, dias: [], horas: 0, extra: 0, detExtra: [] };
        f.dias.push(y);
        f.horas += J().horasTurno(t);
        if (t.xa || t.xd) { f.extra += t.xa + t.xd; f.detExtra.push(diaCorto(y) + ': ' + extraCorto(t.xa, t.xd)); }
      });
      if (!alguno && p.Estado === 'Habilitado') m[p.id + '|'] = { key: p.id + '|', p: p, cod: '', nombre: 'Sin turno', dias: [], horas: 0, extra: 0, detExtra: [] };
    });
    return Object.keys(m).map(function (k) { return m[k]; });
  }

  // ---------- Excel de la programación por turnos (una hoja por turno, día por día) ----------
  async function excelPorTurnos(g, gNombre, personal, desdeYmd, hastaYmd) {
    var docs = await D.semanas(desdeYmd, hastaYmd, g);
    var ctx = { semanas: J().indexarSemanas(docs, personal), horarios: [] };
    var porTurno = {}, desc = [], resumen = {};
    diasEntre(desdeYmd, hastaYmd).forEach(function (y) {
      personal.forEach(function (p) {
        var t = J().turnoDe(ctx, p.Token, y);
        if (!t || t.fuente !== 'planta' || !t.cod) return;
        var fila = { fecha: y, p: p, t: t };
        if (t.cod === 'D') { desc.push(fila); return; }
        var k = t.cod + ' · ' + (t.nombre || t.cod) + ' ' + (t.e || '') + '–' + (t.s || '');
        (porTurno[k] = porTurno[k] || []).push(fila);
        resumen[k] = resumen[k] || { personas: new Set(), dias: 0, horas: 0, extra: 0 };
        resumen[k].personas.add(p.id); resumen[k].dias++; resumen[k].horas += J().horasTurno(t); resumen[k].extra += J().horasExtra(t);
      });
    });
    var claves = Object.keys(porTurno).sort();
    if (!claves.length && !desc.length) return AP.toast('No hay turnos programados en ese periodo.', 'warn');
    var r1 = function (x) { return Math.round(x * 100) / 100; };
    var colsFila = [['Fecha', function (f) { return f.fecha; }, 11], ['Día', function (f) { return DIAS_LARGOS[J().dow(f.fecha)]; }, 10], ['Festivo', function (f) { return J().festivo(f.fecha) || ''; }, 16],
      ['Persona', function (f) { return f.p.Title; }, 30], ['Documento', function (f) { return f.p.NumDoc; }, 14], ['Cargo', function (f) { return f.p.Cargo; }, 22], ['Área', function (f) { return f.p.Area; }, 16],
      ['Entrada', function (f) { return f.t.e || ''; }, 8], ['Salida', function (f) { return f.t.s || ''; }, 8], ['Horas del turno', function (f) { return r1(J().horasTurno(f.t)); }, 9],
      ['Horas extra', function (f) { return r1(J().horasExtra(f.t)); }, 9], ['Detalle de horas extra', function (f) { return J().extraTxt(f.t).replace('Horas extra: ', ''); }, 34],
      ['Motivo de las horas extra', function (f) { return f.t.xm || ''; }, 30]];
    var orden = function (l) { return l.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : porNombre(a.p, b.p); }); };
    var hojas = [{ sheet: 'Resumen', rows: claves, cols: [['Turno', function (k) { return k; }, 34], ['Personas distintas', function (k) { return resumen[k].personas.size; }, 12],
      ['Turnos asignados (días-persona)', function (k) { return resumen[k].dias; }, 14], ['Horas programadas', function (k) { return r1(resumen[k].horas); }, 12], ['Horas extra programadas', function (k) { return r1(resumen[k].extra); }, 12]] }];
    claves.forEach(function (k, i) { hojas.push({ sheet: ('T' + (i + 1) + ' ' + k.split(' · ')[0]).replace(/[\\\/?*\[\]:]/g, '').slice(0, 28), rows: orden(porTurno[k]), cols: colsFila }); });
    if (desc.length) hojas.push({ sheet: 'Descansos', rows: orden(desc), cols: colsFila.slice(0, 7) });
    await AP.exportarHojas('Programacion_por_turnos_' + desdeYmd + '_a_' + hastaYmd, hojas, [['Grupo', gNombre], ['Periodo', desdeYmd + ' a ' + hastaYmd],
      ['Turnos', claves.join(' | ')], ['Horas extra', 'Límite de referencia: ' + maxExtraDia() + ' h diarias y ' + maxExtraSemana() + ' h semanales (art. 167A del Código Sustantivo del Trabajo)'],
      ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Programación semanal de planta (AP_ProgPlanta)']]);
  }
  function modalExcelTurnos(g, gNombre, personal, rango) {
    var lun = J().lunes(U.ymd());
    AP.modal({ title: 'Descargar la programación por turnos', body: function (close) {
      var a = AP.input('a', rango ? rango[0] : lun, { type: 'date' }), b = AP.input('b', rango ? rango[1] : J().addYmd(lun, 13), { type: 'date' });
      return h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, 'Un archivo de Excel con una hoja por turno (quién está en cada turno, día por día, con sus horas extra), una hoja de descansos y un resumen. Máximo 92 días.'),
        h('div', { class: 'form-grid' }, AP.field('Desde', a), AP.field('Hasta', b)),
        h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
          h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            if (!a.value || !b.value || b.value < a.value) return AP.toast('Revise el periodo.', 'warn');
            if ((U.fromLocal(b.value, '12:00') - U.fromLocal(a.value, '12:00')) / 864e5 > 92) return AP.toast('Máximo 92 días por archivo.', 'warn');
            try { close(); await excelPorTurnos(g, gNombre, personal, a.value, b.value); } catch (e) { AP.toast(e.message, 'error'); }
          } }, AP.icon('download', 18), 'Descargar')));
    } });
  }

  // ---------- Asignar personas a un turno en un rango de fechas ----------
  // Escribe la programación semana por semana (cada semana queda con su versión y su registro de cambios). Mientras se
  // elige, la lista muestra qué tiene ya programado cada persona en ese rango (para no repetir ni pisar asignaciones).
  // opt: { rango: [desde, hasta], ids: [pid] }; despues(r) recibe { a, b, cod, cambios }
  function asignarTurno(g, gNombre, personal, tps, turno0, despues, opt) {
    opt = opt || {};
    var hoy = U.ymd(), lun = J().lunes(hoy);
    AP.modal({ title: 'Asignar personas a un turno', size: 'wide', body: function (close) {
      var opsT = tps.filter(function (t) { return t.Activo !== false; }).map(function (t) { return [t.Codigo, t.Codigo + ' · ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida]; }).concat([['D', 'D · Descanso'], ['X', 'Quitar el turno asignado']]);
      var tSel = AP.select('turno', opsT, turno0 || (opsT[0] || [''])[0]);
      var r0 = opt.rango || [J().addYmd(lun, 7), J().addYmd(lun, 13)];
      var desde = AP.input('desde', r0[0], { type: 'date' }), hasta = AP.input('hasta', r0[1], { type: 'date' });
      var RAP = [['Resto de esta semana', J().addYmd(hoy, 1), J().addYmd(lun, 6)], ['Próxima semana', J().addYmd(lun, 7), J().addYmd(lun, 13)],
        ['Próximas 2 semanas', J().addYmd(lun, 7), J().addYmd(lun, 20)], ['Próximas 4 semanas', J().addYmd(lun, 7), J().addYmd(lun, 34)]].filter(function (x) { return x[1] <= x[2]; });
      var rapidos = h('div', { class: 'row gap wrap' }, h('small', { class: 'muted' }, 'Fechas rápidas:'), RAP.map(function (x) {
        return h('button', { class: 'btn small', type: 'button', onclick: function () { desde.value = x[1]; hasta.value = x[2]; refrescar(); } }, x[0]);
      }));
      var dias = AP.CAT.dias.map(function (d) { var c = h('input', { type: 'checkbox', checked: d[0] !== '0' }); c.dataset.d = d[0]; c.addEventListener('change', function () { refrescar(); }); return { d: d[0], el: c, lab: h('label', { class: 'check' }, c, h('span', null, d[1])) }; });
      var elegidos = new Set(opt.ids || []);
      var lista = h('div', { class: 'pick-list' });
      var filtro = h('input', { type: 'search', class: 'af-input', placeholder: 'Filtrar por nombre, documento, cargo o área' });
      var fVer = AP.select('ver', [['', 'Todas las personas'], ['sin', 'Sin turno en esas fechas'], ['este', 'Ya están en el turno elegido'], ['otro', 'En otro turno o en descanso']], '');
      var resumen = h('p', { class: 'muted small' });
      var hab = personal.filter(function (p) { return p.Estado === 'Habilitado'; });
      var estado = {}, seq = 0;
      function codTxt(c) { return c === 'D' ? 'Descanso' : c; }
      function diasSel() { return dias.filter(function (x) { return x.el.checked; }).map(function (x) { return x.d; }); }
      // Lo que ya tiene programado cada persona en los días elegidos
      var refrescar = U.debounce(async function () {
        var a = desde.value, b = hasta.value, cod = tSel.value, ds = diasSel();
        if (!a || !b || b < a || (U.fromLocal(b, '12:00') - U.fromLocal(a, '12:00')) / 864e5 > 92) { estado = {}; resumen.textContent = ''; pintarLista(); return; }
        var n = ++seq;
        resumen.textContent = 'Consultando lo que ya está programado en esas fechas…';
        try {
          var ctx = await progRango(g, personal, a, b);
          if (n !== seq) return;
          var fechas = diasEntre(a, b).filter(function (y) { return ds.indexOf(String(J().dow(y))) >= 0; });
          estado = {};
          hab.forEach(function (p) {
            var e = estado[p.id] = { este: 0, otros: {}, sin: 0, total: fechas.length };
            fechas.forEach(function (y) {
              var t = J().turnoDe(ctx, p.Token, y), c = t && t.fuente === 'planta' ? t.cod : '';
              if (c && c === cod) e.este++; else if (c) e.otros[c] = (e.otros[c] || 0) + 1; else e.sin++;
            });
          });
          var ya = hab.filter(function (p) { return estado[p.id].este; }).length, sinT = hab.filter(function (p) { var e = estado[p.id]; return e.sin === e.total; }).length;
          resumen.textContent = (cod === 'X' ? '' : ya + ' persona(s) ya tienen ' + (cod === 'D' ? 'descanso' : 'el turno ' + cod) + ' en esas fechas · ') + sinT + ' sin ningún turno programado en esas fechas.';
          pintarLista();
        } catch (e) { if (n === seq) resumen.textContent = 'No se pudo consultar lo programado: ' + e.message; }
      }, 250);
      function insignia(e) {
        if (!e) return null;
        var cod = tSel.value;
        if (e.este && e.este === e.total) return AP.pill('Ya en ' + codTxt(cod) + ' todos esos días', 'ok');
        var partes = [];
        if (e.este) partes.push(codTxt(cod) + ': ' + e.este + ' día(s)');
        Object.keys(e.otros).sort().forEach(function (c) { partes.push(codTxt(c) + ': ' + e.otros[c] + ' día(s)'); });
        if (!partes.length) return AP.pill('Sin turno', 'muted');
        if (e.sin) partes.push('sin turno: ' + e.sin + ' día(s)');
        return AP.pill(partes.join(' · '), e.este ? 'ok' : 'warn');
      }
      function visibles() {
        var t = filtro.value, v = fVer.value;
        return hab.filter(function (p) {
          var e = estado[p.id];
          if (v && e) {
            if (v === 'sin' && e.sin !== e.total) return false;
            if (v === 'este' && !e.este) return false;
            if (v === 'otro' && !Object.keys(e.otros).length) return false;
          }
          return AP.coincide(p, t, ['Title', 'NumDoc', 'Cargo', 'Area']);
        });
      }
      function pintarLista() {
        var l = visibles();
        lista.replaceChildren.apply(lista, l.length ? l.map(function (p) {
          var cb = h('input', { type: 'checkbox', checked: elegidos.has(p.id) });
          cb.addEventListener('change', function () { if (cb.checked) elegidos.add(p.id); else elegidos.delete(p.id); contar(); });
          return h('label', null, cb, h('span', { class: 'grow' }, p.Title, h('small', { class: 'muted' }, ' · ' + [p.Cargo, p.Area].filter(Boolean).join(' · '))), insignia(estado[p.id]));
        }) : [h('p', { class: 'muted small' }, 'Nadie coincide con el filtro.')]);
        contar();
      }
      var cuenta = h('small', { class: 'muted' }, '0 seleccionada(s)');
      function contar() { cuenta.textContent = elegidos.size + ' seleccionada(s)'; }
      filtro.addEventListener('input', U.debounce(pintarLista, 150));
      fVer.addEventListener('change', pintarLista);
      [tSel, desde, hasta].forEach(function (el) { el.addEventListener('change', function () { refrescar(); }); });
      pintarLista(); refrescar();
      var motivo = AP.textarea('motivo', '', { rows: 2, placeholder: 'Obligatorio si las fechas incluyen hoy o días anteriores' });
      var prog = h('div');
      var btn = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
        var a = desde.value, b = hasta.value, ds = diasSel();
        if (!tSel.value) return AP.toast('Cree primero un turno en «Turnos».', 'warn');
        if (!a || !b || b < a) return AP.toast('Revise el rango de fechas.', 'warn');
        if ((U.fromLocal(b, '12:00') - U.fromLocal(a, '12:00')) / 864e5 > 92) return AP.toast('Asigne máximo 92 días por vez.', 'warn');
        if (!ds.length) return AP.toast('Marque al menos un día de la semana.', 'warn');
        if (!elegidos.size) return AP.toast('Seleccione al menos una persona.', 'warn');
        if (a <= hoy && motivo.value.trim().length < 6) return AP.toast('Las fechas incluyen hoy o días anteriores: escriba el motivo del cambio.', 'warn');
        if (RE_SALUD.test(motivo.value)) return AP.toast('El motivo parece contener información de salud (dato sensible). Escriba solo el hecho general.', 'warn', 8000);
        btn.disabled = true;
        try {
          var r = await aplicarAsignacion(g, gNombre, personal, tps, tSel.value, a, b, ds, Array.from(elegidos), motivo.value.trim(), function (txt) { prog.textContent = txt; });
          close();
          if (!r.cambios) AP.toast('No hubo cambios: las personas elegidas ya tenían esa programación en esas fechas.', 'info', 7000);
          else AP.toast(r.cambios + ' día(s) asignado(s) ' + rangoTxt(a, b) + '. La portería lo recibe en su próxima actualización.', 'info', 8000);
          if (despues) despues({ a: a, b: b, cod: tSel.value, cambios: r.cambios });
        } catch (e) { AP.toast('No se pudo completar: ' + e.message, 'error', 9000); btn.disabled = false; }
      } }, AP.icon('check', 18), 'Asignar');
      return h('div', { class: 'stack' },
        h('div', { class: 'form-grid' }, AP.field('Turno *', tSel, null, 'span2'), AP.field('Desde *', desde), AP.field('Hasta (inclusive) *', hasta)),
        rapidos,
        AP.field('Días de la semana *', h('div', { class: 'chk-dias' }, dias.map(function (x) { return x.lab; }))),
        h('div', { class: 'stack sm' }, h('div', { class: 'row between wrap gap' }, h('strong', null, 'Personas'), cuenta), resumen,
          h('div', { class: 'filters' }, filtro, fVer), lista,
          h('div', { class: 'row gap' }, h('button', { class: 'btn small', type: 'button', onclick: function () { visibles().forEach(function (p) { elegidos.add(p.id); }); pintarLista(); } }, 'Todas las visibles'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: function () { elegidos.clear(); pintarLista(); } }, 'Ninguna'))),
        AP.field('Motivo o nota del cambio', motivo),
        h('p', { class: 'note small' }, 'La asignación reemplaza, en los días marcados, el turno que la persona tuviera (si pasa a descanso o queda sin turno, se quitan sus horas extra de ese día). Cada semana afectada queda en el registro de cambios.'),
        prog,
        h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), btn));
    } });
  }
  // opt.soloCod: solo cambia los días en que la persona tiene ese turno (quitar del turno); opt.tipo: nombre del cambio
  async function aplicarAsignacion(g, gNombre, personal, tps, cod, a, b, diasSemana, ids, motivo, progreso, opt) {
    opt = opt || {};
    var hoy = U.ymd(), t = tps.find(function (x) { return x.Codigo === cod; });
    var semanas = semanasEntre(a, b);
    var total = 0, mismo = 0, tocadas = 0;
    for (var i = 0; i < semanas.length; i++) {
      var s = semanas[i];
      if (progreso) progreso('Guardando la semana del ' + fDia(s) + ' (' + (i + 1) + ' de ' + semanas.length + ')…');
      var doc = await D.semana(s, g);
      if (opt.soloCod && !doc) continue;
      var datos = AP.Horario.jsonDe(doc && doc.Datos, {}), snap = AP.Horario.jsonDe(doc && doc.Turnos, {});
      var det = [], n = 0, md = 0;
      ids.forEach(function (pid) {
        var p = personal.find(function (x) { return x.id === pid; });
        if (!p || (opt.soloCod && !datos[pid])) return;
        var x = datos[pid] = datos[pid] || { t: p.Token, n: p.Title, doc: p.NumDoc || '', a: p.Area || '', d: {} };
        x.t = p.Token; x.n = p.Title; x.a = p.Area || '';
        for (var k = 0; k < 7; k++) {
          var y = J().addYmd(s, k);
          if (y < a || y > b || diasSemana.indexOf(String(J().dow(y))) < 0) continue;
          var antes = x.d[y] || '', despues = cod === 'X' ? '' : cod;
          if (opt.soloCod && antes !== opt.soloCod) continue;
          if (antes === despues) continue;
          if (despues) x.d[y] = despues; else delete x.d[y];
          // Sin turno o en descanso, las horas extra de ese día se quitan
          var quitaExtra = !!(x.x && x.x[y] && (!despues || despues === 'D'));
          if (quitaExtra) { delete x.x[y]; if (!Object.keys(x.x).length) delete x.x; }
          n++; if (y <= hoy) md++;
          det.push(p.Title + ' — ' + DIAS[k] + ' ' + fDia(y) + ': ' + (antes || 'sin turno') + ' → ' + (despues || 'sin turno') + (quitaExtra ? ' (se quitan sus horas extra)' : '') + (y <= hoy ? ' (día ya iniciado)' : ''));
        }
        if (!Object.keys(x.d).length) delete datos[pid];
      });
      if (!n) continue;
      var usados = {};
      Object.keys(datos).forEach(function (pid) { Object.keys(datos[pid].d || {}).forEach(function (y) { var c = datos[pid].d[y]; if (c && c !== 'D') usados[c] = 1; }); });
      if (t) snap[cod] = { n: t.Title, e: t.HoraEntrada, s: t.HoraSalida };
      Object.keys(snap).forEach(function (c) { if (!usados[c]) delete snap[c]; });
      var reg = { Title: 'Semana del ' + s + (gNombre ? ' — ' + gNombre : ''), Semana: s, Desde: U.fromLocal(s, '00:00').toISOString(), Datos: JSON.stringify(datos), Turnos: JSON.stringify(snap),
        Version: ((doc && doc.Version) || 0) + 1, JefeId: g || undefined, JefeNombre: gNombre || undefined };
      if (doc) await AP.B.update('AP_ProgPlanta', doc.id, reg); else await AP.B.create('AP_ProgPlanta', reg);
      await AP.Planta.registrarCambio(opt.tipo || 'Asignación de turno', 'Semana del ' + fDia(s) + ' — ' + (opt.soloCod ? 'quitar del turno ' + opt.soloCod : cod === 'X' ? 'quitar turno' : cod === 'D' ? 'descanso' : cod), det.join('\n'), n, md, s, motivo, g);
      total += n; mismo += md; tocadas++;
    }
    if (total) await AP.Audit.log(opt.tipo ? 'Programación de planta: ' + opt.tipo.toLowerCase() : 'Asignación de turno de planta', (gNombre || 'Sin jefe inmediato') + ' — ' + (opt.soloCod || cod), total + ' cambio(s) entre ' + a + ' y ' + b + (mismo ? ', ' + mismo + ' en días ya iniciados' : '') + (motivo ? '. Motivo: ' + motivo : ''));
    return { cambios: total, semanas: tocadas };
  }

  // Prepara la asignación de horas extra (no guarda): solo en los días en que la persona tiene un turno programado
  // (no en descanso ni sin turno). Revisa los límites diario y semanal (lunes a domingo).
  async function prepararExtras(g, personal, a, b, ids, xa, xd, motivo, soloCod) {
    var hoy = U.ymd(), out = { semanas: [], n: 0, md: 0, excesos: [], personas: new Set() };
    var limD = maxExtraDia() * 60, limS = maxExtraSemana() * 60;
    var semanas = semanasEntre(a, b);
    for (var i = 0; i < semanas.length; i++) {
      var s = semanas[i], doc = await D.semana(s, g);
      if (!doc) continue;
      var datos = AP.Horario.jsonDe(doc.Datos, {}), snap = AP.Horario.jsonDe(doc.Turnos, {}), det = [], n = 0, md = 0;
      ids.forEach(function (pid) {
        var p = personal.find(function (x) { return x.id === pid; }), x = datos[pid], cambio = false;
        if (!p || !x) return;
        for (var k = 0; k < 7; k++) {
          var y = J().addYmd(s, k), cod = (x.d || {})[y];
          if (y < a || y > b || !cod || cod === 'D' || (soloCod && cod !== soloCod)) continue;
          var prev = (x.x || {})[y], pa = prev ? Number(prev.a) || 0 : 0, pd = prev ? Number(prev.d) || 0 : 0;
          if (pa === xa && pd === xd) continue;
          x.x = x.x || {};
          if (xa || xd) x.x[y] = { a: xa, d: xd, m: motivo }; else delete x.x[y];
          if (!Object.keys(x.x).length) delete x.x;
          n++; cambio = true; out.personas.add(pid); if (y <= hoy) md++;
          var tt = snap[cod] || {};
          det.push(p.Title + ' — ' + DIAS[k] + ' ' + fDia(y) + ' (' + cod + (tt.e ? ' ' + tt.e + '–' + tt.s : '') + '): ' + extraCorto(pa, pd) + ' → ' + extraCorto(xa, xd) + (y <= hoy ? ' (día ya iniciado)' : ''));
          if (xa + xd > limD) out.excesos.push(p.Title + ', ' + fDia(y) + ': ' + J().durTxt(xa + xd) + ' en el día');
        }
        if (cambio && (xa || xd)) {
          var tot = 0;
          Object.keys(x.x || {}).forEach(function (y) { tot += (Number(x.x[y].a) || 0) + (Number(x.x[y].d) || 0); });
          if (tot > limS) out.excesos.push(p.Title + ', semana del ' + fDia(s) + ': ' + J().durTxt(tot) + ' en la semana');
        }
      });
      if (n) { out.semanas.push({ s: s, doc: doc, datos: datos, snap: snap, det: det, n: n, md: md }); out.n += n; out.md += md; }
    }
    return out;
  }
  // Límite superado: el Jefe no puede registrarlo; el Director, solo confirmándolo (queda señalado en el registro)
  async function confirmarExcesos(prep) {
    if (!prep.excesos.length) return true;
    var lim = 'máximo ' + maxExtraDia() + ' horas extra diarias y ' + maxExtraSemana() + ' semanales (art. 167A del Código Sustantivo del Trabajo)';
    if (!esDirector()) {
      await new Promise(function (res) {
        AP.modal({ title: 'Supera el límite de horas extra', onClose: function () { res(); }, body: h('div', { class: 'stack' },
          h('p', null, 'La asignación supera el límite de referencia: ' + lim + '.'),
          h('ul', null, prep.excesos.slice(0, 12).map(function (t) { return h('li', null, t); })),
          h('p', { class: 'muted small' }, 'Ajuste las horas. Si se trata de una situación excepcional (fuerza mayor, caso fortuito o trabajo de urgencia), pídale al Director de Seguridad Integral que la registre.')),
          actions: [{ label: 'Entendido', kind: 'primary' }] });
      });
      return false;
    }
    return AP.confirm('Supera el límite de horas extra', 'La asignación supera el límite de referencia (' + lim + '): ' + prep.excesos.slice(0, 8).join('; ') + (prep.excesos.length > 8 ? '…' : '') +
      '. Regístrela solo en una situación excepcional; quedará señalada en el registro de cambios.', 'Registrar de todas formas', 'danger');
  }
  async function guardarExtras(prep, g, gNombre, motivo, progreso) {
    var exc = prep.excesos.length ? '\nSUPERA EL LÍMITE DE REFERENCIA (' + maxExtraDia() + ' h diarias / ' + maxExtraSemana() + ' h semanales), registrado por ' + AP.Session.user.nombre + ': ' + prep.excesos.join('; ') : '';
    for (var i = 0; i < prep.semanas.length; i++) {
      var w = prep.semanas[i];
      if (progreso) progreso('Guardando la semana del ' + fDia(w.s) + ' (' + (i + 1) + ' de ' + prep.semanas.length + ')…');
      var srv = await D.semana(w.s, g);
      if (!srv || (srv.Version || 0) !== (w.doc.Version || 0)) throw new Error('Otra persona modificó la semana del ' + fDia(w.s) + ' mientras tanto. Vuelva a intentarlo.');
      await AP.B.update('AP_ProgPlanta', w.doc.id, { Title: w.doc.Title, Semana: w.s, Desde: w.doc.Desde, Datos: JSON.stringify(w.datos), Turnos: JSON.stringify(w.snap),
        Version: (w.doc.Version || 0) + 1, JefeId: w.doc.JefeId || undefined, JefeNombre: w.doc.JefeNombre || undefined });
      await AP.Planta.registrarCambio('Horas extra', 'Semana del ' + fDia(w.s), w.det.join('\n') + exc, w.n, w.md, w.s, motivo, g);
    }
    await AP.Audit.log('Horas extra de planta', (gNombre || 'Sin jefe inmediato'), prep.n + ' día(s)-persona; ' + prep.personas.size + ' persona(s). Motivo: ' + motivo + (prep.excesos.length ? '. Supera el límite de referencia.' : ''));
  }

  // ---------- Apartado de horas extra ----------
  // opt: { ids: [pid], desde, hasta, cod } ; despues() al guardar
  function horasExtra(g, gNombre, personal, tps, opt, despues) {
    opt = opt || {};
    var hoy = U.ymd();
    AP.modal({ title: 'Horas extra', size: 'wide', body: function (close) {
      var desde = AP.input('xdesde', opt.desde || hoy, { type: 'date' }), hasta = AP.input('xhasta', opt.hasta || opt.desde || hoy, { type: 'date' });
      var antes = AP.select('xantes', OPS_EXTRA, 0), despuesS = AP.select('xdespues', OPS_EXTRA, 60);
      var fT = AP.select('xturno', [['', 'Todos los turnos']].concat(tps.map(function (t) { return [t.Codigo, t.Codigo + ' · ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida]; })), opt.cod && opt.cod !== 'D' ? opt.cod : '');
      var filtro = h('input', { type: 'search', class: 'af-input', placeholder: 'Filtrar por nombre, documento, cargo o área' });
      var elegidos = new Set(opt.ids || []);
      var lista = h('div', { class: 'pick-list' }), info = h('p', { class: 'muted small' }), cuenta = h('small', { class: 'muted' });
      var porP = {}, seq = 0, listo = false;
      var refrescar = U.debounce(async function () {
        var a = desde.value, b = hasta.value || a;
        listo = false; porP = {};
        if (!a || b < a) { pintar(); info.textContent = 'Revise las fechas.'; return; }
        if (diasEntre(a, b).length > 31) { pintar(); info.textContent = 'Elija máximo 31 días por vez.'; return; }
        var n = ++seq;
        pintar(); info.textContent = 'Consultando la programación…';
        try {
          var c = await progRango(g, personal, a, b);
          if (n !== seq) return;
          porP = {};
          personal.forEach(function (p) {
            if (p.Estado !== 'Habilitado') return;
            diasEntre(a, b).forEach(function (y) { var t = J().turnoDe(c, p.Token, y); if (t && t.fuente === 'planta' && t.e) (porP[p.id] = porP[p.id] || []).push({ y: y, t: t }); });
          });
          listo = true; pintar();
        } catch (e) { if (n === seq) info.textContent = 'No se pudo consultar la programación: ' + e.message; }
      }, 250);
      function diasDe(p) { return (porP[p.id] || []).filter(function (d) { return !fT.value || d.t.cod === fT.value; }); }
      function visibles() { return personal.filter(function (p) { return diasDe(p).length && AP.coincide(p, filtro.value, ['Title', 'NumDoc', 'Cargo', 'Area']); }).sort(porNombre); }
      function pintar() {
        var l = visibles();
        if (listo) info.textContent = !Object.keys(porP).length ? 'Nadie tiene turno programado en esas fechas. Programe primero el turno («Asignar turno a personas»).'
          : l.length + ' persona(s) con turno programado en esas fechas' + (fT.value ? ' en ' + fT.value : '') + '. Las horas extra se suman al turno de cada día (no aplican en descanso ni sin turno).';
        lista.replaceChildren.apply(lista, l.map(function (p) {
          var ds = diasDe(p), cods = Array.from(new Set(ds.map(function (d) { return d.t.cod; })));
          var txt = ds.length === 1 ? ds[0].t.cod + ' ' + ds[0].t.e + '–' + ds[0].t.s + ' · ' + diaCorto(ds[0].y) : ds.length + ' turnos (' + cods.join(', ') + ')';
          var ya = ds.filter(function (d) { return d.t.xa || d.t.xd; });
          var cb = h('input', { type: 'checkbox', checked: elegidos.has(p.id) });
          cb.addEventListener('change', function () { if (cb.checked) elegidos.add(p.id); else elegidos.delete(p.id); contar(); });
          return h('label', null, cb, h('span', { class: 'grow' }, p.Title, h('small', { class: 'muted' }, ' · ' + txt)),
            ya.length ? AP.pill('Ya tiene: ' + (ya.length === 1 ? extraCorto(ya[0].t.xa, ya[0].t.xd) : ya.length + ' día(s) con horas extra'), 'warn') : null);
        }));
        contar();
      }
      function contar() { cuenta.textContent = Array.from(elegidos).filter(function (pid) { return porP[pid]; }).length + ' seleccionada(s)'; }
      [desde, hasta].forEach(function (el) { el.addEventListener('change', function () { refrescar(); }); });
      fT.addEventListener('change', pintar);
      filtro.addEventListener('input', U.debounce(pintar, 150));
      var motivo = AP.textarea('xmotivo', '', { rows: 2, placeholder: 'Ej.: Pedido de exportación adicional; cierre de inventario' });
      var prog = h('div', { class: 'muted small' });
      var btn = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
        var a = desde.value, b = hasta.value || a, xa = Number(antes.value) || 0, xd = Number(despuesS.value) || 0;
        if (!a || b < a) return AP.toast('Revise las fechas.', 'warn');
        var ids = Array.from(elegidos).filter(function (pid) { return porP[pid]; });
        if (!ids.length) return AP.toast('Seleccione al menos una persona con turno programado.', 'warn');
        if (motivo.value.trim().length < 6) return AP.toast('Escriba el motivo de las horas extra (queda en el registro de cambios).', 'warn');
        if (RE_SALUD.test(motivo.value)) return AP.toast('El motivo parece contener información de salud (dato sensible). Escriba solo el hecho general.', 'warn', 8000);
        btn.disabled = true;
        try {
          var prep = await prepararExtras(g, personal, a, b, ids, xa, xd, motivo.value.trim(), fT.value);
          if (!prep.n) { btn.disabled = false; return AP.toast('No hubo cambios: esas personas ya tenían esas horas extra.', 'info', 6000); }
          if (!(await confirmarExcesos(prep))) { btn.disabled = false; return; }
          await guardarExtras(prep, g, gNombre, motivo.value.trim(), function (t) { prog.textContent = t; });
          close();
          AP.toast((xa || xd ? 'Horas extra guardadas: ' : 'Horas extra quitadas: ') + prep.n + ' turno(s) de ' + prep.personas.size + ' persona(s) ' + rangoTxt(a, b) + '.', 'info', 7000);
          if (despues) despues();
        } catch (e) { AP.toast('No se pudo guardar: ' + e.message, 'error', 9000); btn.disabled = false; }
      } }, AP.icon('check', 18), 'Guardar horas extra');
      refrescar();
      return h('div', { class: 'stack' },
        h('div', { class: 'banner info' }, AP.icon('clock', 18), h('span', null, 'Las horas extra se suman al turno que la persona tiene programado ese día: antes de la entrada, después de la salida o ambas. ' +
          'Límite de referencia: ' + maxExtraDia() + ' h diarias y ' + maxExtraSemana() + ' h semanales (art. 167A del Código Sustantivo del Trabajo). La portería amplía su horario de ingreso y permanencia. Para quitarlas, deje ambas en «Sin horas extra».')),
        h('div', { class: 'form-grid' }, AP.field('Desde *', desde), AP.field('Hasta (inclusive) *', hasta), AP.field('Horas extra antes del turno', antes), AP.field('Horas extra después del turno', despuesS)),
        h('div', { class: 'stack sm' }, h('div', { class: 'row between wrap gap' }, h('strong', null, 'Personas con turno en esas fechas'), cuenta), info,
          h('div', { class: 'filters' }, fT, filtro), lista,
          h('div', { class: 'row gap' }, h('button', { class: 'btn small', type: 'button', onclick: function () { visibles().forEach(function (p) { elegidos.add(p.id); }); pintar(); } }, 'Todas las visibles'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: function () { elegidos.clear(); pintar(); } }, 'Ninguna'))),
        AP.field('Motivo *', motivo),
        prog,
        h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), btn));
    } });
  }
  AP.Planta.horasExtra = horasExtra;

  // ---------- Programación semanal (cuadrícula) ----------
  // Se abre en consulta: muestra lo programado (por «Asignar turno a personas», por día o a mano). Al oprimir una casilla se
  // cambia el turno de ese día o se le asignan horas extra. «Ajustar a mano» activa el pincel para pintar varias casillas.
  // cfg: { box, acciones, g, gNombre, ED, s (semana pedida), ir(ymd), personal: async }
  AP.Planta.semana = function (cfg) {
    var box = cfg.box, acciones = cfg.acciones, ED = cfg.ED, g = cfg.g, gNombre = cfg.gNombre;
    var hoy = U.ymd();
    var lun = J().lunes(/^\d{4}-\d{2}-\d{2}$/.test(cfg.s || '') ? cfg.s : hoy);
    var fechas = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return J().addYmd(lun, i); });
    var ops = [], todos = [], tps = [], doc = null, ausencias = [], guardado = {}, actual = {}, extras = {};
    var sucio = false, pincel = '', editando = false;
    var estadoG = h('span', { class: 'muted small' });
    var guardarBtn = h('button', { class: 'btn primary', type: 'button', onclick: guardar }, AP.icon('check', 18), 'Guardar semana');
    var fArea = AP.select('area', [['', 'Todas las áreas']], '');
    var fCargo = AP.select('cargo', [['', 'Todos los cargos']], '');
    var fTurno = AP.select('fturno', [['', 'Todos los turnos']], '');
    var q = AP.buscador('Buscar persona, documento o cargo', function () { pintarGrid(); });
    [fArea, fCargo, fTurno].forEach(function (s0) { s0.addEventListener('change', function () { pintarGrid(); }); });
    var gridBox = h('div'), segBox = h('div', { class: 'row gap wrap' }), avisoBox = h('div'), resumenBox = h('p', { class: 'muted small' });
    AP.onLeave(function () { if (sucio) AP.toast('La programación de la semana tenía cambios sin guardar.', 'warn', 7000); });
    function pintarAcciones() {
      if (!ED || !acciones) return;
      if (editando) acciones.replaceChildren(estadoG, h('button', { class: 'btn', type: 'button', onclick: terminarAjuste }, AP.icon('x', 18), 'Terminar el ajuste'), guardarBtn);
      else acciones.replaceChildren(estadoG,
        h('button', { class: 'btn', type: 'button', onclick: function () { horasExtra(g, gNombre, todos, tps, { desde: hoy >= lun && hoy <= fechas[6] ? hoy : lun, hasta: hoy >= lun && hoy <= fechas[6] ? hoy : lun }, cargar); } }, AP.icon('clock', 18), 'Horas extra'),
        h('button', { class: 'btn primary', type: 'button', onclick: function () {
          asignarTurno(g, gNombre, todos, tps, null, function (r) { if (r && J().lunes(r.a) !== lun) cfg.ir(J().lunes(r.a)); else cargar(); },
            { rango: lun > hoy ? [lun, fechas[6]] : null });
        } }, AP.icon('users', 18), 'Asignar turno a personas'));
    }
    function marcar(v) {
      sucio = v !== false;
      estadoG.textContent = sucio ? 'Cambios sin guardar' : doc ? 'Guardada ' + U.fDateTime(doc._modified) + (doc._modifiedBy ? ' · ' + doc._modifiedBy : '') : 'Semana sin programar';
      estadoG.className = sucio ? 'txt-warn small' : 'muted small';
    }
    function turnoDeCod(cod) { var t = tps.find(function (x) { return x.Codigo === cod; }); return t ? { n: t.Title, e: t.HoraEntrada, s: t.HoraSalida } : snapshot()[cod] || null; }
    function idxTurno(cod) { var i = tps.findIndex(function (x) { return x.Codigo === cod; }); return i < 0 ? 7 : i % 8; }
    function ausDe(p, ymd) { return ausencias.find(function (a) { return a.Token === p.Token && a.Estado !== 'Anulada' && U.ymd(a.Desde) <= ymd && U.ymd(a.Hasta) >= ymd; }); }
    var snapCache = null;
    function snapshot() { if (!snapCache) snapCache = AP.Horario.jsonDe(doc && doc.Turnos, {}); return snapCache; }
    function trabaja(c) { return !!c && c !== 'D'; }
    // Horas extra del día (solo cuenta si ese día tiene un turno de trabajo)
    function extraDe(pid, y) { var c = (actual[pid] || {})[y], x = (extras[pid] || {})[y]; return trabaja(c) && x ? (Number(x.a) || 0) + (Number(x.d) || 0) : 0; }
    function horasFila(p) {
      var d = actual[p.id] || {}, hs = 0;
      fechas.forEach(function (y) { var c = d[y]; if (trabaja(c)) { var t = turnoDeCod(c); hs += J().horasTurno(t ? { e: t.e, s: t.s } : null); } });
      return hs;
    }
    function extraFila(p) { return fechas.reduce(function (s0, y) { return s0 + extraDe(p.id, y); }, 0); }
    function opcionesSel(sel, vals, todosTxt) {
      var v = sel.value;
      sel.replaceChildren.apply(sel, [h('option', { value: '' }, todosTxt)].concat(vals.map(function (a) { return Array.isArray(a) ? h('option', { value: a[0] }, a[1]) : h('option', { value: a }, a); })));
      sel.value = v;
      if (sel.value !== v) sel.value = '';
    }
    async function cargar() {
      box.replaceChildren(AP.spinner('Cargando la semana…'));
      try {
        var r = await Promise.all([cfg.personal(), D.turnos(g), D.semana(lun, g), D.ausencias().catch(function () { return []; })]);
        todos = r[0];
        ops = r[0].filter(function (p) { return p.Estado === 'Habilitado' || (r[2] && AP.Horario.jsonDe(r[2].Datos, {})[p.id]); });
        tps = r[1].filter(function (t) { return t.Activo !== false; }); doc = r[2]; ausencias = r[3]; snapCache = null;
        guardado = {}; actual = {}; extras = {};
        var datos = AP.Horario.jsonDe(doc && doc.Datos, {});
        Object.keys(datos).forEach(function (pid) { guardado[pid] = Object.assign({}, datos[pid].d || {}); extras[pid] = Object.assign({}, datos[pid].x || {}); });
        ops.forEach(function (p) { actual[p.id] = Object.assign({}, guardado[p.id] || {}); });
        var uniq = function (k) { return Array.from(new Set(ops.map(function (p) { return p[k] || ''; }).filter(Boolean))).sort(); };
        opcionesSel(fArea, uniq('Area'), 'Todas las áreas'); opcionesSel(fCargo, uniq('Cargo'), 'Todos los cargos');
        opcionesSel(fTurno, tps.map(function (t) { return [t.Codigo, t.Codigo + ' · ' + t.Title]; }).concat([['D', 'Descanso'], ['sin', 'Sin turno en la semana'], ['extra', 'Con horas extra']]), 'Todos los turnos');
        editando = false;
        pintar(); marcar(false); pintarAcciones(); avisoSemanaVacia();
      } catch (e) { box.replaceChildren(errBox(e)); }
    }
    // Si la semana no tiene nada programado, señala la semana programada más próxima
    async function avisoSemanaVacia() {
      avisoBox.replaceChildren();
      if (Object.keys(guardado).some(function (pid) { return Object.keys(guardado[pid]).length; }) || !ops.length) return;
      var txt = 'Esta semana no tiene turnos programados.';
      try {
        var docs = await D.semanas(J().addYmd(lun, 7), J().addYmd(lun, 63), g);
        var prox = docs.filter(function (w) { return w.Semana > lun && Object.keys(AP.Horario.jsonDe(w.Datos, {})).length; }).sort(function (a, b) { return a.Semana < b.Semana ? -1 : 1; })[0];
        var ant = lun > hoy ? null : (await D.semanas(J().addYmd(lun, -7), J().addYmd(lun, -1), g)).filter(function (w) { return w.Semana < lun && Object.keys(AP.Horario.jsonDe(w.Datos, {})).length; })[0];
        avisoBox.replaceChildren(h('div', { class: 'banner warn' }, AP.icon('calendar', 18), h('span', { class: 'grow' }, txt + (prox ? ' Lo próximo programado está en la semana del ' + fDia(prox.Semana) + '.' : ED ? ' Use «Asignar turno a personas»' + (ant ? ' o «Copiar semana anterior»' : '') + '.' : '')),
          prox ? h('button', { class: 'btn small', type: 'button', onclick: function () { ir(prox.Semana); } }, 'Ir a la semana del ' + fDia(prox.Semana)) : null));
      } catch (e) { avisoBox.replaceChildren(h('div', { class: 'banner warn' }, AP.icon('calendar', 18), h('span', null, txt))); }
    }
    function ir(ymd) {
      var go = function () { sucio = false; cfg.ir(ymd); };
      if (!sucio) return go();
      AP.confirm('Cambios sin guardar', 'Hay cambios sin guardar en esta semana. ¿Cambiar de semana sin guardarlos?', 'Cambiar sin guardar', 'danger').then(function (ok) { if (ok) go(); });
    }
    function entrarAjuste() { if (!ED || editando) return; editando = true; pintarAcciones(); pintar(); }
    function terminarAjuste() {
      var salir = function () { editando = false; ops.forEach(function (p) { actual[p.id] = Object.assign({}, guardado[p.id] || {}); }); marcar(false); pintarAcciones(); pintar(); };
      if (!sucio) return salir();
      AP.confirm('Cambios sin guardar', 'Hay cambios sin guardar. ¿Descartarlos y terminar el ajuste a mano?', 'Descartar cambios', 'danger').then(function (ok) { if (ok) salir(); });
    }
    function pintar() {
      var fin = fechas[6];
      var semIn = AP.input('sem', lun, { type: 'date', 'aria-label': 'Ir a la semana de' });
      semIn.addEventListener('change', function () { if (semIn.value) ir(J().lunes(semIn.value)); });
      segBox.replaceChildren();
      if (ED && editando) {
        var opciones = [{ value: '', label: 'Quitar', icon: 'x' }].concat(tps.map(function (t) { return { value: t.Codigo, label: t.Codigo + ' · ' + t.HoraEntrada + '–' + t.HoraSalida, cls: 'pl-seg-' + idxTurno(t.Codigo) }; }),
          [{ value: 'D', label: 'D · Descanso', cls: 'pl-seg-D' }]);
        if (!tps.some(function (t) { return t.Codigo === pincel; }) && pincel !== 'D') pincel = tps[0] ? tps[0].Codigo : 'D';
        segBox.append(h('strong', null, 'Pincel:'), AP.segmented('pincel', opciones, pincel, function (v) { pincel = v; }));
      }
      box.replaceChildren(
        !tps.length ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, 'Aún no hay turnos. ' + (ED ? 'Créelos primero en la pestaña «Turnos y asignación» (por ejemplo: T1 06:00–14:00, T2 14:00–22:00, T3 22:00–06:00).' : ''))) : null,
        ED ? h('div', { class: 'banner info' }, AP.icon('calendar', 18), h('span', null, editando
          ? 'Ajuste a mano: elija el turno en el pincel y haga clic (o arrastre) sobre los días. Al terminar, oprima «Guardar semana». Los cambios de un día ya iniciado exigen motivo.'
          : 'Aquí se ve lo programado. Oprima una casilla para cambiar el turno de ese día o asignarle horas extra; para programar a varias personas, use «Asignar turno a personas». ' +
            'La portería aplica esta programación: ingreso desde ' + AP.Horario.cfg().minutosAntelacionTurno + ' minutos antes del turno; un día sin turno o de descanso lo decide el Director.')) : null,
        h('div', { class: 'filters' },
          h('button', { class: 'btn', type: 'button', 'aria-label': 'Semana anterior', onclick: function () { ir(J().addYmd(lun, -7)); } }, AP.icon('back', 18)),
          semIn,
          h('button', { class: 'btn', type: 'button', 'aria-label': 'Semana siguiente', onclick: function () { ir(J().addYmd(lun, 7)); } }, h('span', { style: { display: 'inline-block', transform: 'scaleX(-1)' } }, AP.icon('back', 18))),
          h('strong', { class: 'pg-mes' }, 'Semana del ' + fDia(lun) + ' al ' + fDia(fin)),
          h('span', { class: 'grow' }),
          ED ? h('button', { class: 'btn', type: 'button', onclick: copiarAnterior }, AP.icon('history', 18), 'Copiar semana anterior') : null,
          ED && editando ? h('button', { class: 'btn', type: 'button', onclick: function () { patron(null); } }, AP.icon('calendar', 18), 'Aplicar patrón') : null,
          ED && !editando ? h('button', { class: 'btn', type: 'button', onclick: entrarAjuste }, AP.icon('edit', 18), 'Ajustar a mano') : null,
          AP.btnExcel(exportarSemana, 'Excel de la semana'),
          AP.btnExcel(function () { modalExcelTurnos(g, gNombre, todos, [lun, fin]); }, 'Excel por turnos')),
        avisoBox,
        h('div', { class: 'filters' }, fArea, fCargo, fTurno, q),
        ED && editando ? h('section', { class: 'card stack sm' }, h('div', { class: 'row between wrap gap' }, segBox,
          h('small', { class: 'muted' }, 'Elija el turno y haga clic (o arrastre) sobre los días. Clic en el nombre para aplicar un patrón a esa persona.'))) : null,
        resumenBox,
        gridBox);
      pintarGrid();
    }
    function visibles() {
      var ft = fTurno.value;
      return ops.filter(function (p) {
        if (fArea.value && p.Area !== fArea.value) return false;
        if (fCargo.value && p.Cargo !== fCargo.value) return false;
        var d = actual[p.id] || {};
        if (ft === 'sin') { if (fechas.some(function (y) { return d[y]; })) return false; }
        else if (ft === 'extra') { if (!extraFila(p)) return false; }
        else if (ft && !fechas.some(function (y) { return d[y] === ft; })) return false;
        return AP.coincide(p, q.value, ['Title', 'NumDoc', 'Cargo', 'Area']);
      });
    }
    var pintando = false;
    var soltar = function () { pintando = false; };
    document.addEventListener('pointerup', soltar);
    AP.onLeave(function () { document.removeEventListener('pointerup', soltar); });
    function claseCelda(c, ymd) { return 'pg-c pl-c' + (c === 'D' ? ' pl-D' : c ? ' pl-t' + idxTurno(c) : '') + (ymd < hoy ? ' pl-pas' : ymd === hoy ? ' pl-hoy' : '') + (ED && !editando ? ' pl-clic' : ''); }
    function contenido(pid, y, c) { var x = extraDe(pid, y); return [c || '·', x ? h('sup', { class: 'pl-x' }, '+' + (Math.round(x / 6) / 10).toLocaleString('es-CO')) : null]; }
    function tituloCelda(p, y, c, a) {
      var t = trabaja(c) ? turnoDeCod(c) : null, x = (extras[p.id] || {})[y];
      return (a ? 'Ausencia registrada por Talento Humano: ' + a.Tipo + '. ' : '') + (t ? t.n + ' ' + t.e + '–' + t.s : c === 'D' ? 'Descanso' : c ? c : 'Sin turno') +
        (t && x && (x.a || x.d) ? '. ' + J().extraTxt({ e: t.e, s: t.s, xa: Number(x.a) || 0, xd: Number(x.d) || 0 }) + (x.m ? '. Motivo: ' + x.m : '') : '');
    }
    function pintarCelda(btn) {
      if (!ED || !editando) return;
      var pid = btn.dataset.p, y = btn.dataset.y;
      var d = actual[pid] = actual[pid] || {};
      if ((d[y] || '') === pincel) return;
      if (pincel) d[y] = pincel; else delete d[y];
      btn.replaceChildren.apply(btn, contenido(pid, y, pincel).filter(Boolean));
      btn.className = claseCelda(pincel, y);
      marcar();
      var p = ops.find(function (x) { return x.id === pid; });
      var tr = btn.closest('tr');
      if (tr && p) {
        var hs = horasFila(p), td = tr.querySelector('.pl-h'), tx = tr.querySelector('.pl-xh');
        td.textContent = fh(hs); td.classList.toggle('txt-deny', hs > maxSemanal());
        if (tx) { var xh = extraFila(p) / 60; tx.textContent = xh ? fh(xh) : '—'; }
      }
      pintarPie();
    }
    var pie = null;
    function pintarPie() {
      if (!pie) return;
      pie.replaceChildren.apply(pie, tps.concat([{ Codigo: 'D', Title: 'Descanso' }]).map(function (t) {
        return h('tr', null, h('th', { class: 'pg-nom', scope: 'row' }, t.Codigo + ' · ' + t.Title),
          fechas.map(function (y) { var n = ops.filter(function (p) { return (actual[p.id] || {})[y] === t.Codigo; }).length; return h('td', { class: 'pg-cob' }, String(n)); }), h('td'), h('td'));
      }));
    }
    function pintarGrid() {
      var l = visibles();
      if (!ops.length) {
        resumenBox.textContent = '';
        gridBox.replaceChildren(AP.empty('users', 'No hay personal en este grupo', esJefe() ? 'Aquí aparecen las personas que tienen a usted como jefe inmediato en su ficha. Si falta alguien, pídale al Director de Seguridad Integral que le asigne el jefe inmediato en Personas.'
          : 'Asigne el jefe inmediato en la ficha de cada persona (Personas).'));
        return;
      }
      var conT = l.filter(function (p) { var d = actual[p.id] || {}; return fechas.some(function (y) { return trabaja(d[y]); }); }).length;
      var sinP = l.filter(function (p) { var d = actual[p.id] || {}; return !fechas.some(function (y) { return d[y]; }); }).length;
      var conX = l.filter(function (p) { return extraFila(p) > 0; }).length;
      resumenBox.textContent = l.length + ' persona(s) en la vista · ' + conT + ' con turno esta semana · ' + sinP + ' sin programar' + (conX ? ' · ' + conX + ' con horas extra' : '') + '.';
      var cab = [h('th', { class: 'pg-nom' }, 'Persona')].concat(fechas.map(function (y, i) {
        var fest = J().festivo(y);
        return h('th', { class: 'pg-d' + (i >= 5 || fest ? ' fds' : '') + (y === hoy ? ' pl-hoy-h' : ''), title: fest || '' }, h('small', null, DIAS[i]), y.slice(8) + (fest ? '*' : ''));
      }), [h('th', { title: 'Horas de los turnos programados en la semana' }, 'Horas'), h('th', { title: 'Horas extra programadas en la semana' }, 'Extra')]);
      var limS = maxExtraSemana();
      var cuerpo = l.map(function (p) {
        var d = actual[p.id] || {};
        var hs = horasFila(p), xh = extraFila(p) / 60;
        return h('tr', null,
          h('th', { class: 'pg-nom', scope: 'row' },
            ED && editando ? h('button', { class: 'linkish', type: 'button', title: 'Aplicar un patrón a ' + p.Title, onclick: function () { patron(p); } }, p.Title) : h('span', null, p.Title),
            h('small', { class: 'block muted' }, [p.Cargo, p.Area].filter(Boolean).join(' · ') + (p.Estado !== 'Habilitado' ? ' · INHABILITADO' : ''))),
          fechas.map(function (y) {
            var c = d[y] || '', a = ausDe(p, y);
            return h('td', { class: 'pg-td' }, h('button', { type: 'button', class: claseCelda(c, y) + (a ? ' pl-aus' : ''), dataset: { p: p.id, y: y },
              title: tituloCelda(p, y, c, a) + (ED && !editando ? '. Oprima para cambiar este día.' : ''),
              'aria-label': p.Title + ', ' + fDia(y) + ': ' + (c ? c : 'sin turno') + (extraDe(p.id, y) ? ', con horas extra' : '') + (a ? ', con ausencia registrada' : '') }, contenido(p.id, y, c)));
          }),
          h('td', { class: 'pg-tot pl-h' + (hs > maxSemanal() ? ' txt-deny' : ''), title: 'Jornada máxima semanal de referencia: ' + maxSemanal() + ' h' }, fh(hs)),
          h('td', { class: 'pg-tot pl-xh' + (xh > limS ? ' txt-deny' : ''), title: 'Límite de referencia: ' + limS + ' h extra semanales' }, xh ? fh(xh) : '—'));
      });
      pie = h('tfoot');
      var t = h('table', { class: 'pg-grid pl-grid' }, h('thead', null, h('tr', null, cab)), h('tbody', null, cuerpo), pie);
      t.addEventListener('pointerdown', function (e) { var b = e.target.closest('.pl-c'); if (!b || !ED || !editando) return; e.preventDefault(); pintando = true; pintarCelda(b); });
      t.addEventListener('pointerover', function (e) { if (!pintando) return; var b = e.target.closest('.pl-c'); if (b) pintarCelda(b); });
      t.addEventListener('click', function (e) {
        var b = e.target.closest('.pl-c'); if (!b || !ED) return;
        if (editando) { if (e.detail === 0) pintarCelda(b); return; }
        var p = ops.find(function (x) { return x.id === b.dataset.p; });
        if (p) editarDia(p, b.dataset.y);
      });
      var excede = l.filter(function (p) { return horasFila(p) > maxSemanal(); });
      gridBox.replaceChildren(l.length ? h('div', { class: 'pg-scroll' }, t) : AP.empty('search', 'Nadie coincide con el filtro', 'Cambie el área, el cargo, el turno o la búsqueda.'),
        h('div', { class: 'row gap wrap pg-ley' }, tps.map(function (x) { return h('span', null, h('i', { class: 'pg-c pl-c pl-t' + idxTurno(x.Codigo) }, x.Codigo), ' ' + x.Title + ' ' + x.HoraEntrada + '–' + x.HoraSalida); }),
          h('span', null, h('i', { class: 'pg-c pl-c pl-D' }, 'D'), ' Descanso'), h('span', null, h('i', { class: 'pg-c pl-c pl-aus' }, '·'), ' Ausencia registrada por Talento Humano'),
          h('span', null, h('i', { class: 'pg-c pl-c' }, 'T1', h('sup', { class: 'pl-x' }, '+2')), ' Horas extra del día'),
          h('span', { class: 'muted small' }, '* Festivo')),
        excede.length ? h('p', { class: 'note small' }, excede.length + ' persona(s) con más de ' + maxSemanal() + ' horas de turno programadas en la semana (jornada máxima ordinaria de referencia, Ley 2101 de 2021). Lo que exceda es trabajo suplementario: asígnelo como horas extra.') : null);
      pintarPie();
    }
    // Un día de una persona: turno y horas extra (se guarda de inmediato y queda en el registro de cambios)
    function editarDia(p, y) {
      if (sucio) return AP.toast('Guarde primero los cambios de esta semana.', 'warn');
      var c0 = (guardado[p.id] || {})[y] || '', x0 = (extras[p.id] || {})[y] || null;
      var a0 = trabaja(c0) && x0 ? Number(x0.a) || 0 : 0, d0 = trabaja(c0) && x0 ? Number(x0.d) || 0 : 0;
      var aus = ausDe(p, y);
      AP.modal({ title: p.Title + ' — ' + DIAS_LARGOS[J().dow(y)] + ' ' + fDia(y), body: function (close) {
        var sel = AP.select('dturno', [['', 'Sin turno']].concat(tps.map(function (t) { return [t.Codigo, t.Codigo + ' · ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida]; }), [['D', 'D · Descanso']]), c0);
        var xa = AP.select('da', opsExtra(a0), a0), xd = AP.select('dd', opsExtra(d0), d0);
        var nota = h('p', { class: 'muted small' });
        function sync() {
          var tr = trabaja(sel.value);
          xa.disabled = xd.disabled = !tr;
          var t = tr ? turnoDeCod(sel.value) : null;
          nota.textContent = !tr ? 'Las horas extra solo se asignan a un día con turno.' : (Number(xa.value) || Number(xd.value)) && t
            ? J().extraTxt({ e: t.e, s: t.s, xa: Number(xa.value) || 0, xd: Number(xd.value) || 0 }) + '. Límite de referencia: ' + maxExtraDia() + ' h diarias y ' + maxExtraSemana() + ' h semanales (art. 167A del Código Sustantivo del Trabajo).' : '';
        }
        [sel, xa, xd].forEach(function (el) { el.addEventListener('change', sync); }); sync();
        var mot = AP.textarea('dmot', '', { rows: 2, placeholder: 'Motivo (obligatorio para horas extra y para cambios de hoy o días anteriores)' });
        var btn = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
          var cod = sel.value, tr = trabaja(cod), na = tr ? Number(xa.value) || 0 : 0, nd = tr ? Number(xd.value) || 0 : 0;
          var cambiaT = cod !== c0, cambiaX = tr && (na !== a0 || nd !== d0);
          if (!cambiaT && !cambiaX) { close(); return AP.toast('No hubo cambios.', 'info'); }
          var m = mot.value.trim();
          if ((y <= hoy || (cambiaX && (na || nd))) && m.length < 6) return AP.toast(cambiaX && (na || nd) ? 'Escriba el motivo de las horas extra.' : 'Es un día ya iniciado: escriba el motivo del cambio.', 'warn');
          if (RE_SALUD.test(m)) return AP.toast('El motivo parece contener información de salud (dato sensible). Escriba solo el hecho general.', 'warn', 8000);
          btn.disabled = true;
          try {
            var prep = null;
            if (cambiaT) await aplicarAsignacion(g, gNombre, todos, tps, cod || 'X', y, y, [String(J().dow(y))], [p.id], m);
            if (cambiaX) {
              prep = await prepararExtras(g, todos, y, y, [p.id], na, nd, m || 'Ajuste del día');
              if (prep.n && !(await confirmarExcesos(prep))) { btn.disabled = false; if (cambiaT) { close(); cargar(); } return; }
              if (prep.n) await guardarExtras(prep, g, gNombre, m || 'Ajuste del día');
            }
            close();
            AP.toast('Día guardado' + (cambiaT ? ': ' + (cod ? (cod === 'D' ? 'descanso' : 'turno ' + cod) : 'sin turno') : '') + (cambiaX ? (na || nd ? ' · horas extra: ' + extraCorto(na, nd) : ' · sin horas extra') : '') + '.', 'info', 6000);
            cargar();
          } catch (e) { AP.toast('No se pudo guardar: ' + e.message, 'error', 9000); btn.disabled = false; }
        } }, AP.icon('check', 18), 'Guardar');
        return h('div', { class: 'stack' },
          h('p', { class: 'muted small' }, [p.NumDoc, p.Cargo, p.Area].filter(Boolean).join(' · ')),
          aus ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, 'Talento Humano registró una ausencia que cubre este día (' + aus.Tipo + ').')) : null,
          h('div', { class: 'form-grid' }, AP.field('Turno', sel, null, 'span2'), AP.field('Horas extra antes del turno', xa), AP.field('Horas extra después del turno', xd)),
          nota,
          x0 && x0.m && trabaja(c0) ? h('p', { class: 'small' }, 'Motivo registrado de las horas extra: ' + x0.m) : null,
          AP.field('Motivo', mot),
          h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), btn));
      } });
    }
    // Patrón: un turno por día de la semana para una o varias personas
    function patron(p0) {
      if (!ED) return;
      var elegidos = new Set(p0 ? [p0.id] : []);
      AP.modal({ title: 'Aplicar patrón a la semana', size: 'wide', body: function (close) {
        var ops2 = [['', '— Sin cambio —'], ['X', 'Quitar turno']].concat(tps.map(function (t) { return [t.Codigo, t.Codigo + ' · ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida]; }), [['D', 'D · Descanso']]);
        var sels = fechas.map(function (y, i) { return AP.select('d' + i, ops2, ''); });
        var lista = h('div', { class: 'pick-list' });
        var filtroP = h('input', { type: 'search', class: 'af-input', placeholder: 'Filtrar personas por nombre, área o cargo' });
        function pintarLista() {
          lista.replaceChildren.apply(lista, visibles().filter(function (p) { return AP.coincide(p, filtroP.value, ['Title', 'Area', 'Cargo', 'NumDoc']); }).map(function (p) {
            var cb = h('input', { type: 'checkbox', checked: elegidos.has(p.id) });
            cb.addEventListener('change', function () { if (cb.checked) elegidos.add(p.id); else elegidos.delete(p.id); });
            return h('label', null, cb, h('span', null, p.Title + (p.Area ? ' · ' + p.Area : '')));
          }));
        }
        filtroP.addEventListener('input', U.debounce(pintarLista, 150)); pintarLista();
        return h('div', { class: 'stack' },
          h('div', { class: 'stack sm' }, h('strong', null, 'Personas'), filtroP, lista,
            h('div', { class: 'row gap' }, h('button', { class: 'btn small', type: 'button', onclick: function () { visibles().forEach(function (p) { elegidos.add(p.id); }); pintarLista(); } }, 'Todas las visibles'),
              h('button', { class: 'btn small ghost', type: 'button', onclick: function () { elegidos.clear(); pintarLista(); } }, 'Ninguna'))),
          h('div', { class: 'form-grid' }, fechas.map(function (y, i) { return AP.field(DIAS[i] + ' ' + y.slice(8), sels[i]); })),
          h('div', { class: 'row gap wrap' },
            tps.slice(0, 4).map(function (t) { return h('button', { class: 'btn small', type: 'button', onclick: function () { sels.forEach(function (s, i) { s.value = i < 6 ? t.Codigo : 'D'; }); } }, 'Lun a sáb ' + t.Codigo + ', dom descanso'); })),
          h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
            h('button', { class: 'btn primary', type: 'button', onclick: function () {
              if (!elegidos.size) return AP.toast('Elija al menos una persona.', 'warn');
              elegidos.forEach(function (pid) {
                var d = actual[pid] = actual[pid] || {};
                fechas.forEach(function (y, i) { var v = sels[i].value; if (v === 'X') delete d[y]; else if (v) d[y] = v; });
              });
              close(); marcar(); pintarGrid();
            } }, AP.icon('check', 18), 'Aplicar')));
      } });
    }
    async function copiarAnterior() {
      try {
        var prev = await D.semana(J().addYmd(lun, -7), g);
        if (!prev) return AP.toast('La semana anterior no tiene programación guardada.', 'warn');
        entrarAjuste();
        var datos = AP.Horario.jsonDe(prev.Datos, {}), n = 0;
        Object.keys(datos).forEach(function (pid) {
          if (!ops.some(function (p) { return p.id === pid; })) return;
          var d = actual[pid] = {};
          Object.keys(datos[pid].d || {}).forEach(function (y) { var y2 = J().addYmd(y, 7); if (fechas.indexOf(y2) >= 0) { d[y2] = datos[pid].d[y]; n++; } });
        });
        marcar(); pintarGrid();
        AP.toast(n + ' turnos copiados de la semana anterior (sin las horas extra). Revíselos y oprima «Guardar semana».', 'info', 7000);
      } catch (e) { AP.toast(e.message, 'error'); }
    }
    function cambiosPendientes() {
      var lst = [];
      var ids = new Set(Object.keys(actual).concat(Object.keys(guardado)));
      ids.forEach(function (pid) {
        if (!ops.some(function (p) { return p.id === pid; })) return;   // personas que no están en la vista (p. ej., inhabilitadas): se conservan
        var a = guardado[pid] || {}, b = actual[pid] || {};
        fechas.forEach(function (y) { if ((a[y] || '') !== (b[y] || '')) lst.push({ pid: pid, y: y, antes: a[y] || '', despues: b[y] || '' }); });
      });
      return lst;
    }
    async function guardar() {
      if (!ED) return;
      var ch = cambiosPendientes();
      if (!ch.length) return AP.toast('No hay cambios por guardar.', 'info');
      var mismoDia = ch.filter(function (c) { return c.y <= hoy; });
      var motivo = '';
      if (mismoDia.length || doc) {
        motivo = await new Promise(function (res) {
          AP.modal({ title: 'Guardar programación', onClose: function () { res(null); }, body: function (close) {
            var m = AP.textarea('motivo', '', { rows: 2, placeholder: mismoDia.length ? 'Motivo del cambio (obligatorio: hay cambios en días ya iniciados)' : 'Nota del cambio (opcional)' });
            return h('div', { class: 'stack' },
              h('p', null, ch.length + ' cambio(s) en la semana.' + (mismoDia.length ? ' ' + mismoDia.length + ' afectan días ya iniciados (hoy o anteriores): quedan señalados en el registro de cambios para revisión del Director.' : '')),
              AP.field(mismoDia.length ? 'Motivo *' : 'Nota', m),
              h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
                h('button', { class: 'btn primary', type: 'button', onclick: function () {
                  if (mismoDia.length && m.value.trim().length < 6) return AP.toast('Escriba el motivo del cambio.', 'warn');
                  if (RE_SALUD.test(m.value)) return AP.toast('El motivo parece contener información de salud (dato sensible). Escriba solo el hecho general.', 'warn', 8000);
                  var v = m.value.trim(); res(v); close();
                } }, AP.icon('check', 18), 'Guardar')));
          } });
        });
        if (motivo === null) return;
      }
      guardarBtn.disabled = true;
      try {
        // Nadie más la modificó mientras tanto
        var srv = await D.semana(lun, g);
        if ((srv && srv.Version) !== (doc && doc.Version)) {
          guardarBtn.disabled = false;
          return AP.toast('Otra persona guardó esta semana mientras usted la editaba (' + (srv && srv._modifiedBy ? srv._modifiedBy + ', ' : '') + U.fDateTime(srv && srv._modified) + '). Recargue la página y vuelva a aplicar sus cambios.', 'warn', 12000);
        }
        var datos = {}, usados = {}, quitadas = [];
        // Se conserva lo programado a personas que no aparecen en la vista (por ejemplo, inhabilitadas)
        var previo = AP.Horario.jsonDe(srv && srv.Datos, {});
        Object.keys(previo).forEach(function (pid) {
          if (ops.some(function (p) { return p.id === pid; })) return;
          datos[pid] = previo[pid];
          Object.keys(previo[pid].d || {}).forEach(function (y) { var c = previo[pid].d[y]; if (c && c !== 'D') usados[c] = 1; });
        });
        ops.forEach(function (p) {
          var d = actual[p.id] || {}, dd = {}, xx = {}, xp = (previo[p.id] || {}).x || {};
          fechas.forEach(function (y) {
            if (d[y]) { dd[y] = d[y]; if (d[y] !== 'D') usados[d[y]] = 1; }
            // Las horas extra se conservan mientras el día siga con turno de trabajo
            if (xp[y]) { if (trabaja(d[y])) xx[y] = xp[y]; else quitadas.push(p.Title + ' — ' + fDia(y)); }
          });
          if (Object.keys(dd).length) { datos[p.id] = { t: p.Token, n: p.Title, doc: p.NumDoc || '', a: p.Area || '', d: dd }; if (Object.keys(xx).length) datos[p.id].x = xx; }
        });
        var snap = Object.assign({}, snapshot());
        Object.keys(usados).forEach(function (c) { var t = tps.find(function (x) { return x.Codigo === c; }); if (t) snap[c] = { n: t.Title, e: t.HoraEntrada, s: t.HoraSalida }; });
        Object.keys(snap).forEach(function (c) { if (!usados[c]) delete snap[c]; });
        var reg = { Title: 'Semana del ' + lun + (gNombre ? ' — ' + gNombre : ''), Semana: lun, Desde: U.fromLocal(lun, '00:00').toISOString(), Datos: JSON.stringify(datos), Turnos: JSON.stringify(snap),
          Version: ((doc && doc.Version) || 0) + 1, JefeId: g || undefined, JefeNombre: gNombre || undefined };
        if (doc) doc = await AP.B.update('AP_ProgPlanta', doc.id, reg); else doc = await AP.B.create('AP_ProgPlanta', reg);
        doc._modified = new Date().toISOString(); doc._modifiedBy = AP.Session.user.usuario;
        var nombre = function (pid) { var p = ops.find(function (x) { return x.id === pid; }); return p ? p.Title : pid; };
        var det = ch.map(function (c) { return nombre(c.pid) + ' — ' + DIAS[fechas.indexOf(c.y)] + ' ' + fDia(c.y) + ': ' + (c.antes || 'sin turno') + ' → ' + (c.despues || 'sin turno') + (c.y <= hoy ? ' (día ya iniciado)' : ''); }).join('\n') +
          (quitadas.length ? '\nSe quitan las horas extra de: ' + quitadas.join('; ') : '');
        await AP.Planta.registrarCambio('Programación semanal', 'Semana del ' + fDia(lun), det, ch.length, mismoDia.length, lun, motivo || '', g);
        await AP.Audit.log('Programación de planta', 'Semana del ' + lun + (gNombre ? ' — ' + gNombre : ''), ch.length + ' cambio(s)' + (mismoDia.length ? ', ' + mismoDia.length + ' en días ya iniciados' : '') + (motivo ? '. Motivo: ' + motivo : ''));
        AP.toast('Semana guardada (' + ch.length + ' cambio(s)). Los celulares de portería la reciben en su próxima actualización.', 'info', 6000);
        sucio = false;
        cargar();
      } catch (e) { AP.toast('No se pudo guardar: ' + e.message, 'error', 9000); }
      finally { guardarBtn.disabled = false; }
    }
    function exportarSemana() {
      var l = visibles();
      if (!l.length) return AP.toast('No hay personas con el filtro actual.', 'warn');
      var celda = function (p, y) {
        var c = (actual[p.id] || {})[y] || '', t = trabaja(c) ? turnoDeCod(c) : null, x = extraDe(p.id, y), ex = (extras[p.id] || {})[y];
        return c === 'D' ? 'Descanso' : c ? c + (t ? ' (' + t.e + '–' + t.s + ')' : '') + (x ? ' + ' + extraCorto(Number(ex.a) || 0, Number(ex.d) || 0) + ' extra' : '') : '';
      };
      var cols = [['Persona', function (p) { return p.Title; }, 30], ['Documento', function (p) { return p.NumDoc; }, 15], ['Área', function (p) { return p.Area; }, 18], ['Cargo', function (p) { return p.Cargo; }, 20]]
        .concat(fechas.map(function (y, i) { return [DIAS[i] + ' ' + fDia(y), function (p) { return celda(p, y); }, 22]; }),
          [['Horas programadas', function (p) { return Math.round(horasFila(p) * 10) / 10; }, 12], ['Horas extra', function (p) { return Math.round(extraFila(p) / 6) / 10; }, 10]]);
      AP.exportar('Programacion_planta_' + lun, cols, l, 'xlsx', [['Grupo', gNombre || 'Personal propio sin jefe inmediato'], ['Semana', lun + ' a ' + fechas[6]], ['Estado', sucio ? 'Con cambios sin guardar' : 'Guardada'],
        ['Filtro', [fArea.value, fCargo.value, fTurno.value ? AP.textoOpcion(fTurno) : '', q.value].filter(Boolean).join(' · ') || 'ninguno'],
        ['Turnos', tps.map(function (t) { return t.Codigo + ' = ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida; }).join(' · ')], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
    }
    cargar();
  };

  // =================== PANTALLA DE PLANTA ===================
  AP.route('/consola/planta', function (qs) {
    if (!AP.Session.can('planta') && !AP.Session.consulta()) { AP.go('/'); return; }
    var ED = puedeEditar();
    var tab = qs.t || 'personal';
    var content = h('div', { class: 'stack' });
    var TABS = [['personal', esJefe() ? 'Mi personal' : 'Estado del personal'], ['semana', 'Programación semanal'], ['turnos', 'Turnos y asignación'], ['horarios', 'Horarios fijos'], ['permisos', 'Permisos'], ['estadisticas', 'Estadísticas'], ['cambios', 'Registro de cambios']]
      // El registro de cambios no se muestra en los perfiles de solo consulta (Analista y Supervisor)
      .filter(function (t) { return t[0] !== 'cambios' || !AP.Session.can('consulta') || AP.Session.can('ver'); });
    var box = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    var acciones = h('div', { class: 'row gap wrap' });
    var grupoBox = h('div');
    AP.consolaShell('/consola/planta', esJefe() ? 'Mi personal y programación' : 'Programación de planta', content, ED ? acciones : AP.pill('Solo consulta', 'muted'));
    var g = '', gNombre = '', todas = null, gr = null;
    function ruta(t, extra) { return '/consola/planta?t=' + t + (esJefe() ? '' : '&j=' + encodeURIComponent(g === TODOS ? 'todos' : g || 'sin')) + (extra || ''); }
    // Consultas por grupo: con «todo el personal» se consultan todos los grupos
    function gq() { return g === TODOS ? undefined : g; }
    function jefeDe(p) { if (!p.JefeId) return ''; var j = (todas || []).find(function (x) { return x.id === p.JefeId; }); return j ? j.Title : (p.JefeNombre || ''); }
    // Pestañas que se programan por jefe inmediato: con «todo el personal» se pide elegir el grupo
    function elegirGrupo(que) {
      acciones.replaceChildren();
      box.replaceChildren(h('div', { class: 'banner info' }, AP.icon('users', 18), h('span', null, que + ' se maneja por jefe inmediato. Elija el grupo:')),
        h('div', { class: 'row gap wrap' }, gr.lista.map(function (x) {
          return h('button', { class: 'btn', type: 'button', onclick: function () { g = x.id; AP.go(ruta(tab)); } }, AP.icon('users', 18), x.nombre + ' (' + x.n + ')');
        }), h('button', { class: 'btn', type: 'button', onclick: function () { g = ''; AP.go(ruta(tab)); } }, AP.icon('users', 18), 'Personal propio sin jefe inmediato (' + gr.sinJefe + ')')));
    }
    var tabs = h('div', { class: 'tabs' });
    content.append(grupoBox, tabs, box);
    function pintarTabs() {
      tabs.replaceChildren.apply(tabs, TABS.map(function (t) { return h('a', { class: t[0] === tab ? 'on' : '', href: '#' + ruta(t[0]) }, t[1]); }));
    }
    function personal() { return D.personal(g, todas); }

    (async function iniciar() {
      try {
        if (esJefe()) {
          if (!miPid()) {
            box.replaceChildren(AP.empty('users', 'Su usuario no está vinculado a una persona registrada', 'El Director de Seguridad Integral debe vincular su usuario con su ficha en Personas (Usuarios → Editar datos → Persona registrada). Después, cierre sesión y vuelva a ingresar.'));
            return;
          }
          g = miPid(); gNombre = AP.Session.user.nombre;
          grupoBox.replaceChildren(h('p', { class: 'muted small' }, 'Personal que lo tiene a usted como jefe inmediato en su ficha. Si falta alguien o sobra alguien, el Director de Seguridad Integral lo corrige en Personas.'));
        } else {
          todas = await D.personasTodas();
          gr = await grupos(todas);
          // Al abrir «Planta», el Director ve el estado de todo el personal; puede elegir el grupo de un jefe
          var pedido = qs.j === 'sin' ? '' : qs.j === 'todos' || qs.j === undefined ? TODOS : qs.j;
          if (pedido && pedido !== TODOS && !gr.lista.some(function (x) { return x.id === pedido; })) pedido = TODOS;
          g = pedido;
          var sel = gr.lista.find(function (x) { return x.id === g; });
          gNombre = g === TODOS ? 'Todo el personal' : sel ? sel.nombre : '';
          var nTodos = todas.filter(function (p) { return p.Tipo === 'Personal propio' || !!p.JefeId; }).length;
          var s = AP.select('grupo', [['todos', 'Todo el personal (todos los jefes) (' + nTodos + ')']].concat(gr.lista.map(function (x) { return [x.id, x.nombre + (x.cargo ? ' — ' + x.cargo : '') + ' (' + x.n + ')']; }),
            [['sin', 'Personal propio sin jefe inmediato (' + gr.sinJefe + ')']]), g === TODOS ? 'todos' : g || 'sin', { style: { minWidth: 'min(24rem, 100%)' } });
          s.addEventListener('change', function () { g = s.value === 'todos' ? TODOS : s.value === 'sin' ? '' : s.value; AP.go(ruta(tab)); });
          grupoBox.replaceChildren(h('div', { class: 'filters' }, AP.field('Personal a cargo de (jefe inmediato)', s),
            h('small', { class: 'muted' }, gr.lista.length ? '«Todo el personal» muestra a todos los grupos juntos. Para programar turnos, horarios y permisos, elija el grupo de un jefe: cada jefe con personal a cargo ve y programa solo al suyo. El jefe inmediato se asigna en la ficha de cada persona (Personas).' : 'Aún no hay personas con jefe inmediato asignado. Asígnelo en la ficha de cada persona (Personas).')));
        }
        pintarTabs();
        var PORGRUPO = { semana: 'La programación semanal', turnos: 'Los turnos y su asignación', horarios: 'Los horarios fijos', permisos: 'El registro de permisos' };
        if (g === TODOS && PORGRUPO[tab]) elegirGrupo(PORGRUPO[tab]);
        else if (tab === 'semana') semana();
        else if (tab === 'turnos') turnos();
        else if (tab === 'horarios') horariosFijos();
        else if (tab === 'permisos') permisos();
        else if (tab === 'estadisticas') estadisticas();
        else if (tab === 'cambios') cambios();
        else miPersonal();
      } catch (e) { box.replaceChildren(errBox(e)); }
    })();

    // ---------- Personal a cargo: estado ahora y ficha de consulta ----------
    async function miPersonal() {
      try {
        var hoy = U.ymd(), ayer = J().addYmd(hoy, -1);
        var per = await personal();
        if (!per.length) {
          box.replaceChildren(AP.empty('users', 'No hay personal en este grupo', esJefe() ? 'Aquí aparecen las personas habilitadas que lo tienen a usted como jefe inmediato. Pídale al Director de Seguridad Integral que lo asigne en la ficha de cada persona.' : 'Asigne el jefe inmediato en la ficha de cada persona (Personas).'));
          return;
        }
        // Si una consulta secundaria falla, el personal se muestra igual, con el aviso correspondiente
        var avisos = [];
        var falla = function (txt) { return function (e) { avisos.push(txt + ' no se pudo consultar' + (e && e.offline ? ' (sin conexión)' : e && e.message ? ': ' + e.message : '') + '.'); return []; }; };
        var r = await Promise.all([D.semanas(hoy, J().addYmd(hoy, 7), gq()).catch(falla('La programación semanal')), D.horarios().catch(falla('Los horarios')), D.ausencias().catch(falla('Las ausencias')),
          D.movimientos(U.fromLocal(ayer, '00:00'), null, per).catch(falla('Los ingresos y salidas de portería')), D.permisos(U.addDays(new Date(), -1).toISOString(), per).catch(falla('Los permisos'))]);
        if (r[3].avisoLegado || r[4].avisoLegado) avisos.push(AVISO_LEGADO);
        var ctx = { semanas: J().indexarSemanas(r[0], per), horarios: r[1] };
        AP.Planta.tablero(box, per, ctx, r[3], r[2], { aviso: avisos.join(' '), jefe: g === TODOS ? jefeDe : null,
          uniformes: puedeUniforme() && (esJefe() || AP.Session.can('editar')) ? function () { AP.Planta.uniformes(per, miPersonal); } : null,
          onRow: function (f) { AP.Planta.ficha(f.p, { estado: f.e, ctx: ctx, ausencias: r[2], permisos: r[4], jefeNombre: g === TODOS ? jefeDe(f.p) : gNombre, despues: miPersonal }); } });
      } catch (e) { box.replaceChildren(errBox(e)); }
    }

    // ---------- Horarios fijos (p. ej., de 8 a 5) del personal que no rota por turnos ----------
    // Se guardan como horario de la persona (AP_Horarios) con control de puntualidad; el jefe solo crea, modifica o
    // desactiva los que él asignó a su personal. En las semanas en que la persona figure en la programación semanal,
    // esa programación reemplaza el horario fijo.
    async function horariosFijos() {
      if (ED) acciones.replaceChildren(h('button', { class: 'btn primary', type: 'button', onclick: function () { editarH(null); } }, AP.icon('plus', 18), 'Asignar horario fijo'));
      var per = [], filas = [];
      var fEst = AP.select('est', [['act', 'Activos'], ['inact', 'Inactivos'], ['', 'Activos e inactivos']], 'act');
      var q = AP.buscador('Buscar persona, documento u horario', pintar);
      fEst.addEventListener('change', pintar);
      var out = h('div', { class: 'stack' });
      function mio(x) { return AP.Session.can('editar') || (esJefe() && x.JefeId && x.JefeId === miPid()); }
      function quien(x) { return !x.JefeId ? 'Director de Seguridad Integral' : x.JefeId === g ? 'Jefe inmediato' : 'Otro jefe'; }
      function horaTxt(x) { var a = J().toMin(x.HoraEntrada), b = J().toMin(x.HoraSalida); return x.HoraEntrada + ' – ' + x.HoraSalida + (b != null && a != null && b <= a ? ' (+1 día)' : ''); }
      function vigTxt(x) { return (x.VigenteDesde ? fDia(x.VigenteDesde) : 'sin inicio') + ' → ' + (x.VigenteHasta ? fDia(x.VigenteHasta) : 'indefinida'); }
      async function cargar() {
        out.replaceChildren(AP.spinner('Consultando…'));
        try {
          var r = await Promise.all([personal(), D.horarios()]);
          per = r[0];
          var porTok = {}; per.forEach(function (p) { porTok[p.Token] = p; });
          filas = r[1].filter(function (x) { return !x._borrado && porTok[x.Token]; }).map(function (x) { return { x: x, p: porTok[x.Token] }; });
          pintar();
        } catch (e) { out.replaceChildren(errBox(e)); }
      }
      function filtradas() {
        return filas.filter(function (f) {
          if (fEst.value === 'act' && f.x.Activo === false) return false;
          if (fEst.value === 'inact' && f.x.Activo !== false) return false;
          return AP.coincide(f.p, q.value, ['Title', 'NumDoc', 'Cargo', 'Area']) || AP.coincide(f.x, q.value, ['Turno', 'HoraEntrada', 'HoraSalida']);
        }).sort(function (a, b) { return porNombre(a.p, b.p) || (a.x.HoraEntrada < b.x.HoraEntrada ? -1 : 1); });
      }
      function pintar() {
        var l = filtradas();
        var con = new Set(filas.filter(function (f) { return f.x.Activo !== false; }).map(function (f) { return f.p.id; }));
        out.replaceChildren(
          h('div', { class: 'kpis' }, kpi(per.filter(function (p) { return p.Estado === 'Habilitado'; }).length, 'Personas habilitadas'), kpi(con.size, 'Con horario fijo activo', 'brand'), kpi(l.length, 'Horarios en la vista')),
          tabla([
            ['Persona', function (f) { return h('div', null, h('strong', null, f.p.Title), h('small', { class: 'block muted' }, [f.p.NumDoc, f.p.Cargo, f.p.Area].filter(Boolean).join(' · '))); }],
            ['Horario', function (f) { return h('div', null, h('strong', null, f.x.Turno || 'Horario'), h('small', { class: 'block muted' }, horaTxt(f.x))); }],
            ['Días', function (f) { return AP.Horario.nombreDias(f.x.Dias); }],
            ['Vigencia', function (f) { return vigTxt(f.x); }],
            ['Asignado por', function (f) { return quien(f.x) + (AP.Horario.esLibre(f.x) ? ' · acceso libre' : ''); }],
            ['Estado', function (f) { return AP.pill(f.x.Activo === false ? 'Inactivo' : 'Activo', f.x.Activo === false ? 'muted' : 'ok'); }],
            ['', function (f) {
              if (!ED || !mio(f.x)) return null;
              return h('div', { class: 'row gap nowrap' }, h('button', { class: 'btn small', type: 'button', onclick: function () { editarH(f); } }, AP.icon('edit', 16), 'Editar'),
                f.x.Activo === false ? null : h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { desactivarH(f); } }, 'Desactivar'));
            }]
          ], l));
      }
      async function desactivarH(f) {
        if (!(await AP.confirm('Desactivar horario fijo', 'Se desactiva el horario «' + (f.x.Turno || 'Horario') + '» (' + horaTxt(f.x) + ') de ' + f.p.Title + '. Mientras no tenga otro horario ni turnos programados, la portería no le aplica control de puntualidad.', 'Desactivar', 'danger'))) return;
        try {
          await AP.B.update('AP_Horarios', f.x.id, { Activo: false });
          var txt = (f.x.Turno || 'Horario') + ' ' + horaTxt(f.x) + ' · ' + AP.Horario.nombreDias(f.x.Dias);
          await AP.Planta.registrarCambio('Desactivación de horario fijo', f.p.Title, txt, 1, 0, '', '', g);
          await AP.Audit.log('Desactivación de horario fijo', f.p.Title + (gNombre ? ' — ' + gNombre : ''), txt);
          AP.toast('Horario desactivado.'); cargar();
        } catch (e) { AP.toast(e.message, 'error'); }
      }
      function editarH(f) {
        var nuevo = !f, d0 = f ? f.x : { Turno: '', Dias: '1,2,3,4,5', HoraEntrada: '08:00', HoraSalida: '17:00' };
        var hab = per.filter(function (p) { return p.Estado === 'Habilitado'; });
        if (nuevo && !hab.length) return AP.toast('No hay personal habilitado en este grupo.', 'warn');
        AP.modal({ title: nuevo ? 'Asignar horario fijo' : 'Horario fijo de ' + f.p.Title, size: 'wide', body: function (close) {
          var elegidos = new Set();
          var lista = h('div', { class: 'pick-list' });
          var filtro = h('input', { type: 'search', class: 'af-input', placeholder: 'Filtrar por nombre, documento, cargo o área' });
          var cuenta = h('small', { class: 'muted' }, '0 seleccionada(s)');
          function visibles() { return hab.filter(function (p) { return AP.coincide(p, filtro.value, ['Title', 'NumDoc', 'Cargo', 'Area']); }); }
          function pintarLista() {
            lista.replaceChildren.apply(lista, visibles().map(function (p) {
              var cb = h('input', { type: 'checkbox', checked: elegidos.has(p.id) });
              cb.addEventListener('change', function () { if (cb.checked) elegidos.add(p.id); else elegidos.delete(p.id); cuenta.textContent = elegidos.size + ' seleccionada(s)'; });
              return h('label', null, cb, h('span', null, p.Title + ' · ' + [p.NumDoc, p.Cargo, p.Area].filter(Boolean).join(' · ')));
            }));
            cuenta.textContent = elegidos.size + ' seleccionada(s)';
          }
          filtro.addEventListener('input', U.debounce(pintarLista, 150)); pintarLista();
          var dias = new Set(String(d0.Dias || '').split(',').filter(Boolean));
          var diasBox = h('div', { class: 'chk-dias' }, AP.CAT.dias.map(function (d) {
            var cb = h('input', { type: 'checkbox', checked: dias.has(d[0]), dataset: { d: d[0] } });
            cb.addEventListener('change', function () { if (cb.checked) dias.add(d[0]); else dias.delete(d[0]); });
            return h('label', { class: 'check' }, cb, h('span', null, d[1]));
          }));
          function marcarDias(arr) { dias.clear(); arr.forEach(function (v) { dias.add(v); }); diasBox.querySelectorAll('input').forEach(function (i) { i.checked = dias.has(i.dataset.d); }); }
          var fx = {
            Turno: AP.input('Turno', d0.Turno || '', { maxlength: 60, placeholder: 'Ej.: Administrativo, Mantenimiento de 8 a 5' }),
            HoraEntrada: AP.input('HoraEntrada', d0.HoraEntrada, { type: 'time' }), HoraSalida: AP.input('HoraSalida', d0.HoraSalida, { type: 'time' }),
            VigenteDesde: AP.input('VigenteDesde', d0.VigenteDesde || '', { type: 'date' }), VigenteHasta: AP.input('VigenteHasta', d0.VigenteHasta || '', { type: 'date' }),
            Observaciones: AP.textarea('Observaciones', d0.Observaciones || '', { rows: 2, placeholder: 'Opcional. No escriba información de salud.' })
          };
          var prog = h('small', { class: 'muted' });
          var btn = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            var v = {}; Object.keys(fx).forEach(function (k) { v[k] = fx[k].value.trim(); });
            if (v.Turno.length < 3) return AP.toast('Escriba el nombre del horario (por ejemplo, «Administrativo»).', 'warn');
            if (J().toMin(v.HoraEntrada) == null || J().toMin(v.HoraSalida) == null || v.HoraEntrada === v.HoraSalida) return AP.toast('Revise las horas de entrada y salida.', 'warn');
            if (!dias.size) return AP.toast('Marque al menos un día de la semana.', 'warn');
            if (v.VigenteDesde && v.VigenteHasta && v.VigenteHasta < v.VigenteDesde) return AP.toast('La vigencia termina antes de empezar.', 'warn');
            if (RE_SALUD.test(v.Observaciones)) return AP.toast('Las observaciones parecen contener información de salud (dato sensible). Escriba solo el hecho general.', 'warn', 8000);
            if (nuevo && !elegidos.size) return AP.toast('Seleccione al menos una persona.', 'warn');
            var diasTxt = AP.CAT.dias.map(function (d) { return d[0]; }).filter(function (d) { return dias.has(d); }).join(',');
            var reg = { Turno: v.Turno, HoraEntrada: v.HoraEntrada, HoraSalida: v.HoraSalida, Dias: diasTxt, VigenteDesde: v.VigenteDesde, VigenteHasta: v.VigenteHasta, Observaciones: v.Observaciones, Modalidad: 'Turno' };
            var txt = v.Turno + ' ' + v.HoraEntrada + '–' + v.HoraSalida + ' · ' + AP.Horario.nombreDias(diasTxt) + (v.VigenteDesde || v.VigenteHasta ? ' · vigencia ' + (v.VigenteDesde || 'sin inicio') + ' a ' + (v.VigenteHasta || 'indefinida') : '');
            btn.disabled = true;
            try {
              if (nuevo) {
                var ids = Array.from(elegidos), nombres = [];
                for (var i = 0; i < ids.length; i++) {
                  var p = hab.find(function (z) { return z.id === ids[i]; });
                  prog.textContent = 'Guardando ' + (i + 1) + ' de ' + ids.length + '…';
                  await AP.B.create('AP_Horarios', Object.assign({ Title: p.Title, Token: p.Token, NumDoc: p.NumDoc || '', Area: p.Area || '', Activo: true, PersonaId: p.id, JefeId: g || undefined }, reg));
                  nombres.push(p.Title);
                }
                await AP.Planta.registrarCambio('Horario fijo', txt, nombres.join('\n'), nombres.length, 0, '', '', g);
                await AP.Audit.log('Asignación de horario fijo', nombres.length + ' persona(s)' + (gNombre ? ' — ' + gNombre : ''), txt);
              } else {
                var antes = (f.x.Turno || 'Horario') + ' ' + f.x.HoraEntrada + '–' + f.x.HoraSalida + ' · ' + AP.Horario.nombreDias(f.x.Dias);
                await AP.B.update('AP_Horarios', f.x.id, Object.assign({ Title: f.p.Title, Token: f.p.Token, PersonaId: f.p.id, JefeId: f.x.JefeId || g || undefined, Activo: true }, reg));
                await AP.Planta.registrarCambio('Modificación de horario fijo', f.p.Title, 'Antes: ' + antes + '. Ahora: ' + txt, 1, 0, '', '', g);
                await AP.Audit.log('Modificación de horario fijo', f.p.Title + (gNombre ? ' — ' + gNombre : ''), 'Antes: ' + antes + '. Ahora: ' + txt);
              }
              close(); AP.toast('Horario guardado. Los celulares de portería lo reciben en su próxima actualización.', 'info', 6000); cargar();
            } catch (e) { AP.toast('No se pudo guardar: ' + e.message, 'error', 9000); btn.disabled = false; }
          } }, AP.icon('check', 18), 'Guardar');
          return h('div', { class: 'stack' },
            nuevo ? h('div', { class: 'stack sm' }, h('div', { class: 'row between wrap gap' }, h('strong', null, 'Personas'), cuenta), filtro, lista,
              h('div', { class: 'row gap' }, h('button', { class: 'btn small', type: 'button', onclick: function () { visibles().forEach(function (p) { elegidos.add(p.id); }); pintarLista(); } }, 'Todas las visibles'),
                h('button', { class: 'btn small ghost', type: 'button', onclick: function () { elegidos.clear(); pintarLista(); } }, 'Ninguna')))
              : h('p', null, h('strong', null, f.p.Title), ' — ' + [f.p.NumDoc, f.p.Cargo].filter(Boolean).join(' · ')),
            h('div', { class: 'form-grid' }, AP.field('Nombre del horario *', fx.Turno, null, 'span2'), AP.field('Hora de entrada *', fx.HoraEntrada),
              AP.field('Hora de salida *', fx.HoraSalida, 'Si es menor que la de entrada, el horario termina al día siguiente.'),
              AP.field('Días de la semana *', h('div', { class: 'stack sm' }, diasBox, h('div', { class: 'row gap wrap' },
                h('button', { class: 'btn small', type: 'button', onclick: function () { marcarDias(['1', '2', '3', '4', '5']); } }, 'Lunes a viernes'),
                h('button', { class: 'btn small', type: 'button', onclick: function () { marcarDias(['1', '2', '3', '4', '5', '6']); } }, 'Lunes a sábado'))), null, 'span2'),
              AP.field('Vigente desde', fx.VigenteDesde, 'Opcional.'), AP.field('Vigente hasta', fx.VigenteHasta, 'Opcional.'), AP.field('Observaciones', fx.Observaciones, null, 'span2')),
            h('p', { class: 'note small' }, 'La portería aplica a este horario las mismas reglas de puntualidad de los turnos. En las semanas en que la persona figure en la programación semanal, esa programación reemplaza el horario fijo.'),
            prog, h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), btn));
        } });
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('clock', 18), h('span', null, 'Horario fijo para el personal que no rota por turnos (por ejemplo, lunes a viernes de 08:00 a 17:00). La portería le aplica control de puntualidad igual que a los turnos. ' +
          'Los horarios no se borran: se desactivan, y cada cambio queda en el registro de cambios.')),
        h('div', { class: 'filters' }, fEst, q, AP.btnExcel(function () {
          var l = filtradas();
          if (!l.length) return AP.toast('No hay horarios con el filtro actual.', 'warn');
          AP.exportar('Horarios_fijos', [['Persona', function (f) { return f.p.Title; }, 30], ['Documento', function (f) { return f.p.NumDoc; }, 15], ['Cargo', function (f) { return f.p.Cargo; }, 22], ['Área', function (f) { return f.p.Area; }, 16],
            ['Horario', function (f) { return f.x.Turno; }, 24], ['Entrada', function (f) { return f.x.HoraEntrada; }, 8], ['Salida', function (f) { return f.x.HoraSalida; }, 8], ['Días', function (f) { return AP.Horario.nombreDias(f.x.Dias); }, 26],
            ['Vigente desde', function (f) { return f.x.VigenteDesde; }, 12], ['Vigente hasta', function (f) { return f.x.VigenteHasta; }, 12], ['Asignado por', function (f) { return quien(f.x); }, 22],
            ['Estado', function (f) { return f.x.Activo === false ? 'Inactivo' : 'Activo'; }, 10]], l, 'xlsx',
            [['Grupo', gNombre || 'Sin jefe inmediato'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Horarios de las personas (AP_Horarios)']]);
        })), out);
      cargar();
    }

    // ---------- Programación semanal ----------
    function semana() {
      AP.Planta.semana({ box: box, acciones: acciones, g: g, gNombre: gNombre, ED: ED, s: qs.s, ir: function (ymd) { AP.go(ruta('semana', '&s=' + ymd)); }, personal: personal });
    }

    // ---------- Permisos del personal ----------
    async function permisos() {
      if (ED) acciones.replaceChildren(h('button', { class: 'btn primary', type: 'button', onclick: registrar }, AP.icon('plus', 18), 'Registrar permiso'));
      var datos = [], ops = [];
      var fEst = AP.select('est', [['', 'Todos los estados'], ['Vigente', 'Vigentes'], ['Por autorizar', 'Por autorizar'], ['Programado', 'Programados'], ['Vencido', 'Vencidos'], ['Rechazado', 'Rechazados'], ['Anulado', 'Anulados']], '');
      var fTipo = AP.select('tipo', [['', 'Todos los tipos']].concat(AP.CAT.tiposPermiso), '');
      var q = AP.buscador('Buscar persona, documento, tipo o detalle', pintar);
      [fEst, fTipo].forEach(function (s0) { s0.addEventListener('change', pintar); });
      var out = h('div');
      var ahora = Date.now();
      var estadoDe = function (p) { return AP.estadoPermiso(p, ahora); };
      var KIND = AP.KIND_PERMISO;
      function filtrados() { return datos.filter(function (p) { return (!fEst.value || estadoDe(p) === fEst.value) && (!fTipo.value || p.Tipo === fTipo.value) && AP.coincide(p, q.value, ['Title', 'NumDoc', 'Tipo', 'Detalle', 'AutorizadoPor', 'Area', estadoDe]); }); }
      function pintar() {
        out.replaceChildren(tabla([
          ['Persona', function (p) { return h('div', null, h('strong', null, p.Title), h('small', { class: 'block muted' }, [p.NumDoc, p.Area].filter(Boolean).join(' · '))); }],
          ['Tipo', function (p) { return p.Tipo; }],
          ['Vigencia', function (p) { return AP.CAT.permisosSinFin.indexOf(p.Tipo) >= 0 ? 'Desde ' + U.fDateTime(p.Desde) + ' (sin hora final)' : U.fDateTime(p.Desde) + ' → ' + U.fDateTime(p.Hasta); }],
          ['Autoriza', function (p) { return p.Estado === 'Por autorizar' ? 'Pendiente de Recursos Humanos' : p.DecididoPorNombre || p.AutorizadoPor; }],
          ['Motivo', function (p) { return p.Motivo ? h('div', null, p.Motivo, p.Remunerado ? h('small', { class: 'block muted' }, p.Remunerado) : null, p.SolicitudEmpleador ? h('small', { class: 'block muted' }, 'Lo solicita: ' + p.SolicitudEmpleador) : null) : ''; }],
          ['Detalle', function (p) { return p.Detalle; }],
          ['Estado', function (p) { var e = estadoDe(p); return h('div', null, AP.pill(e, KIND[e]), (p.MotivoAnulacion || p.MotivoDecision) ? h('small', { class: 'block muted' }, p.MotivoAnulacion || p.MotivoDecision) : null); }],
          ['', function (p) { return ED && (AP.permisoActivo(p) || p.Estado === 'Por autorizar') && new Date(p.Hasta).getTime() >= Date.now() ? h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { anular(p); } }, p.Estado === 'Por autorizar' ? 'Cancelar solicitud' : 'Anular') : null; }]
        ], filtrados()));
      }
      async function cargar() {
        out.replaceChildren(AP.spinner('Consultando…'));
        try {
          ops = await personal();
          var crudoP = await D.permisos(U.addDays(new Date(), -30).toISOString(), ops);
          datos = crudoP.map(AP.reservarPermiso).sort(function (a, b) { return a.Desde < b.Desde ? 1 : -1; });
          ahora = Date.now(); pintar();
          if (crudoP.avisoLegado) out.prepend(h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, AVISO_LEGADO)));
        } catch (e) { out.replaceChildren(errBox(e)); }
      }
      async function registrar() {
        if (!ops.length) ops = await personal();
        var hab = ops.filter(function (p) { return p.Estado === 'Habilitado'; });
        if (!hab.length) return AP.toast('No hay personal habilitado en este grupo.', 'warn');
        var p = await AP.crearPermiso({ jefe: esJefe(), planta: true, personas: hab, todas: AP.Session.can('editar') ? undefined : hab });
        if (p) cargar();
      }
      function anular(p) {
        AP.modal({ title: 'Anular permiso', body: function (close) {
          var m = AP.input('m', '', { placeholder: 'Motivo de la anulación' });
          return h('div', { class: 'stack' }, h('p', null, p.Title + ' — ' + p.Tipo), AP.field('Motivo *', m),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
              h('button', { class: 'btn danger', type: 'button', onclick: async function () {
                if (m.value.trim().length < 4) return AP.toast('Indique el motivo.', 'warn');
                try {
                  await AP.B.update('AP_Permisos', p.id, { Estado: 'Anulado', AnuladoPor: AP.Session.user.upn, MotivoAnulacion: m.value.trim(), FechaAnulacion: new Date().toISOString() });
                  await AP.Planta.registrarCambio('Anulación de permiso', p.Title + ' — ' + p.Tipo, U.fDateTime(p.Desde) + '. Motivo: ' + m.value.trim(), 1, 0, '', m.value.trim(), p.JefeId || g);
                  await AP.Audit.log('Anulación de permiso', p.Title + ' — ' + p.Tipo, m.value.trim());
                  close(); AP.toast('Permiso anulado.'); cargar();
                } catch (e) { AP.toast(e.message, 'error'); }
              } }, 'Anular permiso')));
        } });
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('key', 18), h('span', null, 'Permisos del personal: ingreso tardío, salida anticipada (sin hora final, porque no regresan), salida temporal o ingreso y salida fuera de horario. La portería los aplica al leer el QR. ' +
          'Un permiso no se borra: se anula con motivo y queda en el registro de cambios. Vacaciones y permisos de día completo los registra Talento Humano.')),
        h('div', { class: 'filters' }, fEst, fTipo, q, AP.btnExcel(function () {
          var l = filtrados();
          if (!l.length) return AP.toast('No hay permisos con el filtro actual.', 'warn');
          AP.exportar('Permisos_personal', [['Persona', function (p) { return p.Title; }, 30], ['Documento', function (p) { return p.NumDoc; }, 15], ['Área', function (p) { return p.Area; }, 16], ['Tipo', function (p) { return p.Tipo; }, 28],
            ['Desde', function (p) { return U.toDate(p.Desde); }, 17], ['Hasta', function (p) { return AP.CAT.permisosSinFin.indexOf(p.Tipo) >= 0 ? 'Sin hora final' : U.toDate(p.Hasta); }, 17], ['Estado', estadoDe, 12],
            ['Autorizado por', function (p) { return p.AutorizadoPor; }, 28], ['Detalle', function (p) { return p.Detalle; }, 36], ['Motivo de anulación', function (p) { return p.MotivoAnulacion; }, 30],
            ['Registrado por', function (p) { return p._createdBy; }, 16]], l, 'xlsx', [['Grupo', gNombre || 'Sin jefe inmediato'], ['Vista', 'Permisos (últimos 30 días y vigentes)'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
        })), out);
      cargar();
    }

    // ---------- Turnos y asignación de personas ----------
    // Turnos con su horario y, para el periodo elegido, quiénes están programados en cada uno (filtrable y descargable).
    async function turnos() {
      var hoy = U.ymd(), lun = J().lunes(hoy);
      var PER = { semana: ['Esta semana', lun, J().addYmd(lun, 6)], proxima: ['Próxima semana', J().addYmd(lun, 7), J().addYmd(lun, 13)],
        dos: ['Esta y la próxima semana', lun, J().addYmd(lun, 13)], cuatro: ['Próximas 4 semanas', lun, J().addYmd(lun, 27)] };
      var per0 = AP.select('per', Object.keys(PER).map(function (k) { return [k, PER[k][0]]; }).concat([['otro', 'Otras fechas']]), 'dos');
      var desde = AP.input('desde', PER.dos[1], { type: 'date' }), hasta = AP.input('hasta', PER.dos[2], { type: 'date' });
      per0.addEventListener('change', function () { if (PER[per0.value]) { desde.value = PER[per0.value][1]; hasta.value = PER[per0.value][2]; cargar(); } });
      [desde, hasta].forEach(function (i) { i.addEventListener('change', function () { per0.value = 'otro'; cargar(); }); });
      var fTurno = AP.select('fturno', [['', 'Todos los turnos']], ''), fArea = AP.select('farea', [['', 'Todas las áreas']], ''), fCargo = AP.select('fcargo', [['', 'Todos los cargos']], '');
      var q = AP.buscador('Buscar persona, documento o cargo', pintarPersonas);
      [fTurno, fArea, fCargo].forEach(function (s0) { s0.addEventListener('change', pintarPersonas); });
      var lista = [], per = [], filas = [], ctx = null, rango = null, sel = new Set();
      var tablaBox = h('div'), personasBox = h('div', { class: 'stack sm' }), seccion = h('section', { class: 'card stack sm', id: 'pl-por-turno' }, personasBox);
      if (ED) acciones.replaceChildren(h('button', { class: 'btn', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Nuevo turno'),
        h('button', { class: 'btn', type: 'button', onclick: function () { extra(null); } }, AP.icon('clock', 18), 'Horas extra'),
        h('button', { class: 'btn primary', type: 'button', onclick: function () { asignar(null); } }, AP.icon('users', 18), 'Asignar turno a personas'));
      function opciones(s0, vals, todosTxt) {
        var v = s0.value;
        s0.replaceChildren.apply(s0, [h('option', { value: '' }, todosTxt)].concat(vals.map(function (a) { return Array.isArray(a) ? h('option', { value: a[0] }, a[1]) : h('option', { value: a }, a); })));
        s0.value = v; if (s0.value !== v) s0.value = '';
      }
      async function cargar() {
        var a = desde.value, b = hasta.value;
        if (!a || !b || b < a) return AP.toast('Revise el periodo.', 'warn');
        if ((U.fromLocal(b, '12:00') - U.fromLocal(a, '12:00')) / 864e5 > 92) return AP.toast('Consulte máximo 92 días por vez.', 'warn');
        tablaBox.replaceChildren(AP.spinner('Consultando…')); personasBox.replaceChildren();
        try {
          var r = await Promise.all([D.turnos(g), personal()]);
          lista = r[0]; per = r[1];
          // El periodo y el día de hoy (para «Hoy»)
          ctx = await progRango(g, per, a < hoy ? a : hoy, b > hoy ? b : hoy);
          rango = [a, b];
          filas = filasTurno(ctx, per, a, b);
          sel.clear();
          var uniq = function (k) { return Array.from(new Set(per.map(function (p) { return p[k] || ''; }).filter(Boolean))).sort(); };
          opciones(fTurno, lista.map(function (t) { return [t.Codigo, t.Codigo + ' · ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida]; }).concat([['D', 'D · Descanso'], ['sin', 'Sin turno en el periodo'], ['extra', 'Con horas extra']]), 'Todos los turnos');
          opciones(fArea, uniq('Area'), 'Todas las áreas'); opciones(fCargo, uniq('Cargo'), 'Todos los cargos');
          pintarTabla(); pintarPersonas();
        } catch (e) { tablaBox.replaceChildren(errBox(e)); }
      }
      function asignar(t, ids) {
        asignarTurno(g, gNombre, per, lista, t ? t.Codigo : null, function (r) {
          // Se muestra el periodo de lo que se acaba de asignar
          if (r && rango && (r.a < rango[0] || r.b > rango[1])) { per0.value = 'otro'; desde.value = r.a < rango[0] ? r.a : rango[0]; hasta.value = r.b > rango[1] ? r.b : rango[1]; }
          if (r && t) fTurno.value = t.Codigo;
          cargar();
        }, { ids: ids });
      }
      function extra(cod, ids) {
        var d0 = rango && hoy >= rango[0] && hoy <= rango[1] ? hoy : rango ? rango[0] : hoy;
        horasExtra(g, gNombre, per, lista, { cod: cod, ids: ids, desde: d0, hasta: d0 }, cargar);
      }
      function enTurno(cod, y) { return per.filter(function (p) { var x = J().turnoDe(ctx, p.Token, y); return x && x.fuente === 'planta' && x.cod === cod; }); }
      function verTurno(cod) {
        fTurno.value = cod; pintarPersonas();
        if (seccion.scrollIntoView) seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      function pintarTabla() {
        tablaBox.replaceChildren(tabla([
          ['Código', function (t) { return h('i', { class: 'pg-c pl-c pl-t' + (lista.indexOf(t) % 8) }, t.Codigo); }],
          ['Turno', function (t) { return h('div', null, h('strong', null, t.Title), !t.JefeId ? h('small', { class: 'block muted' }, 'Turno general (Director)') : null); }],
          ['Horario', function (t) { return t.HoraEntrada + ' – ' + t.HoraSalida + (J().toMin(t.HoraSalida) <= J().toMin(t.HoraEntrada) ? ' (+1 día)' : ''); }],
          ['Horas', function (t) { return String(Math.round(J().horasTurno({ e: t.HoraEntrada, s: t.HoraSalida }) * 10) / 10); }, 'num'],
          ['Hoy', function (t) { var l = enTurno(t.Codigo, hoy); return l.length ? h('span', { title: l.map(function (p) { return p.Title; }).join(', ') }, String(l.length)) : '0'; }, 'num'],
          ['Personas en el periodo', function (t) {
            var n = filas.filter(function (f) { return f.cod === t.Codigo; }).length;
            return n ? h('button', { class: 'btn small', type: 'button', onclick: function () { verTurno(t.Codigo); } }, AP.icon('eye', 16), n + (n === 1 ? ' persona' : ' personas')) : h('span', { class: 'muted' }, 'Nadie');
          }],
          ['Estado', function (t) { return AP.pill(t.Activo === false ? 'Inactivo' : 'Activo', t.Activo === false ? 'muted' : 'ok'); }],
          ['', function (t) {
            var mio = AP.Session.can('editar') || (t.JefeId && t.JefeId === g);
            return ED ? h('div', { class: 'row gap nowrap' },
              t.Activo !== false ? h('button', { class: 'btn small', type: 'button', onclick: function () { asignar(t); } }, AP.icon('users', 16), 'Asignar personas') : null,
              mio ? h('button', { class: 'btn small', type: 'button', onclick: function () { editar(t); } }, AP.icon('edit', 16), 'Editar') : null) : null;
          }]
        ], lista));
      }
      function visibles() {
        var ft = fTurno.value;
        return filas.filter(function (f) {
          if (ft === 'sin') { if (f.cod) return false; }
          else if (ft === 'extra') { if (!f.extra) return false; }
          else if (ft) { if (f.cod !== ft) return false; }
          else if (!f.cod) return false;
          if (fArea.value && f.p.Area !== fArea.value) return false;
          if (fCargo.value && f.p.Cargo !== fCargo.value) return false;
          return AP.coincide(f.p, q.value, ['Title', 'NumDoc', 'Cargo', 'Area', 'NumUniforme']);
        }).sort(function (a, b) { return (a.cod === b.cod ? 0 : a.cod === '' ? 1 : b.cod === '' ? -1 : a.cod === 'D' ? 1 : b.cod === 'D' ? -1 : a.cod < b.cod ? -1 : 1) || porNombre(a.p, b.p); });
      }
      function diasTxt(f) { return f.dias.length > 8 ? f.dias.slice(0, 8).map(diaCorto).join(', ') + ' y ' + (f.dias.length - 8) + ' más' : f.dias.map(diaCorto).join(', '); }
      function pintarPersonas() {
        if (!rango) return;
        var l = visibles(), ft = fTurno.value;
        var t = lista.find(function (x) { return x.Codigo === ft; });
        var todosCb = h('input', { type: 'checkbox', 'aria-label': 'Seleccionar todas', checked: l.length && l.every(function (f) { return sel.has(f.key); }) });
        todosCb.addEventListener('change', function () { l.forEach(function (f) { if (todosCb.checked) sel.add(f.key); else sel.delete(f.key); }); pintarPersonas(); });
        var elegidas = filas.filter(function (f) { return sel.has(f.key); });
        var accionesSel = ED ? h('div', { class: 'row gap wrap' },
          h('small', { class: 'muted' }, elegidas.length + ' seleccionada(s)'),
          h('button', { class: 'btn small', type: 'button', disabled: !elegidas.length, onclick: function () {
            var ids = Array.from(new Set(elegidas.filter(function (f) { return f.cod && f.cod !== 'D'; }).map(function (f) { return f.p.id; })));
            if (!ids.length) return AP.toast('Las horas extra solo se asignan a personas con turno (no en descanso ni sin turno).', 'warn');
            extra(ft && ft !== 'extra' && ft !== 'sin' ? ft : null, ids);
          } }, AP.icon('clock', 16), 'Horas extra'),
          h('button', { class: 'btn small', type: 'button', disabled: !elegidas.length, onclick: function () {
            var lt = lista.find(function (x) { return x.Codigo === ft; });
            asignar(lt || null, Array.from(new Set(elegidas.map(function (f) { return f.p.id; }))));
          } }, AP.icon('users', 16), 'Cambiar de turno'),
          h('button', { class: 'btn small danger', type: 'button', disabled: !elegidas.filter(function (f) { return f.cod; }).length, onclick: function () { quitar(elegidas.filter(function (f) { return f.cod; })); } }, AP.icon('x', 16), 'Quitar del turno')) : null;
        var cuerpo = l.map(function (f) {
          var cb = h('input', { type: 'checkbox', checked: sel.has(f.key), 'aria-label': 'Seleccionar a ' + f.p.Title });
          cb.addEventListener('change', function () { if (cb.checked) sel.add(f.key); else sel.delete(f.key); pintarPersonas(); });
          return h('tr', null,
            ED ? h('td', { 'data-label': '' }, cb) : null,
            h('td', { 'data-label': 'Persona' }, h('strong', null, f.p.Title), h('small', { class: 'block muted' }, [f.p.NumDoc, f.p.Cargo, f.p.Area].filter(Boolean).join(' · '))),
            h('td', { 'data-label': 'Turno' }, f.cod ? h('span', null, h('i', { class: 'pg-c pl-c ' + (f.cod === 'D' ? 'pl-D' : 'pl-t' + Math.max(0, lista.findIndex(function (x) { return x.Codigo === f.cod; })) % 8) }, f.cod), ' ' + f.nombre + (f.e ? ' ' + f.e + '–' + f.s : '')) : h('span', { class: 'muted' }, 'Sin turno en el periodo')),
            h('td', { 'data-label': 'Días' }, f.dias.length ? diasTxt(f) : '—'),
            h('td', { 'data-label': 'N.º de días', class: 'num' }, String(f.dias.length)),
            h('td', { 'data-label': 'Horas', class: 'num' }, f.cod && f.cod !== 'D' ? fh(f.horas) : '—'),
            h('td', { 'data-label': 'Horas extra', class: 'num', title: f.detExtra.join('\n') }, f.extra ? fh(f.extra / 60) : '—'));
        });
        var nPers = new Set(l.filter(function (f) { return f.cod; }).map(function (f) { return f.p.id; })).size;
        personasBox.replaceChildren(
          h('div', { class: 'row between wrap gap' }, h('h3', null, ft === 'sin' ? 'Personas sin turno en el periodo' : ft === 'extra' ? 'Personas con horas extra' : t ? 'Personas en ' + t.Codigo + ' · ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida : ft === 'D' ? 'Personas con descanso' : 'Personas por turno'),
            h('small', { class: 'muted' }, 'Periodo ' + rangoTxt(rango[0], rango[1]) + ' · ' + (ft === 'sin' ? l.length + ' persona(s)' : nPers + ' persona(s), ' + l.length + ' fila(s)'))),
          h('div', { class: 'filters' }, fTurno, fArea, fCargo, q, AP.btnExcel(exportarPersonas, 'Excel de esta lista'), AP.btnExcel(function () { modalExcelTurnos(g, gNombre, per, rango); }, 'Excel por turnos (día por día)')),
          accionesSel,
          h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl no-filtro' },
            h('thead', null, h('tr', null, ED ? h('th', null, todosCb) : null, h('th', null, 'Persona'), h('th', null, 'Turno'), h('th', null, 'Días programados'), h('th', { class: 'num' }, 'N.º de días'), h('th', { class: 'num' }, 'Horas'), h('th', { class: 'num' }, 'Horas extra'))),
            h('tbody', null, cuerpo.length ? cuerpo : h('tr', null, h('td', { colspan: ED ? 7 : 6, class: 'center muted' }, ft && ft !== 'sin' && ft !== 'extra' ? 'Nadie está programado en este turno en el periodo. Use «Asignar personas» o cambie el periodo.' : 'Sin registros'))))),
          h('p', { class: 'muted small' }, 'Cada fila es una persona en un turno durante el periodo (si alguien rota entre turnos, aparece en cada uno). Los días y las horas salen de la programación guardada; las horas extra se ven al pasar el cursor.'));
      }
      async function quitar(lst) {
        var porCod = {};
        lst.forEach(function (f) { (porCod[f.cod] = porCod[f.cod] || []).push(f); });
        var incluyeHoy = rango[0] <= hoy;
        var motivo = await new Promise(function (res) {
          AP.modal({ title: 'Quitar del turno', onClose: function () { res(null); }, body: function (close) {
            var m = AP.textarea('qmot', '', { rows: 2, placeholder: incluyeHoy ? 'Motivo (obligatorio: el periodo incluye hoy o días anteriores)' : 'Motivo o nota (opcional)' });
            return h('div', { class: 'stack' },
              h('p', null, 'Se quita el turno a ' + lst.length + ' fila(s) en los días ' + rangoTxt(rango[0], rango[1]) + ' en que lo tienen (' + Object.keys(porCod).join(', ') + '). Quedan sin turno esos días y se quitan sus horas extra.'),
              AP.field(incluyeHoy ? 'Motivo *' : 'Motivo', m),
              h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
                h('button', { class: 'btn danger', type: 'button', onclick: function () {
                  if (incluyeHoy && m.value.trim().length < 6) return AP.toast('Escriba el motivo del cambio.', 'warn');
                  if (RE_SALUD.test(m.value)) return AP.toast('El motivo parece contener información de salud (dato sensible). Escriba solo el hecho general.', 'warn', 8000);
                  var v = m.value.trim(); res(v); close();
                } }, AP.icon('x', 18), 'Quitar del turno')));
          } });
        });
        if (motivo === null) return;
        try {
          var n = 0;
          for (var c in porCod) {
            var r = await aplicarAsignacion(g, gNombre, per, lista, 'X', rango[0], rango[1], ['0', '1', '2', '3', '4', '5', '6'], porCod[c].map(function (f) { return f.p.id; }), motivo, null, { soloCod: c, tipo: 'Retiro del turno' });
            n += r.cambios;
          }
          AP.toast(n + ' día(s) quitados del turno.', 'info', 6000);
          cargar();
        } catch (e) { AP.toast('No se pudo completar: ' + e.message, 'error', 9000); }
      }
      function exportarPersonas() {
        var l = visibles();
        if (!l.length) return AP.toast('No hay personas con el filtro actual.', 'warn');
        AP.exportar('Personas_por_turno_' + rango[0] + '_a_' + rango[1], [['Persona', function (f) { return f.p.Title; }, 30], ['Documento', function (f) { return f.p.NumDoc; }, 15],
          ['Cargo', function (f) { return f.p.Cargo; }, 22], ['Área', function (f) { return f.p.Area; }, 16], ['Código del turno', function (f) { return f.cod || 'Sin turno'; }, 10],
          ['Turno', function (f) { return f.nombre; }, 20], ['Entrada', function (f) { return f.e || ''; }, 8], ['Salida', function (f) { return f.s || ''; }, 8],
          ['Días programados', function (f) { return f.dias.map(diaCorto).join(', '); }, 50], ['N.º de días', function (f) { return f.dias.length; }, 9],
          ['Horas del turno', function (f) { return Math.round(f.horas * 100) / 100; }, 10], ['Horas extra', function (f) { return Math.round(f.extra / 60 * 100) / 100; }, 10],
          ['Detalle de horas extra', function (f) { return f.detExtra.join('; '); }, 40]], l, 'xlsx',
          [['Grupo', gNombre || 'Sin jefe inmediato'], ['Periodo', rango[0] + ' a ' + rango[1]], ['Filtro', [fTurno.value ? AP.textoOpcion(fTurno) : 'Todos los turnos', fArea.value, fCargo.value, q.value].filter(Boolean).join(' · ')],
            ['Fuente', 'Programación semanal de planta'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
      }
      function editar(t) {
        var nuevo = !t, d0 = t || { Codigo: 'T' + (lista.filter(function (x) { return x.JefeId === g || !x.JefeId; }).length + 1), HoraEntrada: '06:00', HoraSalida: '14:00', Activo: true };
        AP.modal({ title: nuevo ? 'Nuevo turno' : 'Turno ' + t.Codigo, body: function (close) {
          var f = { Codigo: AP.input('Codigo', d0.Codigo, { maxlength: 3, autocapitalize: 'characters', disabled: !nuevo }), Title: AP.input('Title', d0.Title, { placeholder: 'Ej.: Turno mañana' }),
            HoraEntrada: AP.input('HoraEntrada', d0.HoraEntrada, { type: 'time' }), HoraSalida: AP.input('HoraSalida', d0.HoraSalida, { type: 'time' }) };
          var act = AP.check('Activo', 'Turno activo (se puede usar al programar)', d0.Activo !== false);
          return h('div', { class: 'stack' }, h('div', { class: 'form-grid' }, AP.field('Código (1 a 3 caracteres) *', f.Codigo, 'No use «D» (descanso).'), AP.field('Nombre *', f.Title),
            AP.field('Hora de entrada *', f.HoraEntrada), AP.field('Hora de salida *', f.HoraSalida, 'Si es menor que la de entrada, el turno termina al día siguiente.'), h('div', { class: 'field span2' }, act)),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
              h('button', { class: 'btn primary', type: 'button', onclick: async function () {
                var d = { Codigo: f.Codigo.value.trim().toUpperCase(), Title: f.Title.value.trim(), HoraEntrada: f.HoraEntrada.value, HoraSalida: f.HoraSalida.value, Activo: act.querySelector('input').checked };
                if (!/^[A-Z0-9]{1,3}$/.test(d.Codigo) || d.Codigo === 'D' || d.Codigo === 'X') return AP.toast('El código debe tener de 1 a 3 letras o números y no puede ser «D» ni «X».', 'warn');
                if (nuevo && lista.some(function (x) { return x.Codigo === d.Codigo; })) return AP.toast('Ya existe un turno con ese código en este grupo.', 'warn');
                if (d.Title.length < 3) return AP.toast('Escriba el nombre del turno.', 'warn');
                if (J().toMin(d.HoraEntrada) == null || J().toMin(d.HoraSalida) == null || d.HoraEntrada === d.HoraSalida) return AP.toast('Revise las horas de entrada y salida.', 'warn');
                try {
                  if (nuevo) await AP.B.create('AP_TurnosPlanta', Object.assign({}, d, { JefeId: g || undefined, JefeNombre: gNombre || undefined }));
                  else await AP.B.update('AP_TurnosPlanta', t.id, { Title: d.Title, HoraEntrada: d.HoraEntrada, HoraSalida: d.HoraSalida, Activo: d.Activo, JefeId: t.JefeId || undefined });
                  var txt = d.Codigo + ' ' + d.Title + ' ' + d.HoraEntrada + '–' + d.HoraSalida + (d.Activo ? '' : ' (inactivo)');
                  await AP.Planta.registrarCambio(nuevo ? 'Alta de turno' : 'Modificación de turno', d.Codigo, nuevo ? txt : 'Antes: ' + t.Codigo + ' ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida + (t.Activo === false ? ' (inactivo)' : '') + '. Ahora: ' + txt, 1, 0, '', '', g);
                  await AP.Audit.log(nuevo ? 'Alta de turno de planta' : 'Modificación de turno de planta', d.Codigo + (gNombre ? ' — ' + gNombre : ''), txt);
                  close(); AP.toast('Turno guardado.'); cargar();
                } catch (e) { AP.toast(e.message, 'error'); }
              } }, AP.icon('check', 18), 'Guardar')));
        } });
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('clock', 18), h('span', null, 'Turnos con su horario y, abajo, quiénes están programados en cada uno en el periodo elegido. Con «Asignar personas» se programa a varias personas en un turno por un rango de fechas; ' +
          'con «Horas extra» se suman horas antes o después del turno. Si cambia la hora de un turno, las semanas ya guardadas conservan la hora con la que se programaron.')),
        h('div', { class: 'filters' }, AP.field('Periodo', per0), AP.field('Desde', desde), AP.field('Hasta', hasta)),
        tablaBox,
        seccion);
      cargar();
    }

    // ---------- Estadísticas del personal a cargo ----------
    function estadisticas() {
      var hoy = U.ymd(), lunes = J().lunes(hoy);
      var p0 = U.partsCO(U.fromLocal(hoy, '12:00')), anio = Number(p0.year), mes = Number(p0.month);
      var pad = function (n) { return String(n).padStart(2, '0'); };
      var finMes = function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
      var mesAnt = mes === 1 ? [anio - 1, 12] : [anio, mes - 1];
      var PRE = {
        semana: ['Esta semana', lunes, hoy], semanaAnt: ['Semana anterior', J().addYmd(lunes, -7), J().addYmd(lunes, -1)],
        mes: ['Este mes', anio + '-' + pad(mes) + '-01', hoy], mesAnt: ['Mes anterior', mesAnt[0] + '-' + pad(mesAnt[1]) + '-01', mesAnt[0] + '-' + pad(mesAnt[1]) + '-' + finMes(mesAnt[0], mesAnt[1])]
      };
      var per0 = AP.select('per', Object.keys(PRE).map(function (k) { return [k, PRE[k][0]]; }).concat([['otro', 'Otro rango']]), 'semana');
      var desde = AP.input('desde', PRE.semana[1], { type: 'date' }), hasta = AP.input('hasta', PRE.semana[2], { type: 'date' });
      per0.addEventListener('change', function () { if (PRE[per0.value]) { desde.value = PRE[per0.value][1]; hasta.value = PRE[per0.value][2]; calcular(); } });
      [desde, hasta].forEach(function (i) { i.addEventListener('change', function () { per0.value = 'otro'; }); });
      var out = h('div', { class: 'stack' });
      var res = null, rango = null, permisosR = [], porTurno = {}, porDia = {};
      async function calcular() {
        if (!desde.value || !hasta.value || hasta.value < desde.value) return AP.toast('Revise el rango de fechas.', 'warn');
        if ((U.fromLocal(hasta.value, '12:00') - U.fromLocal(desde.value, '12:00')) / 864e5 > 62) return AP.toast('Consulte máximo 62 días por vez.', 'warn');
        out.replaceChildren(AP.spinner('Calculando…'));
        try {
          var a = desde.value, b = hasta.value > hoy ? hoy : hasta.value;
          var per = await personal();
          var r = await Promise.all([D.semanas(a, b, gq()), D.horarios().catch(function () { return []; }), D.ausencias(70).catch(function () { return []; }),
            D.movimientos(U.fromLocal(J().addYmd(a, -1), '00:00'), new Date(U.fromLocal(J().addYmd(b, 1), '23:59').getTime() + 59999), per),
            D.permisos(U.fromLocal(a, '00:00').toISOString(), per).catch(function () { return []; })]);
          var ctx = { semanas: J().indexarSemanas(r[0], per), horarios: r[1] };
          res = J().compendio(per, r[3], a, b, ctx, r[2]);
          res.avisoLegado = !!r[3].avisoLegado;
          rango = [a, b];
          permisosR = r[4].filter(function (x) { return U.ymd(x.Desde) >= a && U.ymd(x.Desde) <= b && AP.permisoActivo(x); });
          // Asistencia por turno y por día (días ya transcurridos)
          porTurno = {}; porDia = {};
          res.forEach(function (x) {
            x.dias.forEach(function (d) {
              if (!d.turno || d.fecha > hoy) return;
              var asis = d.entradas.length > 0;
              var k = d.turno;
              porTurno[k] = porTurno[k] || { prog: 0, asis: 0, tarde: 0 };
              porTurno[k].prog++; if (asis) porTurno[k].asis++;
              if (d.novedades.some(function (n) { return /tard/i.test(n); })) porTurno[k].tarde++;
              porDia[d.fecha] = porDia[d.fecha] || { prog: 0, asis: 0 };
              porDia[d.fecha].prog++; if (asis) porDia[d.fecha].asis++;
            });
          });
          pintar();
        } catch (e) { out.replaceChildren(errBox(e)); }
      }
      function filasPersona() {
        var hoyY = U.ymd();
        return (res || []).map(function (x) {
          var prog = 0, asis = 0;
          x.dias.forEach(function (d) { if (d.turno && d.fecha <= hoyY) { prog++; if (d.entradas.length) asis++; } });
          return { r: x, prog: prog, asis: asis, falta: prog - asis, permisos: permisosR.filter(function (p) { return p.Token === x.p.Token; }).length };
        });
      }
      function pintar() {
        if (!res) return;
        var fp = filasPersona();
        var S = function (k) { return fp.reduce(function (a, f) { return a + f[k]; }, 0); };
        var T = function (k) { return res.reduce(function (a, x) { return a + (x.tot[k] || 0); }, 0); };
        var tardes = res.reduce(function (a, x) { return a + x.tardes; }, 0), diasAus = res.reduce(function (a, x) { return a + x.diasAus; }, 0);
        var incompletos = res.reduce(function (a, x) { return a + x.incompletos; }, 0), progH = res.reduce(function (a, x) { return a + x.programadas; }, 0), extraH = res.reduce(function (a, x) { return a + (x.extraProg || 0); }, 0);
        var turnosK = Object.keys(porTurno).sort(), diasK = Object.keys(porDia).sort();
        var tiposP = {}; permisosR.forEach(function (p) { tiposP[p.Tipo] = (tiposP[p.Tipo] || 0) + 1; });
        var topTarde = res.filter(function (x) { return x.tardes; }).sort(function (a, b) { return b.tardes - a.tardes; }).slice(0, 10);
        var serAsis = [{ k: 'F', n: 'Con ingreso' }, { k: 'D', n: 'Sin ingreso' }];
        out.replaceChildren(
          res.avisoLegado ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, AVISO_LEGADO)) : null,
          h('div', { class: 'kpis' }, kpi(res.length, 'Personas a cargo'), kpi(S('prog'), 'Turnos programados (días-persona)'), kpi(pct(S('asis'), S('prog')), 'Asistencia a turnos programados', 'brand'),
            kpi(S('falta'), 'Turnos sin ingreso registrado', S('falta') ? 'warn' : ''), kpi(tardes, 'Llegadas tarde', tardes ? 'warn' : ''), kpi(diasAus, 'Días de ausencia (Talento Humano)'),
            kpi(permisosR.length, 'Permisos en el periodo'), kpi(fh(T('total')), 'Horas en planta (portería)'), kpi(fh(progH), 'Horas programadas'), kpi(fh(extraH), 'Horas extra programadas'), kpi(incompletos, 'Registros incompletos', incompletos ? 'warn' : '')),
          turnosK.length ? h('section', { class: 'card stack sm' }, h('h3', null, 'Asistencia por turno'), AP.Viz.leyenda(serAsis),
            AP.Viz.hbars(turnosK.map(function (k) { return { label: k, valores: { F: porTurno[k].asis, D: porTurno[k].prog - porTurno[k].asis }, extra: 'Asistencia ' + pct(porTurno[k].asis, porTurno[k].prog) + (porTurno[k].tarde ? ' · ' + porTurno[k].tarde + ' tarde' : '') }; }), serAsis, { unidad: 'turnos' }),
            AP.Viz.tablaDe('Ver la tabla de datos', ['Turno', 'Programados', 'Con ingreso', 'Sin ingreso', 'Llegadas tarde', 'Asistencia'], turnosK.map(function (k) { var t = porTurno[k]; return [k, t.prog, t.asis, t.prog - t.asis, t.tarde, pct(t.asis, t.prog)]; }))) : null,
          diasK.length ? h('section', { class: 'card stack sm' }, h('h3', null, 'Asistencia por día'), AP.Viz.leyenda(serAsis),
            AP.Viz.cols(diasK.map(function (y) { return { x: y.slice(8), titulo: DIAS_LARGOS[J().dow(y)] + ' ' + fDia(y), valores: { F: porDia[y].asis, D: porDia[y].prog - porDia[y].asis } }; }), serAsis, { unidad: 'turnos' })) : null,
          h('div', { class: 'grid-2' },
            h('section', { class: 'card stack sm' }, h('h3', null, 'Llegadas tarde por persona'), topTarde.length ? AP.Viz.hbars(topTarde.map(function (x) { return { label: x.p.Title, valores: { S: x.tardes } }; }), [{ k: 'S', n: 'Llegadas tarde' }], { serie: 'llegadas tarde' }) : h('p', { class: 'muted small' }, 'Sin llegadas tarde en el periodo.')),
            h('section', { class: 'card stack sm' }, h('h3', null, 'Permisos por tipo'), Object.keys(tiposP).length ? AP.Viz.hbars(Object.keys(tiposP).map(function (k) { return { label: k, valores: { S: tiposP[k] } }; }), [{ k: 'S', n: 'Permisos' }], { serie: 'permisos' }) : h('p', { class: 'muted small' }, 'Sin permisos en el periodo.'))),
          tabla([
            ['Persona', function (f) { return h('div', null, h('strong', null, f.r.p.Title), h('small', { class: 'block muted' }, [f.r.p.Cargo, f.r.p.Area].filter(Boolean).join(' · '))); }],
            ['Turnos programados', function (f) { return String(f.prog); }, 'num'],
            ['Con ingreso', function (f) { return String(f.asis); }, 'num'],
            ['Asistencia', function (f) { return pct(f.asis, f.prog); }, 'num'],
            ['Llegadas tarde', function (f) { return String(f.r.tardes); }, 'num'],
            ['Días de ausencia', function (f) { return String(f.r.diasAus); }, 'num'],
            ['Permisos', function (f) { return String(f.permisos); }, 'num'],
            ['Horas en planta', function (f) { return fh(f.r.tot.total); }, 'num'],
            ['Horas programadas', function (f) { return fh(f.r.programadas); }, 'num'],
            ['Horas extra programadas', function (f) { return f.r.extraProg ? fh(f.r.extraProg) : '—'; }, 'num']
          ], fp.sort(function (a, b) { return (b.falta - a.falta) || (b.r.tardes - a.r.tardes) || porNombre(a.r.p, b.r.p); })),
          h('p', { class: 'muted small' }, 'Asistencia = turnos programados (ya transcurridos) en los que la persona registró ingreso en portería. Las horas en planta se cuentan entre la entrada y la salida registradas en portería. ' +
            'Los registros de portería anteriores a la asignación del jefe inmediato no se incluyen.'));
      }
      function exportar() {
        if (!res) return AP.toast('Primero calcule las estadísticas.', 'warn');
        var fp = filasPersona(), n2 = function (x) { return Math.round((x || 0) * 100) / 100; };
        AP.exportarHojas('Estadisticas_personal_' + rango[0] + '_a_' + rango[1], [
          { sheet: 'Por persona', rows: fp, cols: [['Persona', function (f) { return f.r.p.Title; }, 30], ['Documento', function (f) { return f.r.p.NumDoc; }, 15], ['Cargo', function (f) { return f.r.p.Cargo; }, 22],
            ['Área', function (f) { return f.r.p.Area; }, 16], ['Turnos programados', function (f) { return f.prog; }, 11], ['Con ingreso', function (f) { return f.asis; }, 10], ['Sin ingreso', function (f) { return f.falta; }, 10],
            ['Llegadas tarde', function (f) { return f.r.tardes; }, 10], ['Días de ausencia', function (f) { return f.r.diasAus; }, 10], ['Permisos', function (f) { return f.permisos; }, 9],
            ['Horas en planta', function (f) { return n2(f.r.tot.total); }, 10], ['Horas programadas', function (f) { return n2(f.r.programadas); }, 10], ['Horas extra programadas', function (f) { return n2(f.r.extraProg); }, 10], ['Registros incompletos', function (f) { return f.r.incompletos; }, 10]] },
          { sheet: 'Por turno', rows: Object.keys(porTurno).sort(), cols: [['Turno', function (k) { return k; }, 30], ['Programados', function (k) { return porTurno[k].prog; }, 11], ['Con ingreso', function (k) { return porTurno[k].asis; }, 11],
            ['Llegadas tarde', function (k) { return porTurno[k].tarde; }, 11]] },
          { sheet: 'Por día', rows: Object.keys(porDia).sort(), cols: [['Fecha', function (y) { return y; }, 11], ['Día', function (y) { return DIAS_LARGOS[J().dow(y)]; }, 10], ['Programados', function (y) { return porDia[y].prog; }, 11], ['Con ingreso', function (y) { return porDia[y].asis; }, 11]] },
          { sheet: 'Permisos', rows: permisosR, cols: [['Persona', function (p) { return p.Title; }, 30], ['Tipo', function (p) { return p.Tipo; }, 28], ['Desde', function (p) { return U.toDate(p.Desde); }, 17], ['Autoriza', function (p) { return p.AutorizadoPor; }, 28]] }
        ], [['Grupo', gNombre || 'Sin jefe inmediato'], ['Periodo', rango[0] + ' a ' + rango[1]], ['Fuente', 'Registros de portería, programación de turnos, permisos y ausencias'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('trend', 18), h('span', null, 'Indicadores del personal a cargo en el periodo: asistencia a los turnos programados, llegadas tarde, ausencias, permisos y horas en planta según los registros de portería.')),
        h('div', { class: 'filters' }, per0, AP.field('Desde', desde), AP.field('Hasta', hasta), h('button', { class: 'btn primary', type: 'button', onclick: calcular }, AP.icon('search', 18), 'Calcular'), AP.btnExcel(exportar)),
        out);
      calcular();
    }

    // ---------- Registro de cambios ----------
    async function cambios() {
      var datos = [];
      var fTipo = AP.select('tipo', [['', 'Todos los cambios']], '');
      var fDia = AP.select('dia', [['', 'Todos'], ['si', 'Solo con cambios en días ya iniciados']], '');
      var q = AP.buscador('Buscar usuario, semana, persona o motivo', pintar);
      var out = h('div');
      [fTipo, fDia].forEach(function (s) { s.addEventListener('change', pintar); });
      var COLS = [['Fecha', function (c) { return U.toDate(c.FechaHora); }, 17], ['Usuario (verificado por el servidor)', function (c) { return c._createdBy; }, 16], ['Nombre', function (c) { return c.UsuarioNombre; }, 26],
        ['Perfil', function (c) { return AP.rolNombre(c.Rol); }, 24], ['Tipo de cambio', function (c) { return c.Tipo; }, 24], ['Referencia', function (c) { return c.Referencia; }, 28], ['Cambios', function (c) { return Number(c.Cambios) || 0; }, 9],
        ['En días ya iniciados', function (c) { return Number(c.MismoDia) || 0; }, 12], ['Motivo', function (c) { return c.Motivo; }, 36], ['Detalle', function (c) { return c.Detalle; }, 90]];
      function filtrados() { return datos.filter(function (c) { return (!fTipo.value || c.Tipo === fTipo.value) && (!fDia.value || Number(c.MismoDia) > 0) && AP.coincide(c, q.value, ['UsuarioNombre', 'Usuario', 'Referencia', 'Detalle', 'Motivo', 'Tipo']); }); }
      function pintar() {
        out.replaceChildren(tabla([
          ['Fecha', function (c) { return U.fDateTime(c.FechaHora); }],
          ['Usuario', function (c) { return h('div', null, c.UsuarioNombre || '', h('small', { class: 'block muted' }, (c._createdBy || '') + (c.Rol ? ' · ' + AP.rolNombre(c.Rol) : ''))); }],
          ['Cambio', function (c) { return h('div', null, h('strong', null, c.Tipo), h('small', { class: 'block muted' }, c.Referencia || '')); }],
          ['Cantidad', function (c) { return h('div', null, String(c.Cambios || 0), Number(c.MismoDia) ? h('small', { class: 'block' }, AP.pill(c.MismoDia + ' en días ya iniciados', 'warn')) : null); }],
          ['Motivo', function (c) { return c.Motivo || ''; }]
        ], filtrados(), function (c) {
          AP.modal({ title: c.Tipo + ' — ' + (c.Referencia || ''), size: 'wide', body: h('div', { class: 'stack' },
            h('p', { class: 'muted small' }, U.fDateTime(c.FechaHora) + ' · ' + (c.UsuarioNombre || '') + ' (' + (c._createdBy || '') + ')' + (c.Motivo ? ' · Motivo: ' + c.Motivo : '')),
            h('pre', { class: 'pl-det' }, c.Detalle || '')) });
        }));
      }
      try {
        var crudo = await D.cambios(90, gq());
        datos = crudo.slice().sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
        Array.from(new Set(datos.map(function (c) { return c.Tipo; }).filter(Boolean))).sort().forEach(function (t) { fTipo.appendChild(h('option', { value: t }, t)); });
        box.replaceChildren(
          crudo.avisoLegado ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, AVISO_LEGADO)) : null,
          h('div', { class: 'banner info' }, AP.icon('shield', 18), h('span', null, 'Últimos 90 días. Cada cambio a la programación, a los turnos, a los permisos y a las ausencias de este grupo queda aquí con el usuario que lo hizo (verificado por el servidor) y la hora del servidor. Nadie puede modificarlo ni borrarlo.')),
          h('div', { class: 'filters' }, fTipo, fDia, q, AP.btnExcel(function () {
            var l = filtrados();
            if (!l.length) return AP.toast('No hay cambios con el filtro actual.', 'warn');
            AP.exportar('Registro_cambios_planta', COLS, l, 'xlsx', [['Grupo', gNombre || 'Sin jefe inmediato'], ['Periodo', 'Últimos 90 días'], ['Filtro', [fTipo.value, fDia.value ? 'días ya iniciados' : '', q.value].filter(Boolean).join(' · ') || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Colección AP_CambiosPlanta']]);
          })), out);
        pintar();
      } catch (e) { box.replaceChildren(errBox(e)); }
    }
  });
})();
