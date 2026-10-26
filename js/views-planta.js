/* Planta: personal a cargo de cada Jefe de Producción (las personas que lo tienen como jefe inmediato en su ficha),
 * turnos con horario, asignación de personas a turnos, programación semanal, permisos, estado en planta, estadísticas y
 * registro de cambios. El Jefe de Producción crea y modifica, nunca borra; cada cambio queda registrado. El Director de
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
    return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con el servidor' : 'No fue posible cargar la información', e && e.message, link);
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
      else l = (todas || await D.personasTodas()).filter(function (p) { return g ? p.JefeId === g : (p.Tipo === 'Personal propio' && !p.JefeId); });
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

  // ---------- Ficha de consulta de una persona (Jefe de Producción y Talento Humano: sin modificar nada) ----------
  // info: { estado, ctx, ausencias, permisos, jefeNombre }
  AP.Planta.ficha = function (p, info) {
    info = info || {};
    var hoy = U.ymd(), ahora = Date.now();
    var prox = [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var y = J().addYmd(hoy, i), t = info.ctx ? J().turnoDe(info.ctx, p.Token, y) : null;
      return { y: y, t: t };
    });
    var aus = (info.ausencias || []).filter(function (a) { return a.Token === p.Token && a.Estado !== 'Anulada' && new Date(a.Hasta).getTime() >= ahora; });
    var per = (info.permisos || []).filter(function (x) { return x.Token === p.Token && x.Estado !== 'Anulado' && new Date(x.Hasta).getTime() >= ahora; });
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
        ['Turno', function (x) { return x.t ? (x.t.cod === 'D' ? 'Descanso' : x.t.e ? x.t.nombre + ' ' + x.t.e + '–' + x.t.s + (x.t.fuente === 'horario' ? ' (horario general)' : '') : 'Sin turno') : 'Sin turno'; }]], prox),
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
    var q = AP.buscador('Buscar nombre, documento, uniforme, cargo o área', pintar);
    var out = h('div', { class: 'stack' });
    [fArea, fCargo, fEst, fClase].filter(Boolean).forEach(function (s) { s.addEventListener('change', pintar); });
    function filtradas() {
      return filas.filter(function (f) {
        if (fArea.value && f.p.Area !== fArea.value) return false;
        if (fCargo.value && f.p.Cargo !== fCargo.value) return false;
        if (fEst.value === 'fuera') { if (f.e.k === 'dentro') return false; }
        else if (fEst.value && f.e.k !== fEst.value) return false;
        if (fClase && fClase.value === 'operativas') { if (AP.CAT.clasesOperativas.indexOf(f.p.TipoPersonal) < 0) return false; }
        else if (fClase && fClase.value && f.p.TipoPersonal !== fClase.value) return false;
        return AP.coincide(f.p, q.value, ['Title', 'NumDoc', 'Cargo', 'Area', 'NumUniforme']);
      });
    }
    function pintar() {
      var l = filtradas(), n = function (k) { return l.filter(function (f) { return f.e.k === k; }).length; };
      var orden = { falta: 0, noasistio: 1, dentro: 2, programado: 3, salio: 4, ausente: 5, descanso: 6, sin: 7 };
      out.replaceChildren(
        h('div', { class: 'kpis' }, kpi(l.length, 'Personas en la vista'), kpi(n('dentro'), 'En planta ahora (adentro)', 'brand'), kpi(l.length - n('dentro'), 'Fuera de planta'),
          kpi(n('falta'), 'No han llegado a su turno', n('falta') ? 'deny' : ''), kpi(n('noasistio'), 'Sin ingreso en su turno de hoy', n('noasistio') ? 'warn' : ''),
          kpi(n('programado'), 'Programados más tarde'), kpi(n('ausente'), 'Con ausencia registrada'), kpi(n('salio'), 'Ya salieron')),
        tabla([
          ['Persona', function (f) { return h('div', null, h('strong', null, f.p.Title), h('small', { class: 'block muted' }, [f.p.NumDoc, f.p.NumUniforme ? 'Uniforme ' + f.p.NumUniforme : '', f.p.Cargo, f.p.Area, opt.clases ? f.p.TipoPersonal : ''].filter(Boolean).join(' · '))); }],
          ['Turno de hoy', function (f) { return f.e.turno || '—'; }],
          ['Estado según portería', function (f) { return h('div', null, AP.pill(f.e.txt, f.e.kind), f.e.nov ? h('small', { class: 'block txt-warn' }, f.e.nov) : null); }],
          opt.onRow ? ['', function (f) { return h('button', { class: 'btn small', type: 'button', onclick: function () { opt.onRow(f); } }, AP.icon('eye', 16), 'Ficha'); }] : null
        ].filter(Boolean), l.slice().sort(function (a, b) { return (orden[a.e.k] - orden[b.e.k]) || porNombre(a.p, b.p); }), opt.onRow));
    }
    box.replaceChildren(
      h('div', { class: 'banner info' }, AP.icon('clock', 18), h('span', null, 'Estado a las ' + U.fTime(new Date()) + ' según los registros de ingreso y salida de portería, la programación de turnos y las ausencias de Talento Humano. ' +
        '«En planta» = su último registro en portería es un ingreso. Los registros hechos sin conexión aparecen cuando el celular de portería los envía.')),
      opt.aviso ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, opt.aviso)) : null,
      h('div', { class: 'filters' }, fClase, fArea, fCargo, fEst, q, opt.uniformes ? h('button', { class: 'btn', type: 'button', onclick: opt.uniformes }, AP.icon('edit', 18), 'Números de uniforme') : null, AP.btnExcel(function () {
        var l = filtradas();
        if (!l.length) return AP.toast('No hay personas con el filtro actual.', 'warn');
        AP.exportar('Estado_del_personal', [['Persona', function (f) { return f.p.Title; }, 30], ['Documento', function (f) { return f.p.NumDoc; }, 15], ['Número de uniforme', function (f) { return f.p.NumUniforme; }, 11], ['Clase', function (f) { return f.p.TipoPersonal; }, 14],
          ['Cargo', function (f) { return f.p.Cargo; }, 22], ['Área', function (f) { return f.p.Area; }, 18], ['Turno de hoy', function (f) { return f.e.turno; }, 22],
          ['Estado según portería', function (f) { return f.e.txt; }, 34], ['Novedad', function (f) { return f.e.nov; }, 30]], l, 'xlsx',
          [['Corte', U.fDateTime(new Date())], ['Filtro', [fClase && AP.textoOpcion(fClase), fArea.value, fCargo.value, fEst.value, q.value].filter(Boolean).join(' · ') || 'ninguno'],
            ['Fuente', 'Registros de ingreso y salida de portería, programación de turnos y ausencias de Talento Humano'], ['Generado por', AP.Session.user.nombre]]);
      })), out);
    pintar();
  };

  // ---------- Excel de la programación por turnos (una hoja por turno, día por día) ----------
  async function excelPorTurnos(g, gNombre, personal, desdeYmd, hastaYmd) {
    var docs = await D.semanas(desdeYmd, hastaYmd, g);
    var ctx = { semanas: J().indexarSemanas(docs, personal), horarios: [] };
    var porTurno = {}, desc = [], resumen = {};
    var y = desdeYmd;
    while (y <= hastaYmd) {
      personal.forEach(function (p) {
        var t = J().turnoDe(ctx, p.Token, y);
        if (!t || t.fuente !== 'planta' || !t.cod) return;
        var fila = { fecha: y, p: p, t: t };
        if (t.cod === 'D') { desc.push(fila); return; }
        var k = t.cod + ' · ' + (t.nombre || t.cod) + ' ' + (t.e || '') + '–' + (t.s || '');
        (porTurno[k] = porTurno[k] || []).push(fila);
        resumen[k] = resumen[k] || { personas: new Set(), dias: 0, horas: 0 };
        resumen[k].personas.add(p.id); resumen[k].dias++; resumen[k].horas += J().horasTurno(t);
      });
      y = J().addYmd(y, 1);
    }
    var claves = Object.keys(porTurno).sort();
    if (!claves.length && !desc.length) return AP.toast('No hay turnos programados en ese periodo.', 'warn');
    var colsFila = [['Fecha', function (f) { return f.fecha; }, 11], ['Día', function (f) { return DIAS_LARGOS[J().dow(f.fecha)]; }, 10], ['Festivo', function (f) { return J().festivo(f.fecha) || ''; }, 16],
      ['Persona', function (f) { return f.p.Title; }, 30], ['Documento', function (f) { return f.p.NumDoc; }, 14], ['Cargo', function (f) { return f.p.Cargo; }, 22], ['Área', function (f) { return f.p.Area; }, 16],
      ['Entrada', function (f) { return f.t.e || ''; }, 8], ['Salida', function (f) { return f.t.s || ''; }, 8]];
    var orden = function (l) { return l.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : porNombre(a.p, b.p); }); };
    var hojas = [{ sheet: 'Resumen', rows: claves, cols: [['Turno', function (k) { return k; }, 34], ['Personas distintas', function (k) { return resumen[k].personas.size; }, 12],
      ['Turnos asignados (días-persona)', function (k) { return resumen[k].dias; }, 14], ['Horas programadas', function (k) { return Math.round(resumen[k].horas * 10) / 10; }, 12]] }];
    claves.forEach(function (k, i) { hojas.push({ sheet: ('T' + (i + 1) + ' ' + k.split(' · ')[0]).replace(/[\\\/?*\[\]:]/g, '').slice(0, 28), rows: orden(porTurno[k]), cols: colsFila }); });
    if (desc.length) hojas.push({ sheet: 'Descansos', rows: orden(desc), cols: colsFila.slice(0, 7) });
    await AP.exportarHojas('Programacion_por_turnos_' + desdeYmd + '_a_' + hastaYmd, hojas, [['Grupo', gNombre], ['Periodo', desdeYmd + ' a ' + hastaYmd],
      ['Turnos', claves.join(' | ')], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Programación semanal de planta (AP_ProgPlanta)']]);
  }
  function modalExcelTurnos(g, gNombre, personal) {
    var lun = J().lunes(U.ymd());
    AP.modal({ title: 'Descargar la programación por turnos', body: function (close) {
      var a = AP.input('a', lun, { type: 'date' }), b = AP.input('b', J().addYmd(lun, 13), { type: 'date' });
      return h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, 'Un archivo de Excel con una hoja por turno (quién está en cada turno, día por día), una hoja de descansos y un resumen. Máximo 92 días.'),
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
  // Escribe la programación semana por semana (cada semana queda con su versión y su registro de cambios).
  function asignarTurno(g, gNombre, personal, tps, turno0, despues) {
    var hoy = U.ymd();
    AP.modal({ title: 'Asignar personas a un turno', size: 'wide', body: function (close) {
      var opsT = tps.filter(function (t) { return t.Activo !== false; }).map(function (t) { return [t.Codigo, t.Codigo + ' · ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida]; }).concat([['D', 'D · Descanso'], ['X', 'Quitar el turno asignado']]);
      var tSel = AP.select('turno', opsT, turno0 || (opsT[0] || [''])[0]);
      var desde = AP.input('desde', J().addYmd(J().lunes(hoy), 7), { type: 'date' }), hasta = AP.input('hasta', J().addYmd(J().lunes(hoy), 13), { type: 'date' });
      var dias = AP.CAT.dias.map(function (d) { var c = h('input', { type: 'checkbox', checked: d[0] !== '0' }); c.dataset.d = d[0]; return { d: d[0], el: c, lab: h('label', { class: 'check' }, c, h('span', null, d[1])) }; });
      var elegidos = new Set();
      var lista = h('div', { class: 'pick-list' });
      var filtro = h('input', { type: 'search', class: 'af-input', placeholder: 'Filtrar por nombre, documento, cargo o área' });
      var hab = personal.filter(function (p) { return p.Estado === 'Habilitado'; });
      function visibles() { var t = filtro.value; return hab.filter(function (p) { return AP.coincide(p, t, ['Title', 'NumDoc', 'Cargo', 'Area']); }); }
      function pintarLista() {
        lista.replaceChildren.apply(lista, visibles().map(function (p) {
          var cb = h('input', { type: 'checkbox', checked: elegidos.has(p.id) });
          cb.addEventListener('change', function () { if (cb.checked) elegidos.add(p.id); else elegidos.delete(p.id); cuenta.textContent = elegidos.size + ' seleccionada(s)'; });
          return h('label', null, cb, h('span', null, p.Title + ' · ' + [p.Cargo, p.Area].filter(Boolean).join(' · ')));
        }));
      }
      var cuenta = h('small', { class: 'muted' }, '0 seleccionada(s)');
      filtro.addEventListener('input', U.debounce(pintarLista, 150)); pintarLista();
      var motivo = AP.textarea('motivo', '', { rows: 2, placeholder: 'Obligatorio si el rango incluye hoy o días anteriores' });
      var prog = h('div');
      var btn = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
        var a = desde.value, b = hasta.value, ds = dias.filter(function (x) { return x.el.checked; }).map(function (x) { return x.d; });
        if (!tSel.value) return AP.toast('Cree primero un turno en «Turnos».', 'warn');
        if (!a || !b || b < a) return AP.toast('Revise el rango de fechas.', 'warn');
        if ((U.fromLocal(b, '12:00') - U.fromLocal(a, '12:00')) / 864e5 > 92) return AP.toast('Asigne máximo 92 días por vez.', 'warn');
        if (!ds.length) return AP.toast('Marque al menos un día de la semana.', 'warn');
        if (!elegidos.size) return AP.toast('Seleccione al menos una persona.', 'warn');
        if (a <= hoy && motivo.value.trim().length < 6) return AP.toast('El rango incluye hoy o días anteriores: escriba el motivo del cambio.', 'warn');
        if (RE_SALUD.test(motivo.value)) return AP.toast('El motivo parece contener información de salud (dato sensible). Escriba solo el hecho general.', 'warn', 8000);
        btn.disabled = true;
        try {
          var r = await aplicarAsignacion(g, gNombre, personal, tps, tSel.value, a, b, ds, Array.from(elegidos), motivo.value.trim(), function (txt) { prog.textContent = txt; });
          close();
          AP.toast(r.cambios + ' asignación(es) guardada(s) en ' + r.semanas + ' semana(s). La portería la recibe en su próxima actualización.', 'info', 7000);
          if (despues) despues();
        } catch (e) { AP.toast('No se pudo completar: ' + e.message, 'error', 9000); btn.disabled = false; }
      } }, AP.icon('check', 18), 'Asignar');
      return h('div', { class: 'stack' },
        h('div', { class: 'form-grid' }, AP.field('Turno *', tSel, null, 'span2'), AP.field('Desde *', desde), AP.field('Hasta (inclusive) *', hasta),
          AP.field('Días de la semana *', h('div', { class: 'chk-dias' }, dias.map(function (x) { return x.lab; })), null, 'span2')),
        h('div', { class: 'stack sm' }, h('div', { class: 'row between wrap gap' }, h('strong', null, 'Personas'), cuenta), filtro, lista,
          h('div', { class: 'row gap' }, h('button', { class: 'btn small', type: 'button', onclick: function () { visibles().forEach(function (p) { elegidos.add(p.id); }); pintarLista(); cuenta.textContent = elegidos.size + ' seleccionada(s)'; } }, 'Todas las visibles'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: function () { elegidos.clear(); pintarLista(); cuenta.textContent = '0 seleccionada(s)'; } }, 'Ninguna'))),
        AP.field('Motivo o nota del cambio', motivo),
        h('p', { class: 'note small' }, 'La asignación reemplaza, en los días marcados, el turno que la persona tuviera. Cada semana afectada queda en el registro de cambios.'),
        prog,
        h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), btn));
    } });
  }
  async function aplicarAsignacion(g, gNombre, personal, tps, cod, a, b, diasSemana, ids, motivo, progreso) {
    var hoy = U.ymd(), t = tps.find(function (x) { return x.Codigo === cod; });
    var semanas = [], lun = J().lunes(a);
    while (lun <= b) { semanas.push(lun); lun = J().addYmd(lun, 7); }
    var total = 0, mismo = 0;
    for (var i = 0; i < semanas.length; i++) {
      var s = semanas[i];
      if (progreso) progreso('Guardando la semana del ' + fDia(s) + ' (' + (i + 1) + ' de ' + semanas.length + ')…');
      var doc = await D.semana(s, g);
      var datos = AP.Horario.jsonDe(doc && doc.Datos, {}), snap = AP.Horario.jsonDe(doc && doc.Turnos, {});
      var det = [], n = 0, md = 0;
      ids.forEach(function (pid) {
        var p = personal.find(function (x) { return x.id === pid; });
        if (!p) return;
        var x = datos[pid] = datos[pid] || { t: p.Token, n: p.Title, doc: p.NumDoc || '', a: p.Area || '', d: {} };
        x.t = p.Token; x.n = p.Title; x.a = p.Area || '';
        for (var k = 0; k < 7; k++) {
          var y = J().addYmd(s, k);
          if (y < a || y > b || diasSemana.indexOf(String(J().dow(y))) < 0) continue;
          var antes = x.d[y] || '', despues = cod === 'X' ? '' : cod;
          if (antes === despues) continue;
          if (despues) x.d[y] = despues; else delete x.d[y];
          n++; if (y <= hoy) md++;
          det.push(p.Title + ' — ' + DIAS[k] + ' ' + fDia(y) + ': ' + (antes || 'sin turno') + ' → ' + (despues || 'sin turno') + (y <= hoy ? ' (día ya iniciado)' : ''));
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
      await AP.Planta.registrarCambio('Asignación de turno', 'Semana del ' + fDia(s) + ' — ' + (cod === 'X' ? 'quitar turno' : cod === 'D' ? 'descanso' : cod), det.join('\n'), n, md, s, motivo, g);
      total += n; mismo += md;
    }
    await AP.Audit.log('Asignación de turno de planta', (gNombre || 'Sin jefe inmediato') + ' — ' + cod, total + ' cambio(s) entre ' + a + ' y ' + b + (mismo ? ', ' + mismo + ' en días ya iniciados' : '') + (motivo ? '. Motivo: ' + motivo : ''));
    return { cambios: total, semanas: semanas.length };
  }

  // ---------- Programación semanal (cuadrícula) ----------
  // cfg: { box, acciones, g, gNombre, ED, s (semana pedida), ir(ymd), personal: async, tps }
  AP.Planta.semana = function (cfg) {
    var box = cfg.box, acciones = cfg.acciones, ED = cfg.ED, g = cfg.g, gNombre = cfg.gNombre;
    var hoy = U.ymd();
    var lun = J().lunes(/^\d{4}-\d{2}-\d{2}$/.test(cfg.s || '') ? cfg.s : hoy);
    var fechas = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return J().addYmd(lun, i); });
    var ops = [], todos = [], tps = [], doc = null, ausencias = [], guardado = {}, actual = {};
    var sucio = false, pincel = '';
    var estadoG = h('span', { class: 'muted small' });
    var guardarBtn = h('button', { class: 'btn primary', type: 'button', onclick: guardar }, AP.icon('check', 18), 'Guardar semana');
    if (ED && acciones) acciones.replaceChildren(estadoG, guardarBtn);
    var fArea = AP.select('area', [['', 'Todas las áreas']], '');
    var fCargo = AP.select('cargo', [['', 'Todos los cargos']], '');
    var q = AP.buscador('Buscar persona, documento o cargo', function () { pintarGrid(); });
    [fArea, fCargo].forEach(function (s0) { s0.addEventListener('change', function () { pintarGrid(); }); });
    var gridBox = h('div'), segBox = h('div', { class: 'row gap wrap' });
    AP.onLeave(function () { if (sucio) AP.toast('La programación de la semana tenía cambios sin guardar.', 'warn', 7000); });
    function marcar(v) {
      sucio = v !== false;
      estadoG.textContent = sucio ? 'Cambios sin guardar' : doc ? 'Guardada ' + U.fDateTime(doc._modified) + (doc._modifiedBy ? ' · ' + doc._modifiedBy : '') : 'Semana sin programar';
      estadoG.className = sucio ? 'txt-warn small' : 'muted small';
    }
    function turnoDeCod(cod) { var t = tps.find(function (x) { return x.Codigo === cod; }); return t ? { n: t.Title, e: t.HoraEntrada, s: t.HoraSalida } : null; }
    function idxTurno(cod) { var i = tps.findIndex(function (x) { return x.Codigo === cod; }); return i < 0 ? 7 : i % 8; }
    function ausDe(p, ymd) { return ausencias.find(function (a) { return a.Token === p.Token && a.Estado !== 'Anulada' && U.ymd(a.Desde) <= ymd && U.ymd(a.Hasta) >= ymd; }); }
    var snapCache = null;
    function snapshot() { if (!snapCache) snapCache = AP.Horario.jsonDe(doc && doc.Turnos, {}); return snapCache; }
    function horasFila(p) {
      var d = actual[p.id] || {}, hs = 0;
      fechas.forEach(function (y) { var c = d[y]; if (c && c !== 'D') { var t = turnoDeCod(c) || snapshot()[c]; hs += J().horasTurno(t ? { e: t.e, s: t.s } : null); } });
      return hs;
    }
    function opcionesSel(sel, vals, todosTxt) {
      var v = sel.value;
      sel.replaceChildren.apply(sel, [h('option', { value: '' }, todosTxt)].concat(vals.map(function (a) { return h('option', { value: a }, a); })));
      sel.value = v;
    }
    async function cargar() {
      box.replaceChildren(AP.spinner('Cargando la semana…'));
      try {
        var r = await Promise.all([cfg.personal(), D.turnos(g), D.semana(lun, g), D.ausencias().catch(function () { return []; })]);
        todos = r[0];
        ops = r[0].filter(function (p) { return p.Estado === 'Habilitado' || (r[2] && AP.Horario.jsonDe(r[2].Datos, {})[p.id]); });
        tps = r[1].filter(function (t) { return t.Activo !== false; }); doc = r[2]; ausencias = r[3]; snapCache = null;
        guardado = {}; actual = {};
        var datos = AP.Horario.jsonDe(doc && doc.Datos, {});
        Object.keys(datos).forEach(function (pid) { guardado[pid] = Object.assign({}, datos[pid].d || {}); });
        ops.forEach(function (p) { actual[p.id] = Object.assign({}, guardado[p.id] || {}); });
        var uniq = function (k) { return Array.from(new Set(ops.map(function (p) { return p[k] || ''; }).filter(Boolean))).sort(); };
        opcionesSel(fArea, uniq('Area'), 'Todas las áreas'); opcionesSel(fCargo, uniq('Cargo'), 'Todos los cargos');
        pintar(); marcar(false);
      } catch (e) { box.replaceChildren(errBox(e)); }
    }
    function ir(ymd) {
      var go = function () { sucio = false; cfg.ir(ymd); };
      if (!sucio) return go();
      AP.confirm('Cambios sin guardar', 'Hay cambios sin guardar en esta semana. ¿Cambiar de semana sin guardarlos?', 'Cambiar sin guardar', 'danger').then(function (ok) { if (ok) go(); });
    }
    function pintar() {
      var fin = fechas[6];
      var semIn = AP.input('sem', lun, { type: 'date', 'aria-label': 'Ir a la semana de' });
      semIn.addEventListener('change', function () { if (semIn.value) ir(J().lunes(semIn.value)); });
      segBox.replaceChildren();
      if (ED) {
        var opciones = [{ value: '', label: 'Quitar', icon: 'x' }].concat(tps.map(function (t) { return { value: t.Codigo, label: t.Codigo + ' · ' + t.HoraEntrada + '–' + t.HoraSalida, cls: 'pl-seg-' + idxTurno(t.Codigo) }; }),
          [{ value: 'D', label: 'D · Descanso', cls: 'pl-seg-D' }]);
        if (!tps.some(function (t) { return t.Codigo === pincel; }) && pincel !== 'D') pincel = tps[0] ? tps[0].Codigo : 'D';
        segBox.append(h('strong', null, 'Pincel:'), AP.segmented('pincel', opciones, pincel, function (v) { pincel = v; }));
      }
      box.replaceChildren(
        !tps.length ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, 'Aún no hay turnos. ' + (ED ? 'Créelos primero en la pestaña «Turnos y asignación» (por ejemplo: T1 06:00–14:00, T2 14:00–22:00, T3 22:00–06:00).' : ''))) : null,
        h('div', { class: 'banner info' }, AP.icon('calendar', 18), h('span', null, 'La portería aplica a esta programación las reglas de puntualidad: ingreso habilitado desde ' + AP.Horario.cfg().minutosAntelacionTurno + ' minutos antes del turno; con ' +
          AP.Horario.cfg().minutosPendiente + ' minutos o más de retraso decide el Director. En un día sin turno o de descanso, el ingreso lo decide el Director; si la persona debe venir, prográmele el turno con anticipación. ' +
          'Los cambios de un día ya iniciado exigen motivo y quedan en el registro de cambios.')),
        h('div', { class: 'filters' },
          h('button', { class: 'btn', type: 'button', 'aria-label': 'Semana anterior', onclick: function () { ir(J().addYmd(lun, -7)); } }, AP.icon('back', 18)),
          semIn,
          h('button', { class: 'btn', type: 'button', 'aria-label': 'Semana siguiente', onclick: function () { ir(J().addYmd(lun, 7)); } }, h('span', { style: { display: 'inline-block', transform: 'scaleX(-1)' } }, AP.icon('back', 18))),
          h('strong', { class: 'pg-mes' }, 'Semana del ' + fDia(lun) + ' al ' + fDia(fin)),
          h('span', { class: 'grow' }),
          ED ? h('button', { class: 'btn', type: 'button', onclick: copiarAnterior }, AP.icon('history', 18), 'Copiar semana anterior') : null,
          ED ? h('button', { class: 'btn', type: 'button', onclick: function () { patron(null); } }, AP.icon('calendar', 18), 'Aplicar patrón') : null,
          ED ? h('button', { class: 'btn', type: 'button', onclick: function () {
            if (sucio) return AP.toast('Guarde primero los cambios de esta semana.', 'warn');
            asignarTurno(g, gNombre, todos, tps, null, cargar);
          } }, AP.icon('users', 18), 'Asignar turno a personas') : null,
          AP.btnExcel(exportarSemana, 'Excel de la semana'),
          AP.btnExcel(function () { modalExcelTurnos(g, gNombre, todos); }, 'Excel por turnos')),
        h('div', { class: 'filters' }, fArea, fCargo, q),
        ED ? h('section', { class: 'card stack sm' }, h('div', { class: 'row between wrap gap' }, segBox,
          h('small', { class: 'muted' }, 'Elija el turno y haga clic (o arrastre) sobre los días. Clic en el nombre para aplicar un patrón a esa persona.'))) : null,
        gridBox);
      pintarGrid();
    }
    function visibles() {
      return ops.filter(function (p) { return (!fArea.value || p.Area === fArea.value) && (!fCargo.value || p.Cargo === fCargo.value) && AP.coincide(p, q.value, ['Title', 'NumDoc', 'Cargo', 'Area']); });
    }
    var pintando = false;
    var soltar = function () { pintando = false; };
    document.addEventListener('pointerup', soltar);
    AP.onLeave(function () { document.removeEventListener('pointerup', soltar); });
    function claseCelda(c, ymd) { return 'pg-c pl-c' + (c === 'D' ? ' pl-D' : c ? ' pl-t' + idxTurno(c) : '') + (ymd < hoy ? ' pl-pas' : ymd === hoy ? ' pl-hoy' : ''); }
    function pintarCelda(btn) {
      if (!ED) return;
      var pid = btn.dataset.p, y = btn.dataset.y;
      var d = actual[pid] = actual[pid] || {};
      if ((d[y] || '') === pincel) return;
      if (pincel) d[y] = pincel; else delete d[y];
      btn.textContent = pincel || '·';
      btn.className = claseCelda(pincel, y);
      marcar();
      var p = ops.find(function (x) { return x.id === pid; });
      var tr = btn.closest('tr');
      if (tr && p) { var hs = horasFila(p); var td = tr.querySelector('.pl-h'); td.textContent = fh(hs); td.classList.toggle('txt-deny', hs > maxSemanal()); }
      pintarPie();
    }
    var pie = null;
    function pintarPie() {
      if (!pie) return;
      pie.replaceChildren.apply(pie, tps.concat([{ Codigo: 'D', Title: 'Descanso' }]).map(function (t) {
        return h('tr', null, h('th', { class: 'pg-nom', scope: 'row' }, t.Codigo + ' · ' + t.Title),
          fechas.map(function (y) { var n = ops.filter(function (p) { return (actual[p.id] || {})[y] === t.Codigo; }).length; return h('td', { class: 'pg-cob' }, String(n)); }), h('td'));
      }));
    }
    function pintarGrid() {
      var l = visibles();
      if (!ops.length) {
        gridBox.replaceChildren(AP.empty('users', 'No hay personal en este grupo', esJefe() ? 'Aquí aparecen las personas que tienen a usted como jefe inmediato en su ficha. Si falta alguien, pídale al Director de Seguridad Integral que le asigne el jefe inmediato en Personas.'
          : 'Asigne el jefe inmediato en la ficha de cada persona (Personas).'));
        return;
      }
      var cab = [h('th', { class: 'pg-nom' }, 'Persona')].concat(fechas.map(function (y, i) {
        var fest = J().festivo(y);
        return h('th', { class: 'pg-d' + (i >= 5 || fest ? ' fds' : '') + (y === hoy ? ' pl-hoy-h' : ''), title: fest || '' }, h('small', null, DIAS[i]), y.slice(8) + (fest ? '*' : ''));
      }), [h('th', { title: 'Horas programadas en la semana' }, 'Horas')]);
      var cuerpo = l.map(function (p) {
        var d = actual[p.id] || {};
        var hs = horasFila(p);
        return h('tr', null,
          h('th', { class: 'pg-nom', scope: 'row' },
            ED ? h('button', { class: 'linkish', type: 'button', title: 'Aplicar un patrón a ' + p.Title, onclick: function () { patron(p); } }, p.Title) : h('span', null, p.Title),
            h('small', { class: 'block muted' }, [p.Cargo, p.Area].filter(Boolean).join(' · ') + (p.Estado !== 'Habilitado' ? ' · INHABILITADO' : ''))),
          fechas.map(function (y) {
            var c = d[y] || '', a = ausDe(p, y);
            return h('td', { class: 'pg-td' }, h('button', { type: 'button', class: claseCelda(c, y) + (a ? ' pl-aus' : ''), dataset: { p: p.id, y: y },
              title: (a ? 'Ausencia registrada por Talento Humano: ' + a.Tipo + '. ' : '') + (c && c !== 'D' && turnoDeCod(c) ? turnoDeCod(c).n + ' ' + turnoDeCod(c).e + '–' + turnoDeCod(c).s : c === 'D' ? 'Descanso' : 'Sin turno'),
              'aria-label': p.Title + ', ' + fDia(y) + ': ' + (c ? c : 'sin turno') + (a ? ', con ausencia registrada' : '') }, c || '·'));
          }),
          h('td', { class: 'pg-tot pl-h' + (hs > maxSemanal() ? ' txt-deny' : ''), title: 'Jornada máxima semanal de referencia: ' + maxSemanal() + ' h' }, fh(hs)));
      });
      pie = h('tfoot');
      var t = h('table', { class: 'pg-grid pl-grid' }, h('thead', null, h('tr', null, cab)), h('tbody', null, cuerpo), pie);
      t.addEventListener('pointerdown', function (e) { var b = e.target.closest('.pl-c'); if (!b || !ED) return; e.preventDefault(); pintando = true; pintarCelda(b); });
      t.addEventListener('pointerover', function (e) { if (!pintando) return; var b = e.target.closest('.pl-c'); if (b) pintarCelda(b); });
      t.addEventListener('click', function (e) { var b = e.target.closest('.pl-c'); if (b && e.detail === 0) pintarCelda(b); });
      var excede = l.filter(function (p) { return horasFila(p) > maxSemanal(); });
      gridBox.replaceChildren(h('div', { class: 'pg-scroll' }, t),
        h('div', { class: 'row gap wrap pg-ley' }, tps.map(function (x) { return h('span', null, h('i', { class: 'pg-c pl-c pl-t' + idxTurno(x.Codigo) }, x.Codigo), ' ' + x.Title + ' ' + x.HoraEntrada + '–' + x.HoraSalida); }),
          h('span', null, h('i', { class: 'pg-c pl-c pl-D' }, 'D'), ' Descanso'), h('span', null, h('i', { class: 'pg-c pl-c pl-aus' }, '·'), ' Ausencia registrada por Talento Humano'),
          h('span', { class: 'muted small' }, '* Festivo')),
        excede.length ? h('p', { class: 'note small' }, excede.length + ' persona(s) con más de ' + maxSemanal() + ' horas programadas en la semana (jornada máxima ordinaria de referencia, Ley 2101 de 2021). Las horas adicionales son trabajo suplementario y deben estar autorizadas y liquidarse como tal.') : null);
      pintarPie();
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
        var datos = AP.Horario.jsonDe(prev.Datos, {}), n = 0;
        Object.keys(datos).forEach(function (pid) {
          if (!ops.some(function (p) { return p.id === pid; })) return;
          var d = actual[pid] = {};
          Object.keys(datos[pid].d || {}).forEach(function (y) { var y2 = J().addYmd(y, 7); if (fechas.indexOf(y2) >= 0) { d[y2] = datos[pid].d[y]; n++; } });
        });
        marcar(); pintarGrid();
        AP.toast(n + ' turnos copiados de la semana anterior. Revíselos y guarde.', 'info', 6000);
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
        var datos = {}, usados = {};
        // Se conserva lo programado a personas que no aparecen en la vista (por ejemplo, inhabilitadas)
        var previo = AP.Horario.jsonDe(srv && srv.Datos, {});
        Object.keys(previo).forEach(function (pid) {
          if (ops.some(function (p) { return p.id === pid; })) return;
          datos[pid] = previo[pid];
          Object.keys(previo[pid].d || {}).forEach(function (y) { var c = previo[pid].d[y]; if (c && c !== 'D') usados[c] = 1; });
        });
        ops.forEach(function (p) {
          var d = actual[p.id] || {}, dd = {};
          fechas.forEach(function (y) { if (d[y]) { dd[y] = d[y]; if (d[y] !== 'D') usados[d[y]] = 1; } });
          if (Object.keys(dd).length) datos[p.id] = { t: p.Token, n: p.Title, doc: p.NumDoc || '', a: p.Area || '', d: dd };
        });
        var snap = Object.assign({}, snapshot());
        Object.keys(usados).forEach(function (c) { var t = turnoDeCod(c); if (t) snap[c] = t; });
        Object.keys(snap).forEach(function (c) { if (!usados[c]) delete snap[c]; });
        var reg = { Title: 'Semana del ' + lun + (gNombre ? ' — ' + gNombre : ''), Semana: lun, Desde: U.fromLocal(lun, '00:00').toISOString(), Datos: JSON.stringify(datos), Turnos: JSON.stringify(snap),
          Version: ((doc && doc.Version) || 0) + 1, JefeId: g || undefined, JefeNombre: gNombre || undefined };
        if (doc) doc = await AP.B.update('AP_ProgPlanta', doc.id, reg); else doc = await AP.B.create('AP_ProgPlanta', reg);
        doc._modified = new Date().toISOString(); doc._modifiedBy = AP.Session.user.usuario;
        var nombre = function (pid) { var p = ops.find(function (x) { return x.id === pid; }); return p ? p.Title : pid; };
        var det = ch.map(function (c) { return nombre(c.pid) + ' — ' + DIAS[fechas.indexOf(c.y)] + ' ' + fDia(c.y) + ': ' + (c.antes || 'sin turno') + ' → ' + (c.despues || 'sin turno') + (c.y <= hoy ? ' (día ya iniciado)' : ''); }).join('\n');
        await AP.Planta.registrarCambio('Programación semanal', 'Semana del ' + fDia(lun), det, ch.length, mismoDia.length, lun, motivo || '', g);
        await AP.Audit.log('Programación de planta', 'Semana del ' + lun + (gNombre ? ' — ' + gNombre : ''), ch.length + ' cambio(s)' + (mismoDia.length ? ', ' + mismoDia.length + ' en días ya iniciados' : '') + (motivo ? '. Motivo: ' + motivo : ''));
        guardado = {}; Object.keys(datos).forEach(function (pid) { guardado[pid] = Object.assign({}, datos[pid].d); });
        marcar(false);
        AP.toast('Semana guardada (' + ch.length + ' cambio(s)). Los celulares de portería la reciben en su próxima actualización.', 'info', 6000);
      } catch (e) { AP.toast('No se pudo guardar: ' + e.message, 'error', 9000); }
      finally { guardarBtn.disabled = false; }
    }
    function exportarSemana() {
      var l = visibles();
      if (!l.length) return AP.toast('No hay personas con el filtro actual.', 'warn');
      var cols = [['Persona', function (p) { return p.Title; }, 30], ['Documento', function (p) { return p.NumDoc; }, 15], ['Área', function (p) { return p.Area; }, 18], ['Cargo', function (p) { return p.Cargo; }, 20]]
        .concat(fechas.map(function (y, i) { return [DIAS[i] + ' ' + fDia(y), function (p) { var c = (actual[p.id] || {})[y] || ''; var t = c && c !== 'D' ? turnoDeCod(c) : null; return c === 'D' ? 'Descanso' : c ? c + (t ? ' (' + t.e + '–' + t.s + ')' : '') : ''; }, 18]; }),
          [['Horas programadas', function (p) { return Math.round(horasFila(p) * 10) / 10; }, 12]]);
      AP.exportar('Programacion_planta_' + lun, cols, l, 'xlsx', [['Grupo', gNombre || 'Personal propio sin jefe inmediato'], ['Semana', lun + ' a ' + fechas[6]], ['Estado', sucio ? 'Con cambios sin guardar' : 'Guardada'],
        ['Turnos', tps.map(function (t) { return t.Codigo + ' = ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida; }).join(' · ')], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
    }
    cargar();
  };

  // =================== PANTALLA DE PLANTA ===================
  AP.route('/consola/planta', function (qs) {
    if (!AP.Session.can('planta') && !AP.Session.can('ver')) { AP.go('/'); return; }
    var ED = puedeEditar();
    var tab = qs.t || 'personal';
    var content = h('div', { class: 'stack' });
    var TABS = [['personal', esJefe() ? 'Mi personal' : 'Personal del grupo'], ['semana', 'Programación semanal'], ['turnos', 'Turnos y asignación'], ['horarios', 'Horarios fijos'], ['permisos', 'Permisos'], ['estadisticas', 'Estadísticas'], ['cambios', 'Registro de cambios']];
    var box = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    var acciones = h('div', { class: 'row gap wrap' });
    var grupoBox = h('div');
    AP.consolaShell('/consola/planta', esJefe() ? 'Mi personal y programación' : 'Programación de planta', content, ED ? acciones : AP.pill('Solo consulta', 'muted'));
    var g = '', gNombre = '', todas = null;
    function ruta(t, extra) { return '/consola/planta?t=' + t + (esJefe() ? '' : '&j=' + encodeURIComponent(g || 'sin')) + (extra || ''); }
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
          var gr = await grupos(todas);
          var pedido = qs.j === 'sin' ? '' : qs.j;
          if (pedido === undefined || (pedido && !gr.lista.some(function (x) { return x.id === pedido; }))) pedido = gr.lista[0] ? gr.lista[0].id : '';
          g = pedido;
          var sel = gr.lista.find(function (x) { return x.id === g; });
          gNombre = sel ? sel.nombre : '';
          var s = AP.select('grupo', gr.lista.map(function (x) { return [x.id, x.nombre + (x.cargo ? ' — ' + x.cargo : '') + ' (' + x.n + ')']; }).concat([['sin', 'Personal propio sin jefe inmediato (' + gr.sinJefe + ')']]), g || 'sin');
          s.addEventListener('change', function () { g = s.value === 'sin' ? '' : s.value; AP.go(ruta(tab)); });
          grupoBox.replaceChildren(h('div', { class: 'filters' }, AP.field('Personal a cargo de (jefe inmediato)', s),
            h('small', { class: 'muted' }, gr.lista.length ? 'Cada Jefe de Producción ve y programa solo a su grupo. El jefe inmediato se asigna en la ficha de cada persona (Personas).' : 'Aún no hay personas con jefe inmediato asignado. Asígnelo en la ficha de cada persona (Personas).')));
        }
        pintarTabs();
        if (tab === 'semana') semana();
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
        var r = await Promise.all([D.semanas(hoy, J().addYmd(hoy, 7), g).catch(falla('La programación semanal')), D.horarios().catch(falla('Los horarios')), D.ausencias().catch(falla('Las ausencias')),
          D.movimientos(U.fromLocal(ayer, '00:00'), null, per).catch(falla('Los ingresos y salidas de portería')), D.permisos(U.addDays(new Date(), -1).toISOString(), per).catch(falla('Los permisos'))]);
        if (r[3].avisoLegado || r[4].avisoLegado) avisos.push(AVISO_LEGADO);
        var ctx = { semanas: J().indexarSemanas(r[0], per), horarios: r[1] };
        AP.Planta.tablero(box, per, ctx, r[3], r[2], { aviso: avisos.join(' '),
          uniformes: puedeUniforme() && (esJefe() || AP.Session.can('editar')) ? function () { AP.Planta.uniformes(per, miPersonal); } : null,
          onRow: function (f) { AP.Planta.ficha(f.p, { estado: f.e, ctx: ctx, ausencias: r[2], permisos: r[4], jefeNombre: gNombre, despues: miPersonal }); } });
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
      var fEst = AP.select('est', [['', 'Todos los estados'], ['Vigente', 'Vigentes'], ['Programado', 'Programados'], ['Vencido', 'Vencidos'], ['Anulado', 'Anulados']], '');
      var fTipo = AP.select('tipo', [['', 'Todos los tipos']].concat(AP.CAT.tiposPermiso), '');
      var q = AP.buscador('Buscar persona, documento, tipo o detalle', pintar);
      [fEst, fTipo].forEach(function (s0) { s0.addEventListener('change', pintar); });
      var out = h('div');
      var ahora = Date.now();
      var estadoDe = function (p) { return p.Estado === 'Anulado' ? 'Anulado' : new Date(p.Hasta).getTime() < ahora ? 'Vencido' : new Date(p.Desde).getTime() > ahora ? 'Programado' : 'Vigente'; };
      var KIND = { Anulado: 'deny', Vencido: 'muted', Programado: 'warn', Vigente: 'ok' };
      function filtrados() { return datos.filter(function (p) { return (!fEst.value || estadoDe(p) === fEst.value) && (!fTipo.value || p.Tipo === fTipo.value) && AP.coincide(p, q.value, ['Title', 'NumDoc', 'Tipo', 'Detalle', 'AutorizadoPor', 'Area', estadoDe]); }); }
      function pintar() {
        out.replaceChildren(tabla([
          ['Persona', function (p) { return h('div', null, h('strong', null, p.Title), h('small', { class: 'block muted' }, [p.NumDoc, p.Area].filter(Boolean).join(' · '))); }],
          ['Tipo', function (p) { return p.Tipo; }],
          ['Vigencia', function (p) { return AP.CAT.permisosSinFin.indexOf(p.Tipo) >= 0 ? 'Desde ' + U.fDateTime(p.Desde) + ' (sin hora final)' : U.fDateTime(p.Desde) + ' → ' + U.fDateTime(p.Hasta); }],
          ['Autoriza', function (p) { return p.AutorizadoPor; }],
          ['Detalle', function (p) { return p.Detalle; }],
          ['Estado', function (p) { var e = estadoDe(p); return h('div', null, AP.pill(e, KIND[e]), p.MotivoAnulacion ? h('small', { class: 'block muted' }, p.MotivoAnulacion) : null); }],
          ['', function (p) { return ED && p.Estado !== 'Anulado' && new Date(p.Hasta).getTime() >= Date.now() ? h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { anular(p); } }, 'Anular') : null; }]
        ], filtrados()));
      }
      async function cargar() {
        out.replaceChildren(AP.spinner('Consultando…'));
        try {
          ops = await personal();
          var crudoP = await D.permisos(U.addDays(new Date(), -30).toISOString(), ops);
          datos = crudoP.slice().sort(function (a, b) { return a.Desde < b.Desde ? 1 : -1; });
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
    async function turnos() {
      if (ED) acciones.replaceChildren(h('button', { class: 'btn primary', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Nuevo turno'),
        h('button', { class: 'btn', type: 'button', onclick: function () { asignar(null); } }, AP.icon('users', 18), 'Asignar turno a personas'));
      var lista = [], per = [], prog = null;
      async function cargar() {
        box.replaceChildren(AP.spinner('Consultando…'));
        try {
          var hoy = U.ymd();
          var r = await Promise.all([D.turnos(g), personal(), D.semanas(hoy, J().addYmd(hoy, 6), g)]);
          lista = r[0]; per = r[1]; prog = { semanas: J().indexarSemanas(r[2], per), horarios: [] };
          pintar();
        } catch (e) { box.replaceChildren(errBox(e)); }
      }
      function asignar(t) { asignarTurno(g, gNombre, per, lista, t ? t.Codigo : null, cargar); }
      // Quiénes están hoy en cada turno (según la programación guardada)
      function enTurnoHoy(t) {
        var hoy = U.ymd();
        return per.filter(function (p) { var x = J().turnoDe(prog, p.Token, hoy); return x && x.fuente === 'planta' && x.cod === t.Codigo; });
      }
      function pintar() {
        box.replaceChildren(
          h('div', { class: 'banner info' }, AP.icon('clock', 18), h('span', null, 'Turnos con su horario de entrada y salida. Con «Asignar turno a personas» se programa a varias personas en un turno por un rango de fechas y días de la semana. ' +
            'Si cambia la hora de un turno, las semanas ya guardadas conservan la hora con la que se programaron.')),
          tabla([
            ['Código', function (t) { return h('i', { class: 'pg-c pl-c pl-t' + (lista.indexOf(t) % 8) }, t.Codigo); }],
            ['Turno', function (t) { return h('div', null, h('strong', null, t.Title), !t.JefeId ? h('small', { class: 'block muted' }, 'Turno general (Director)') : null); }],
            ['Horario', function (t) { return t.HoraEntrada + ' – ' + t.HoraSalida + (J().toMin(t.HoraSalida) <= J().toMin(t.HoraEntrada) ? ' (+1 día)' : ''); }],
            ['Horas', function (t) { return String(Math.round(J().horasTurno({ e: t.HoraEntrada, s: t.HoraSalida }) * 10) / 10); }, 'num'],
            ['Personas hoy', function (t) { var l = enTurnoHoy(t); return l.length ? h('span', { title: l.map(function (p) { return p.Title; }).join(', ') }, String(l.length)) : '0'; }, 'num'],
            ['Estado', function (t) { return AP.pill(t.Activo === false ? 'Inactivo' : 'Activo', t.Activo === false ? 'muted' : 'ok'); }],
            ['', function (t) {
              var mio = AP.Session.can('editar') || (t.JefeId && t.JefeId === g);
              return ED ? h('div', { class: 'row gap nowrap' },
                t.Activo !== false ? h('button', { class: 'btn small', type: 'button', onclick: function () { asignar(t); } }, AP.icon('users', 16), 'Asignar personas') : null,
                mio ? h('button', { class: 'btn small', type: 'button', onclick: function () { editar(t); } }, AP.icon('edit', 16), 'Editar') : null) : null;
            }]
          ], lista),
          h('div', { class: 'row gap wrap' }, AP.btnExcel(function () { modalExcelTurnos(g, gNombre, per); }, 'Excel de la programación por turnos')));
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
          var r = await Promise.all([D.semanas(a, b, g), D.horarios().catch(function () { return []; }), D.ausencias(70).catch(function () { return []; }),
            D.movimientos(U.fromLocal(J().addYmd(a, -1), '00:00'), new Date(U.fromLocal(J().addYmd(b, 1), '23:59').getTime() + 59999), per),
            D.permisos(U.fromLocal(a, '00:00').toISOString(), per).catch(function () { return []; })]);
          var ctx = { semanas: J().indexarSemanas(r[0], per), horarios: r[1] };
          res = J().compendio(per, r[3], a, b, ctx, r[2]);
          res.avisoLegado = !!r[3].avisoLegado;
          rango = [a, b];
          permisosR = r[4].filter(function (x) { return U.ymd(x.Desde) >= a && U.ymd(x.Desde) <= b && x.Estado !== 'Anulado'; });
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
        var incompletos = res.reduce(function (a, x) { return a + x.incompletos; }, 0), progH = res.reduce(function (a, x) { return a + x.programadas; }, 0);
        var turnosK = Object.keys(porTurno).sort(), diasK = Object.keys(porDia).sort();
        var tiposP = {}; permisosR.forEach(function (p) { tiposP[p.Tipo] = (tiposP[p.Tipo] || 0) + 1; });
        var topTarde = res.filter(function (x) { return x.tardes; }).sort(function (a, b) { return b.tardes - a.tardes; }).slice(0, 10);
        var serAsis = [{ k: 'F', n: 'Con ingreso' }, { k: 'D', n: 'Sin ingreso' }];
        out.replaceChildren(
          res.avisoLegado ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, AVISO_LEGADO)) : null,
          h('div', { class: 'kpis' }, kpi(res.length, 'Personas a cargo'), kpi(S('prog'), 'Turnos programados (días-persona)'), kpi(pct(S('asis'), S('prog')), 'Asistencia a turnos programados', 'brand'),
            kpi(S('falta'), 'Turnos sin ingreso registrado', S('falta') ? 'warn' : ''), kpi(tardes, 'Llegadas tarde', tardes ? 'warn' : ''), kpi(diasAus, 'Días de ausencia (Talento Humano)'),
            kpi(permisosR.length, 'Permisos en el periodo'), kpi(fh(T('total')), 'Horas en planta (portería)'), kpi(fh(progH), 'Horas programadas'), kpi(incompletos, 'Registros incompletos', incompletos ? 'warn' : '')),
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
            ['Horas programadas', function (f) { return fh(f.r.programadas); }, 'num']
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
            ['Horas en planta', function (f) { return n2(f.r.tot.total); }, 10], ['Horas programadas', function (f) { return n2(f.r.programadas); }, 10], ['Registros incompletos', function (f) { return f.r.incompletos; }, 10]] },
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
        ['Perfil', function (c) { return c.Rol; }, 18], ['Tipo de cambio', function (c) { return c.Tipo; }, 24], ['Referencia', function (c) { return c.Referencia; }, 28], ['Cambios', function (c) { return Number(c.Cambios) || 0; }, 9],
        ['En días ya iniciados', function (c) { return Number(c.MismoDia) || 0; }, 12], ['Motivo', function (c) { return c.Motivo; }, 36], ['Detalle', function (c) { return c.Detalle; }, 90]];
      function filtrados() { return datos.filter(function (c) { return (!fTipo.value || c.Tipo === fTipo.value) && (!fDia.value || Number(c.MismoDia) > 0) && AP.coincide(c, q.value, ['UsuarioNombre', 'Usuario', 'Referencia', 'Detalle', 'Motivo', 'Tipo']); }); }
      function pintar() {
        out.replaceChildren(tabla([
          ['Fecha', function (c) { return U.fDateTime(c.FechaHora); }],
          ['Usuario', function (c) { return h('div', null, c.UsuarioNombre || '', h('small', { class: 'block muted' }, (c._createdBy || '') + (c.Rol ? ' · ' + c.Rol : ''))); }],
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
        var crudo = await D.cambios(90, g);
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
