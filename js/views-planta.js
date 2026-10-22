/* Planta: programación semanal de turnos de los operarios (Jefe de Producción), turnos de planta, permisos de operarios,
 * estado del personal y registro de cambios. El Jefe de Producción crea y modifica, nunca borra; cada cambio queda
 * registrado. El Director de Seguridad Integral está por encima: ve, modifica y puede inhabilitar a cualquier persona.
 * Gobierno Corporativo consulta. La portería aplica a esta programación las mismas reglas de puntualidad. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h, J = function () { return AP.Jornada; };

  var DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  function errBox(e) {
    var link = e && e.indiceUrl ? h('a', { class: 'btn', href: e.indiceUrl, target: '_blank', rel: 'noopener' }, AP.icon('settings', 18), 'Crear el índice en Firebase (Director)') : null;
    return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con el servidor' : 'No fue posible cargar la información', e && e.message, link);
  }
  function tabla(cols, rows, onRow) {
    return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', null, c[0]); }))),
      h('tbody', null, rows.length ? rows.map(function (r) {
        return h('tr', { onclick: onRow ? function (e) { if (!e.target.closest('button,a,input,select')) onRow(r); } : null }, cols.map(function (c) { var v = c[1](r); return h('td', { 'data-label': c[0] }, v == null ? '' : v); }));
      }) : h('tr', null, h('td', { colspan: cols.length, class: 'center muted' }, 'Sin registros')))));
  }
  function puede() { return AP.Session.can('planta'); }          // Jefe de Producción y Director
  function completo() { return AP.Session.lectura(); }          // lectura completa (Director, Gobierno)
  function maxSemanal() { return Number(((AP.CFG || {}).jornada || {}).maximaSemanal) || 42; }
  var RE_SALUD = /(diagn[oó]stic|enfermedad|c[aá]ncer|embaraz|psiqui|psicol|terapia|cirug|incapacidad|v\.?i\.?h|medicament|tratamiento|m[eé]dic[oa]|\beps\b|\bips\b|hospital|cl[ií]nica|urgencias|odontol)/i;

  // ---------- Datos según el perfil (el Jefe solo puede leer operarios) ----------
  var D = {
    operarios: async function () {
      var l = completo() ? (await AP.B.listAll('AP_Personas', { exclude: ['Foto', 'Observaciones'] })).filter(function (p) { return p.TipoPersonal === 'Operario'; })
        : await AP.B.consulta('AP_Personas', [['TipoPersonal', '==', 'Operario']], { exclude: ['Observaciones'] });
      return l.sort(function (a, b) { return U.fold(a.Title) < U.fold(b.Title) ? -1 : 1; });
    },
    turnos: async function () { return (await AP.B.listAll('AP_TurnosPlanta')).sort(function (a, b) { return String(a.Codigo) < String(b.Codigo) ? -1 : 1; }); },
    semana: async function (ymd) { return (await AP.B.findBy('AP_ProgPlanta', 'Semana', ymd)).filter(function (x) { return !x._borrado; })[0] || null; },
    semanas: async function (desdeYmd) { return AP.B.listRange('AP_ProgPlanta', 'Desde', U.fromLocal(J().addYmd(desdeYmd, -7), '00:00'), null); },
    horarios: async function () { return AP.B.listAll('AP_Horarios'); },
    ausencias: async function () {
      if (completo()) return AP.B.listRange('AP_Ausencias', 'Hasta', U.addDays(new Date(), -60), null);
      return AP.B.consulta('AP_Ausencias', [['TipoPersonal', '==', 'Operario']]);
    },
    movimientos: async function (a, b) {
      if (completo()) return (await AP.B.listRange('AP_Movimientos', 'FechaHora', a, b)).filter(function (m) { return m.TipoPersonal === 'Operario' || /Personal propio/.test(m.Categoria || ''); });
      return AP.B.consulta('AP_Movimientos', [['TipoPersonal', '==', 'Operario'], ['FechaHora', '>=', a], ['FechaHora', '<=', b || new Date(Date.now() + 864e5)]]);
    },
    permisos: async function (desde) {
      if (completo()) return (await AP.B.listRange('AP_Permisos', 'Hasta', desde, null)).filter(function (p) { return p.TipoPersonal === 'Operario'; });
      return AP.B.consulta('AP_Permisos', [['TipoPersonal', '==', 'Operario'], ['Hasta', '>=', desde]]);
    },
    cambios: async function (dias) { return AP.B.listRange('AP_CambiosPlanta', 'FechaHora', U.addDays(new Date(), -(dias || 60)), null); }
  };

  // ---------- Registro de cambios (no se modifica ni se borra) ----------
  AP.Planta = {
    D: D,
    registrarCambio: async function (tipo, referencia, detalle, n, mismoDia, semana, motivo) {
      var u = AP.Session.user;
      await AP.B.create('AP_CambiosPlanta', {
        Title: tipo + ' — ' + referencia, Tipo: tipo, Semana: semana || '', Referencia: referencia, FechaHora: new Date().toISOString(),
        Usuario: u.upn, UsuarioNombre: u.nombre, Rol: AP.Session.rol, Cambios: n || 0, MismoDia: mismoDia || 0, Detalle: detalle || '', Motivo: motivo || ''
      });
    }
  };

  // ---------- Tablero del estado del personal (también lo usa Talento Humano) ----------
  AP.Planta.tablero = function (box, personas, ctx, movs, ausencias, opt) {
    opt = opt || {};
    var grupos = J().agrupar(movs);
    var filas = personas.filter(function (p) { return p.Estado === 'Habilitado'; }).map(function (p) { return { p: p, e: J().estadoAhora(p, grupos, ctx, ausencias) }; });
    var areas = Array.from(new Set(filas.map(function (f) { return f.p.Area || ''; }).filter(Boolean))).sort();
    var fArea = AP.select('area', [['', 'Todas las áreas']].concat(areas), '');
    var fEst = AP.select('est', [['', 'Todos los estados'], ['dentro', 'En planta'], ['falta', 'No ha llegado'], ['noasistio', 'Sin ingreso en su turno'], ['programado', 'Programado más tarde'],
      ['salio', 'Ya salió'], ['ausente', 'Ausencia registrada'], ['descanso', 'Descanso'], ['sin', 'Sin turno hoy']], '');
    var fClase = opt.clases ? AP.select('clase', [['', 'Toda clase de personal']].concat(AP.CAT.tiposPersonal), opt.claseDef || '') : null;
    var q = AP.buscador('Buscar nombre, documento, cargo o área', pintar);
    var out = h('div', { class: 'stack' });
    [fArea, fEst, fClase].filter(Boolean).forEach(function (s) { s.addEventListener('change', pintar); });
    function filtradas() {
      return filas.filter(function (f) {
        if (fArea.value && f.p.Area !== fArea.value) return false;
        if (fEst.value && f.e.k !== fEst.value) return false;
        if (fClase && fClase.value && f.p.TipoPersonal !== fClase.value) return false;
        return AP.coincide(f.p, q.value, ['Title', 'NumDoc', 'Cargo', 'Area']);
      });
    }
    function pintar() {
      var l = filtradas(), n = function (k) { return l.filter(function (f) { return f.e.k === k; }).length; };
      var kpi = function (v, t, kind) { return h('div', { class: 'kpi ' + (kind || '') }, h('strong', null, String(v)), h('span', null, t)); };
      var orden = { falta: 0, noasistio: 1, dentro: 2, programado: 3, salio: 4, ausente: 5, descanso: 6, sin: 7 };
      out.replaceChildren(
        h('div', { class: 'kpis' }, kpi(n('dentro'), 'En planta ahora', 'brand'), kpi(n('falta'), 'No han llegado a su turno', n('falta') ? 'deny' : ''),
          kpi(n('noasistio'), 'Sin ingreso en su turno de hoy', n('noasistio') ? 'warn' : ''), kpi(n('programado'), 'Programados más tarde'),
          kpi(n('ausente'), 'Con ausencia registrada'), kpi(n('salio'), 'Ya salieron')),
        tabla([
          ['Persona', function (f) { return h('div', null, h('strong', null, f.p.Title), h('small', { class: 'block muted' }, [f.p.NumDoc, f.p.Cargo, f.p.Area, opt.clases ? f.p.TipoPersonal : ''].filter(Boolean).join(' · '))); }],
          ['Turno de hoy', function (f) { return f.e.turno || '—'; }],
          ['Estado', function (f) { return h('div', null, AP.pill(f.e.txt, f.e.kind), f.e.nov ? h('small', { class: 'block txt-warn' }, f.e.nov) : null); }]
        ], l.slice().sort(function (a, b) { return (orden[a.e.k] - orden[b.e.k]) || (U.fold(a.p.Title) < U.fold(b.p.Title) ? -1 : 1); })));
    }
    box.replaceChildren(
      h('div', { class: 'banner info' }, AP.icon('clock', 18), h('span', null, 'Estado a las ' + U.fTime(new Date()) + ' según los registros de portería, la programación de turnos y las ausencias de Talento Humano. ' +
        'Los registros hechos sin conexión aparecen cuando el celular de portería los envía.')),
      h('div', { class: 'filters' }, fClase, fArea, fEst, q, AP.btnExcel(function () {
        var l = filtradas();
        if (!l.length) return AP.toast('No hay personas con el filtro actual.', 'warn');
        AP.exportar('Estado_del_personal', [['Persona', function (f) { return f.p.Title; }, 30], ['Documento', function (f) { return f.p.NumDoc; }, 15], ['Clase', function (f) { return f.p.TipoPersonal; }, 14],
          ['Cargo', function (f) { return f.p.Cargo; }, 22], ['Área', function (f) { return f.p.Area; }, 18], ['Turno de hoy', function (f) { return f.e.turno; }, 22],
          ['Estado', function (f) { return f.e.txt; }, 34], ['Novedad', function (f) { return f.e.nov; }, 30]], l, 'xlsx',
          [['Corte', U.fDateTime(new Date())], ['Filtro', [fClase && fClase.value, fArea.value, fEst.value, q.value].filter(Boolean).join(' · ') || 'ninguno'], ['Generado por', AP.Session.user.nombre]]);
      })), out);
    pintar();
  };

  // =================== PANTALLA DE PLANTA ===================
  AP.route('/consola/planta', function (qs) {
    if (!puede() && !AP.Session.can('ver')) { AP.go('/'); return; }
    var ED = puede();
    var tab = qs.t || 'semana';
    var content = h('div', { class: 'stack' });
    var tabs = h('div', { class: 'tabs' }, [['semana', 'Programación semanal'], ['estado', 'Estado del personal'], ['permisos', 'Permisos de operarios'], ['turnos', 'Turnos de planta'], ['cambios', 'Registro de cambios']].map(function (t) {
      return h('a', { class: t[0] === tab ? 'on' : '', href: '#/consola/planta?t=' + t[0] }, t[1]);
    }));
    var box = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    var acciones = h('div', { class: 'row gap wrap' });
    AP.consolaShell('/consola/planta', 'Programación de planta', content, ED ? acciones : AP.pill('Solo consulta', 'muted'));
    content.append(tabs, box);
    if (tab === 'estado') estado();
    else if (tab === 'permisos') permisos();
    else if (tab === 'turnos') turnos();
    else if (tab === 'cambios') cambios();
    else semana();

    // ---------- Programación semanal ----------
    function semana() {
      var hoy = U.ymd();
      var lun = J().lunes(/^\d{4}-\d{2}-\d{2}$/.test(qs.s || '') ? qs.s : hoy);
      var fechas = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return J().addYmd(lun, i); });
      var ops = [], tps = [], doc = null, ausencias = [], guardado = {}, actual = {};
      var sucio = false, pincel = '';
      var estadoG = h('span', { class: 'muted small' });
      var guardarBtn = h('button', { class: 'btn primary', type: 'button', onclick: guardar }, AP.icon('check', 18), 'Guardar semana');
      if (ED) acciones.replaceChildren(estadoG, guardarBtn);
      var fArea = AP.select('area', [['', 'Todas las áreas']], '');
      var q = AP.buscador('Buscar operario, documento o cargo', function () { pintarGrid(); });
      fArea.addEventListener('change', function () { pintarGrid(); });
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
      function horasFila(p) {
        var d = actual[p.id] || {}, hs = 0;
        fechas.forEach(function (y) { var c = d[y]; if (c && c !== 'D') { var t = turnoDeCod(c) || snapshot()[c]; hs += J().horasTurno(t ? { e: t.e, s: t.s } : null); } });
        return hs;
      }
      var snapCache = null;
      function snapshot() { if (!snapCache) snapCache = AP.Horario.jsonDe(doc && doc.Turnos, {}); return snapCache; }

      async function cargar() {
        box.replaceChildren(AP.spinner('Cargando la semana…'));
        try {
          var r = await Promise.all([D.operarios(), D.turnos(), D.semana(lun), D.ausencias().catch(function () { return []; })]);
          ops = r[0].filter(function (p) { return p.Estado === 'Habilitado' || (r[2] && AP.Horario.jsonDe(r[2].Datos, {})[p.id]); });
          tps = r[1].filter(function (t) { return t.Activo !== false; }); doc = r[2]; ausencias = r[3]; snapCache = null;
          guardado = {}; actual = {};
          var datos = AP.Horario.jsonDe(doc && doc.Datos, {});
          Object.keys(datos).forEach(function (pid) { guardado[pid] = Object.assign({}, datos[pid].d || {}); });
          ops.forEach(function (p) { actual[p.id] = Object.assign({}, guardado[p.id] || {}); });
          var areas = Array.from(new Set(ops.map(function (p) { return p.Area || ''; }).filter(Boolean))).sort();
          var v = fArea.value;
          fArea.replaceChildren.apply(fArea, [h('option', { value: '' }, 'Todas las áreas')].concat(areas.map(function (a) { return h('option', { value: a }, a); })));
          fArea.value = v;
          pintar(); marcar(false);
        } catch (e) { box.replaceChildren(errBox(e)); }
      }
      function ir(ymd) {
        var go = function () { sucio = false; AP.go('/consola/planta?t=semana&s=' + ymd); };
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
          !tps.length ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, 'Aún no hay turnos de planta. ' + (ED ? 'Créelos primero en la pestaña «Turnos de planta» (por ejemplo: T1 06:00–14:00, T2 14:00–22:00, T3 22:00–06:00).' : ''))) : null,
          h('div', { class: 'banner info' }, AP.icon('calendar', 18), h('span', null, 'La portería aplica a esta programación las reglas de puntualidad: ingreso habilitado desde ' + AP.Horario.cfg().minutosAntelacionTurno + ' minutos antes del turno; con ' +
            AP.Horario.cfg().minutosPendiente + ' minutos o más de retraso decide el Director. En un día sin turno o de descanso, el ingreso queda pendiente de verificación. ' +
            'Los cambios de un día ya iniciado exigen motivo y quedan en el registro de cambios.')),
          h('div', { class: 'filters' },
            h('button', { class: 'btn', type: 'button', 'aria-label': 'Semana anterior', onclick: function () { ir(J().addYmd(lun, -7)); } }, AP.icon('back', 18)),
            semIn,
            h('button', { class: 'btn', type: 'button', 'aria-label': 'Semana siguiente', onclick: function () { ir(J().addYmd(lun, 7)); } }, h('span', { style: { display: 'inline-block', transform: 'scaleX(-1)' } }, AP.icon('back', 18))),
            h('strong', { class: 'pg-mes' }, 'Semana del ' + U.fDate(U.fromLocal(lun, '12:00')) + ' al ' + U.fDate(U.fromLocal(fin, '12:00'))),
            h('span', { class: 'grow' }),
            ED ? h('button', { class: 'btn', type: 'button', onclick: copiarAnterior }, AP.icon('history', 18), 'Copiar semana anterior') : null,
            ED ? h('button', { class: 'btn', type: 'button', onclick: function () { patron(null); } }, AP.icon('calendar', 18), 'Aplicar patrón') : null,
            AP.btnExcel(exportarSemana, 'Excel de la semana')),
          h('div', { class: 'filters' }, fArea, q),
          ED ? h('section', { class: 'card stack sm' }, h('div', { class: 'row between wrap gap' }, segBox,
            h('small', { class: 'muted' }, 'Elija el turno y haga clic (o arrastre) sobre los días. Clic en el nombre para aplicar un patrón a esa persona.'))) : null,
          gridBox);
        pintarGrid();
      }
      function visibles() {
        return ops.filter(function (p) { return (!fArea.value || p.Area === fArea.value) && AP.coincide(p, q.value, ['Title', 'NumDoc', 'Cargo', 'Area']); });
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
        if (tr && p) { var hs = horasFila(p); var td = tr.querySelector('.pl-h'); td.textContent = fmtH(hs); td.classList.toggle('txt-deny', hs > maxSemanal()); }
        pintarPie();
      }
      function fmtH(n) { return (Math.round(n * 10) / 10).toLocaleString('es-CO'); }
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
        if (!ops.length) { gridBox.replaceChildren(AP.empty('users', 'No hay operarios', 'El Director de Seguridad Integral debe marcar la clase de personal «Operario» en la ficha de cada persona (Personas).')); return; }
        var cab = [h('th', { class: 'pg-nom' }, 'Operario')].concat(fechas.map(function (y, i) {
          var fest = J().festivo(y);
          return h('th', { class: 'pg-d' + (i >= 5 || fest ? ' fds' : '') + (y === hoy ? ' pl-hoy-h' : ''), title: fest || '' }, h('small', null, DIAS[i]), y.slice(8) + (fest ? '*' : ''));
        }), [h('th', { title: 'Horas programadas en la semana' }, 'Horas')]);
        var cuerpo = l.map(function (p) {
          var d = actual[p.id] || {};
          var hs = horasFila(p);
          return h('tr', null,
            h('th', { class: 'pg-nom', scope: 'row' },
              ED ? h('button', { class: 'linkish', type: 'button', title: 'Aplicar un patrón a ' + p.Title, onclick: function () { patron(p); } }, p.Title) : h('span', null, p.Title),
              h('small', { class: 'block muted' }, [p.Area, p.Cargo].filter(Boolean).join(' · ') + (p.Estado !== 'Habilitado' ? ' · INHABILITADO' : ''))),
            fechas.map(function (y) {
              var c = d[y] || '', a = ausDe(p, y);
              return h('td', { class: 'pg-td' }, h('button', { type: 'button', class: claseCelda(c, y) + (a ? ' pl-aus' : ''), dataset: { p: p.id, y: y },
                title: (a ? 'Ausencia registrada por Talento Humano: ' + a.Tipo + '. ' : '') + (c && c !== 'D' && turnoDeCod(c) ? turnoDeCod(c).n + ' ' + turnoDeCod(c).e + '–' + turnoDeCod(c).s : c === 'D' ? 'Descanso' : 'Sin turno'),
                'aria-label': p.Title + ', ' + U.fDate(U.fromLocal(y, '12:00')) + ': ' + (c ? c : 'sin turno') + (a ? ', con ausencia registrada' : '') }, c || '·'));
            }),
            h('td', { class: 'pg-tot pl-h' + (hs > maxSemanal() ? ' txt-deny' : ''), title: 'Jornada máxima semanal de referencia: ' + maxSemanal() + ' h' }, fmtH(hs)));
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
          var filtroP = h('input', { type: 'search', placeholder: 'Filtrar operarios por nombre, área o cargo' });
          function pintarLista() {
            var t = U.fold(filtroP.value);
            lista.replaceChildren.apply(lista, visibles().filter(function (p) { return !t || U.fold([p.Title, p.Area, p.Cargo, p.NumDoc].join(' ')).indexOf(t) >= 0; }).map(function (p) {
              var cb = h('input', { type: 'checkbox', checked: elegidos.has(p.id) });
              cb.addEventListener('change', function () { if (cb.checked) elegidos.add(p.id); else elegidos.delete(p.id); });
              return h('label', null, cb, h('span', null, p.Title + (p.Area ? ' · ' + p.Area : '')));
            }));
          }
          filtroP.addEventListener('input', U.debounce(pintarLista, 150)); pintarLista();
          return h('div', { class: 'stack' },
            h('div', { class: 'stack sm' }, h('strong', null, 'Operarios'), filtroP, lista,
              h('div', { class: 'row gap' }, h('button', { class: 'btn small', type: 'button', onclick: function () { visibles().forEach(function (p) { elegidos.add(p.id); }); pintarLista(); } }, 'Todos los visibles'),
                h('button', { class: 'btn small ghost', type: 'button', onclick: function () { elegidos.clear(); pintarLista(); } }, 'Ninguno'))),
            h('div', { class: 'form-grid' }, fechas.map(function (y, i) { return AP.field(DIAS[i] + ' ' + y.slice(8), sels[i]); })),
            h('div', { class: 'row gap wrap' },
              tps.slice(0, 4).map(function (t) { return h('button', { class: 'btn small', type: 'button', onclick: function () { sels.forEach(function (s, i) { s.value = i < 5 ? t.Codigo : i === 5 ? t.Codigo : 'D'; }); } }, 'Lun a sáb ' + t.Codigo + ', dom descanso'); })),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
              h('button', { class: 'btn primary', type: 'button', onclick: function () {
                if (!elegidos.size) return AP.toast('Elija al menos un operario.', 'warn');
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
          var prev = await D.semana(J().addYmd(lun, -7));
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
          var srv = await D.semana(lun);
          if ((srv && srv.Version) !== (doc && doc.Version)) {
            guardarBtn.disabled = false;
            return AP.toast('Otra persona guardó esta semana mientras usted la editaba (' + (srv && srv._modifiedBy ? srv._modifiedBy + ', ' : '') + U.fDateTime(srv && srv._modified) + '). Recargue la página y vuelva a aplicar sus cambios.', 'warn', 12000);
          }
          var datos = {}, usados = {};
          ops.forEach(function (p) {
            var d = actual[p.id] || {}, dd = {};
            fechas.forEach(function (y) { if (d[y]) { dd[y] = d[y]; if (d[y] !== 'D') usados[d[y]] = 1; } });
            if (Object.keys(dd).length) datos[p.id] = { t: p.Token, n: p.Title, doc: p.NumDoc || '', a: p.Area || '', d: dd };
          });
          var snap = Object.assign({}, snapshot());
          Object.keys(usados).forEach(function (c) { var t = turnoDeCod(c); if (t) snap[c] = t; });
          Object.keys(snap).forEach(function (c) { if (!usados[c]) delete snap[c]; });
          var reg = { Title: 'Semana del ' + lun, Semana: lun, Desde: U.fromLocal(lun, '00:00').toISOString(), Datos: JSON.stringify(datos), Turnos: JSON.stringify(snap), Version: ((doc && doc.Version) || 0) + 1 };
          if (doc) doc = await AP.B.update('AP_ProgPlanta', doc.id, reg); else doc = await AP.B.create('AP_ProgPlanta', reg);
          doc._modified = new Date().toISOString(); doc._modifiedBy = AP.Session.user.usuario;
          var nombre = function (pid) { var p = ops.find(function (x) { return x.id === pid; }); return p ? p.Title : pid; };
          var det = ch.map(function (c) { return nombre(c.pid) + ' — ' + DIAS[fechas.indexOf(c.y)] + ' ' + U.fDate(U.fromLocal(c.y, '12:00')) + ': ' + (c.antes || 'sin turno') + ' → ' + (c.despues || 'sin turno') + (c.y <= hoy ? ' (día ya iniciado)' : ''); }).join('\n');
          await AP.Planta.registrarCambio('Programación semanal', 'Semana del ' + U.fDate(U.fromLocal(lun, '12:00')), det, ch.length, mismoDia.length, lun, motivo || '');
          await AP.Audit.log('Programación de planta', 'Semana del ' + lun, ch.length + ' cambio(s)' + (mismoDia.length ? ', ' + mismoDia.length + ' en días ya iniciados' : '') + (motivo ? '. Motivo: ' + motivo : ''));
          guardado = {}; Object.keys(datos).forEach(function (pid) { guardado[pid] = Object.assign({}, datos[pid].d); });
          marcar(false);
          AP.toast('Semana guardada (' + ch.length + ' cambio(s)). Los celulares de portería la reciben en su próxima actualización.', 'info', 6000);
        } catch (e) { AP.toast('No se pudo guardar: ' + e.message, 'error', 9000); }
        finally { guardarBtn.disabled = false; }
      }
      function exportarSemana() {
        var l = visibles();
        if (!l.length) return AP.toast('No hay operarios con el filtro actual.', 'warn');
        var cols = [['Operario', function (p) { return p.Title; }, 30], ['Documento', function (p) { return p.NumDoc; }, 15], ['Área', function (p) { return p.Area; }, 18], ['Cargo', function (p) { return p.Cargo; }, 20]]
          .concat(fechas.map(function (y, i) { return [DIAS[i] + ' ' + U.fDate(U.fromLocal(y, '12:00')), function (p) { var c = (actual[p.id] || {})[y] || ''; var t = c && c !== 'D' ? turnoDeCod(c) : null; return c === 'D' ? 'Descanso' : c ? c + (t ? ' (' + t.e + '–' + t.s + ')' : '') : ''; }, 18]; }),
            [['Horas programadas', function (p) { return Math.round(horasFila(p) * 10) / 10; }, 12]]);
        AP.exportar('Programacion_planta_' + lun, cols, l, 'xlsx', [['Semana', lun + ' a ' + fechas[6]], ['Estado', sucio ? 'Con cambios sin guardar' : 'Guardada'], ['Turnos', tps.map(function (t) { return t.Codigo + ' = ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida; }).join(' · ')],
          ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
      }
      cargar();
    }

    // ---------- Estado del personal ----------
    async function estado() {
      try {
        var hoy = U.ymd(), ayer = J().addYmd(hoy, -1);
        var r = await Promise.all([D.operarios(), D.semanas(hoy), D.horarios().catch(function () { return []; }), D.ausencias().catch(function () { return []; }), D.movimientos(U.fromLocal(ayer, '00:00'), null)]);
        AP.Planta.tablero(box, r[0], { semanas: J().indexarSemanas(r[1]), horarios: r[2] }, r[4], r[3]);
      } catch (e) { box.replaceChildren(errBox(e)); }
    }

    // ---------- Permisos de operarios ----------
    async function permisos() {
      if (ED) acciones.replaceChildren(h('button', { class: 'btn primary', type: 'button', onclick: registrar }, AP.icon('plus', 18), 'Registrar permiso'));
      var datos = [], ops = [];
      var q = AP.buscador('Buscar operario, documento, tipo o detalle', pintar);
      var out = h('div');
      var ahora = Date.now();
      var estadoDe = function (p) { return p.Estado === 'Anulado' ? 'Anulado' : new Date(p.Hasta).getTime() < ahora ? 'Vencido' : new Date(p.Desde).getTime() > ahora ? 'Programado' : 'Vigente'; };
      var KIND = { Anulado: 'deny', Vencido: 'muted', Programado: 'warn', Vigente: 'ok' };
      function filtrados() { return datos.filter(function (p) { return AP.coincide(p, q.value, ['Title', 'NumDoc', 'Tipo', 'Detalle', 'AutorizadoPor', 'Area', estadoDe]); }); }
      function pintar() {
        out.replaceChildren(tabla([
          ['Operario', function (p) { return h('div', null, h('strong', null, p.Title), h('small', { class: 'block muted' }, [p.NumDoc, p.Area].filter(Boolean).join(' · '))); }],
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
          var r = await Promise.all([D.permisos(U.addDays(new Date(), -30)), ED ? D.operarios() : Promise.resolve([])]);
          datos = r[0].sort(function (a, b) { return a.Desde < b.Desde ? 1 : -1; }); ops = r[1];
          ahora = Date.now(); pintar();
        } catch (e) { out.replaceChildren(errBox(e)); }
      }
      async function registrar() {
        if (!ops.length) ops = await D.operarios();
        var hab = ops.filter(function (p) { return p.Estado === 'Habilitado'; });
        var p = await AP.crearPermiso({ jefe: !AP.Session.can('editar'), planta: true, personas: hab, todas: AP.Session.can('editar') ? undefined : hab });
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
                  await AP.Planta.registrarCambio('Anulación de permiso', p.Title + ' — ' + p.Tipo, U.fDateTime(p.Desde) + '. Motivo: ' + m.value.trim(), 1, 0, '', m.value.trim());
                  await AP.Audit.log('Anulación de permiso', p.Title + ' — ' + p.Tipo, m.value.trim());
                  close(); AP.toast('Permiso anulado.'); cargar();
                } catch (e) { AP.toast(e.message, 'error'); }
              } }, 'Anular permiso')));
        } });
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('key', 18), h('span', null, 'Permisos de los operarios: ingreso tardío, salida anticipada (sin hora final, porque no regresan), salida temporal o ingreso y salida fuera de horario. La portería los aplica al leer el QR. ' +
          'Un permiso no se borra: se anula con motivo y queda en el registro de cambios. Vacaciones y permisos de día completo los registra Talento Humano.')),
        h('div', { class: 'filters' }, q, AP.btnExcel(function () {
          var l = filtrados();
          if (!l.length) return AP.toast('No hay permisos con el filtro actual.', 'warn');
          AP.exportar('Permisos_operarios', [['Operario', function (p) { return p.Title; }, 30], ['Documento', function (p) { return p.NumDoc; }, 15], ['Área', function (p) { return p.Area; }, 16], ['Tipo', function (p) { return p.Tipo; }, 28],
            ['Desde', function (p) { return U.toDate(p.Desde); }, 17], ['Hasta', function (p) { return AP.CAT.permisosSinFin.indexOf(p.Tipo) >= 0 ? 'Sin hora final' : U.toDate(p.Hasta); }, 17], ['Estado', estadoDe, 12],
            ['Autorizado por', function (p) { return p.AutorizadoPor; }, 28], ['Detalle', function (p) { return p.Detalle; }, 36], ['Motivo de anulación', function (p) { return p.MotivoAnulacion; }, 30],
            ['Registrado por', function (p) { return p._createdBy; }, 16]], l, 'xlsx', [['Vista', 'Permisos de operarios (últimos 30 días y vigentes)'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
        })), out);
      cargar();
    }

    // ---------- Turnos de planta ----------
    async function turnos() {
      if (ED) acciones.replaceChildren(h('button', { class: 'btn primary', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Nuevo turno'));
      var lista = [];
      async function cargar() {
        box.replaceChildren(AP.spinner('Consultando…'));
        try { lista = await D.turnos(); pintar(); } catch (e) { box.replaceChildren(errBox(e)); }
      }
      function pintar() {
        box.replaceChildren(
          h('div', { class: 'banner info' }, AP.icon('clock', 18), h('span', null, 'Los turnos de planta son las plantillas con las que se programa la semana. Si cambia la hora de un turno, las semanas ya guardadas conservan la hora con la que se programaron.')),
          tabla([
            ['Código', function (t) { return h('i', { class: 'pg-c pl-c pl-t' + (lista.indexOf(t) % 8) }, t.Codigo); }],
            ['Turno', function (t) { return h('strong', null, t.Title); }],
            ['Horario', function (t) { return t.HoraEntrada + ' – ' + t.HoraSalida + (J().toMin(t.HoraSalida) <= J().toMin(t.HoraEntrada) ? ' (+1 día)' : ''); }],
            ['Horas', function (t) { return String(Math.round(J().horasTurno({ e: t.HoraEntrada, s: t.HoraSalida }) * 10) / 10); }],
            ['Estado', function (t) { return AP.pill(t.Activo === false ? 'Inactivo' : 'Activo', t.Activo === false ? 'muted' : 'ok'); }],
            ['', function (t) { return ED ? h('button', { class: 'btn small', type: 'button', onclick: function () { editar(t); } }, AP.icon('edit', 16), 'Editar') : null; }]
          ], lista));
      }
      function editar(t) {
        var nuevo = !t, d0 = t || { Codigo: 'T' + (lista.length + 1), HoraEntrada: '06:00', HoraSalida: '14:00', Activo: true };
        AP.modal({ title: nuevo ? 'Nuevo turno de planta' : 'Turno ' + t.Codigo, body: function (close) {
          var f = { Codigo: AP.input('Codigo', d0.Codigo, { maxlength: 3, autocapitalize: 'characters', disabled: !nuevo }), Title: AP.input('Title', d0.Title, { placeholder: 'Ej.: Turno mañana' }),
            HoraEntrada: AP.input('HoraEntrada', d0.HoraEntrada, { type: 'time' }), HoraSalida: AP.input('HoraSalida', d0.HoraSalida, { type: 'time' }) };
          var act = AP.check('Activo', 'Turno activo (se puede usar al programar)', d0.Activo !== false);
          return h('div', { class: 'stack' }, h('div', { class: 'form-grid' }, AP.field('Código (1 a 3 caracteres) *', f.Codigo, 'No use «D» (descanso).'), AP.field('Nombre *', f.Title),
            AP.field('Hora de entrada *', f.HoraEntrada), AP.field('Hora de salida *', f.HoraSalida, 'Si es menor que la de entrada, el turno termina al día siguiente.'), h('div', { class: 'field span2' }, act)),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
              h('button', { class: 'btn primary', type: 'button', onclick: async function () {
                var d = { Codigo: f.Codigo.value.trim().toUpperCase(), Title: f.Title.value.trim(), HoraEntrada: f.HoraEntrada.value, HoraSalida: f.HoraSalida.value, Activo: act.querySelector('input').checked };
                if (!/^[A-Z0-9]{1,3}$/.test(d.Codigo) || d.Codigo === 'D') return AP.toast('El código debe tener de 1 a 3 letras o números y no puede ser «D».', 'warn');
                if (nuevo && lista.some(function (x) { return x.Codigo === d.Codigo; })) return AP.toast('Ya existe un turno con ese código.', 'warn');
                if (d.Title.length < 3) return AP.toast('Escriba el nombre del turno.', 'warn');
                if (J().toMin(d.HoraEntrada) == null || J().toMin(d.HoraSalida) == null || d.HoraEntrada === d.HoraSalida) return AP.toast('Revise las horas de entrada y salida.', 'warn');
                try {
                  if (nuevo) await AP.B.create('AP_TurnosPlanta', d); else await AP.B.update('AP_TurnosPlanta', t.id, { Title: d.Title, HoraEntrada: d.HoraEntrada, HoraSalida: d.HoraSalida, Activo: d.Activo });
                  var txt = d.Codigo + ' ' + d.Title + ' ' + d.HoraEntrada + '–' + d.HoraSalida + (d.Activo ? '' : ' (inactivo)');
                  await AP.Planta.registrarCambio(nuevo ? 'Alta de turno de planta' : 'Modificación de turno de planta', d.Codigo, nuevo ? txt : 'Antes: ' + t.Codigo + ' ' + t.Title + ' ' + t.HoraEntrada + '–' + t.HoraSalida + (t.Activo === false ? ' (inactivo)' : '') + '. Ahora: ' + txt, 1, 0);
                  await AP.Audit.log(nuevo ? 'Alta de turno de planta' : 'Modificación de turno de planta', d.Codigo, txt);
                  close(); AP.toast('Turno guardado.'); cargar();
                } catch (e) { AP.toast(e.message, 'error'); }
              } }, AP.icon('check', 18), 'Guardar')));
        } });
      }
      cargar();
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
        datos = (await D.cambios(90)).sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
        var tiposC = Array.from(new Set(datos.map(function (c) { return c.Tipo; }).filter(Boolean))).sort();
        tiposC.forEach(function (t) { fTipo.appendChild(h('option', { value: t }, t)); });
        box.replaceChildren(
          h('div', { class: 'banner info' }, AP.icon('shield', 18), h('span', null, 'Últimos 90 días. Cada cambio a la programación, a los turnos, a los permisos de operarios y a las ausencias queda aquí con el usuario que lo hizo (verificado por el servidor) y la hora del servidor. Nadie puede modificarlo ni borrarlo.')),
          h('div', { class: 'filters' }, fTipo, fDia, q, AP.btnExcel(function () {
            var l = filtrados();
            if (!l.length) return AP.toast('No hay cambios con el filtro actual.', 'warn');
            AP.exportar('Registro_cambios_planta', COLS, l, 'xlsx', [['Periodo', 'Últimos 90 días'], ['Filtro', [fTipo.value, fDia.value ? 'días ya iniciados' : '', q.value].filter(Boolean).join(' · ') || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Colección AP_CambiosPlanta']]);
          })), out);
        pintar();
      } catch (e) { box.replaceChildren(errBox(e)); }
    }
  });
})();
