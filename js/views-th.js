/* Talento Humano: personal propio de Avo Pak y personas con jefe inmediato asignado (consulta, sin modificar sus datos), permisos y ausencias (vacaciones,
 * permisos de día completo, licencias), estado del personal en planta según portería, programación de turnos de los
 * Jefes de Producción (consulta), compendio de horas entre la entrada y la salida registradas en portería (diurnas,
 * nocturnas y en domingo o festivo) y estadísticas del personal. Talento Humano registra y anula permisos y ausencias; no
 * los borra. Durante una ausencia la portería no deja ingresar a la persona: el vigilante envía la solicitud al Director
 * de Seguridad Integral, que verifica y aprueba o rechaza. Gobierno Corporativo consulta. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h, J = function () { return AP.Jornada; };

  var CATS = ['Personal propio', 'Personal propio sin carné'];
  var RE_SALUD = /(diagn[oó]stic|enfermedad|c[aá]ncer|embaraz|psiqui|psicol|terapia|cirug|v\.?i\.?h|medicament|tratamiento|m[eé]dic[oa]|\beps\b|\bips\b|hospital|cl[ií]nica|urgencias|odontol|maternidad|paternidad|parto)/i;
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
  function completo() { return AP.Session.lectura(); }
  function puedeRegistrar() { return AP.Session.can('th'); }   // Talento Humano y Director
  function fh(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function kpi(v, t, kind) { return h('div', { class: 'kpi ' + (kind || '') }, h('strong', null, String(v)), h('span', null, t)); }
  function pct(a, b) { return b ? Math.round(a / b * 100) + ' %' : '—'; }
  function porNombre(a, b) { return U.fold(a.Title) < U.fold(b.Title) ? -1 : 1; }
  function cuenta(l, fn) {
    var m = {};
    l.forEach(function (x) { var k = fn(x); if (k == null || k === '') k = 'Sin dato'; m[k] = (m[k] || 0) + (x.__n || 1); });
    return Object.keys(m).map(function (k) { return { k: k, n: m[k] }; }).sort(function (a, b) { return b.n - a.n || (a.k < b.k ? -1 : 1); });
  }
  function jefeDe(p, personal) { if (!p.JefeId) return ''; var j = personal.find(function (x) { return x.id === p.JefeId; }); return j ? j.Title : (p.JefeNombre || ''); }

  // ---------- Datos según el perfil ----------
  // Ámbito de Talento Humano: personal propio y personas con jefe inmediato asignado (aunque no sean personal propio).
  // Las consultas usan solo igualdades (no necesitan índices compuestos en Firebase).
  function enAmbito(p) { return p.Tipo === 'Personal propio' || !!p.JefeId; }
  function conAviso(l, de) { if (de && de.avisoLegado) l.avisoLegado = true; return l; }
  var D = {
    personal: async function () {
      var l;
      if (completo()) l = (await AP.B.listAll('AP_Personas', { exclude: ['Foto', 'Observaciones'] })).filter(enAmbito);
      else {
        // Si las reglas de Firebase aún no están actualizadas, la consulta de personas con jefe inmediato se rechaza:
        // se muestra el personal propio y se avisa (en lugar de dejar toda la pantalla sin información)
        var sinAmbito = false;
        var r = await Promise.all([AP.B.consulta('AP_Personas', [['Tipo', '==', 'Personal propio']], { exclude: ['Observaciones'] }),
          AP.B.consulta('AP_Personas', [['AmbitoTH', '==', true]], { exclude: ['Observaciones'] }).catch(function (e) {
            if (e && (e.status === 403 || e.code === 'permission-denied')) { sinAmbito = true; return []; }
            throw e;
          })]);
        var vistos = {};
        l = r[0].concat(r[1]).filter(function (p) { if (vistos[p.id] || !enAmbito(p)) return false; vistos[p.id] = 1; return true; });
        if (sinAmbito) l.avisoReglas = true;
      }
      return l.sort(porNombre);
    },
    // Movimientos del ámbito por día (campo Dia). Los días ya cerrados se guardan en este equipo para no volver a
    // consultarlos (protege la cuota diaria gratuita de Firebase); hoy y ayer siempre se consultan de nuevo.
    movimientos: async function (desdeYmd, hastaYmd, progreso, personal) {
      if (hastaYmd > U.ymd()) hastaYmd = U.ymd();
      if (completo()) {
        var toks = new Set((personal || []).map(function (p) { return p.Token; }));
        var l = await AP.B.listRange('AP_Movimientos', 'FechaHora', U.fromLocal(desdeYmd, '00:00'), new Date(U.fromLocal(hastaYmd, '23:59').getTime() + 59999));
        return l.filter(function (m) { return CATS.indexOf(m.Categoria) >= 0 || m.AmbitoTH === true || toks.has(m.Token); });
      }
      return J().movsPorDia({ scope: 'th', filtros: [['AmbitoTH', '==', true]], desde: desdeYmd, hasta: hastaYmd, progreso: progreso,
        legado: function (x, y) { return [['Categoria', 'in', CATS], ['FechaHora', '>=', x], ['FechaHora', '<=', y]]; } });
    },
    semanas: async function (desdeYmd) { return AP.B.listRange('AP_ProgPlanta', 'Desde', U.fromLocal(J().addYmd(desdeYmd, -7), '00:00'), null); },
    horarios: async function () { return AP.B.listAll('AP_Horarios'); },
    ausencias: async function (dias) { return AP.B.listRange('AP_Ausencias', 'Hasta', U.addDays(new Date(), -(dias || 120)), null); },
    // Permisos del ámbito: mes por mes (desde dos meses antes hasta tres después)
    permisos: async function (desde, personal) {
      if (completo()) {
        var toks = new Set((personal || []).map(function (p) { return p.Token; }));
        return (await AP.B.listRange('AP_Permisos', 'Hasta', desde, null)).filter(function (p) { return p.PersonaTipo === 'Personal propio' || p.AmbitoTH === true || toks.has(p.Token); });
      }
      var d0 = U.ymd(U.addDays(U.toDate(desde), -62)), d1 = U.ymd(U.addDays(new Date(), 100)), lim = U.toDate(desde).toISOString();
      var lp = await J().porMeses('AP_Permisos', [['AmbitoTH', '==', true]], d0, d1, [['PersonaTipo', '==', 'Personal propio']]);
      return conAviso(lp.filter(function (p) { return p.Hasta >= lim; }), lp);
    }
  };
  AP.TH = { D: D };

  // Excel con varias hojas de datos, huella SHA-256 y anotación en la bitácora
  AP.exportarHojas = async function (nombre, hojas, info) {
    if (!window.writeXlsxFile) return AP.toast('La descarga en Excel no está disponible en este equipo.', 'warn');
    var stamp = U.ymd() + '_' + U.partsCO().hour + U.partsCO().minute;
    var file = U.safeName(nombre) + '_' + stamp + '.xlsx';
    var celda = function (v) {
      if (v instanceof Date) return { value: v, type: Date, format: 'dd/mm/yyyy hh:mm' };
      if (typeof v === 'number') return { value: v, type: Number };
      return { value: v == null ? '' : String(v), type: String };
    };
    var sheets = hojas.map(function (hj) {
      return { sheet: hj.sheet, stickyRowsCount: 1, columns: hj.cols.map(function (c) { return { width: c[2] || 16 }; }),
        data: [hj.cols.map(function (c) { return { value: c[0], fontWeight: 'bold', backgroundColor: '#E8ECDD', wrap: true }; })].concat(hj.rows.map(function (r) { return hj.cols.map(function (c) { return celda(c[1](r)); }); })) };
    });
    sheets.push({ sheet: 'Información', columns: [{ width: 30 }, { width: 100 }],
      data: [[{ value: 'Información de la exportación', fontWeight: 'bold' }]].concat((info || []).map(function (x) { return [{ value: x[0], fontWeight: 'bold' }, { value: String(x[1]), wrap: true }]; }),
        [[{ value: '' }], [{ value: AP.TX.pieExportacion || '', wrap: true }]]) });
    var blob = await window.writeXlsxFile(sheets).toBlob();
    var hash = await U.sha256(blob);
    U.download(blob, file);
    var total = hojas.reduce(function (a, x) { return a + x.rows.length; }, 0);
    await AP.Audit.log('Exportación', file, total + ' filas. ' + (info || []).map(function (x) { return x[0] + ': ' + x[1]; }).join(' | ').slice(0, 900), hash);
    AP.modal({ title: 'Archivo generado', body: h('div', { class: 'stack' }, h('p', null, 'Se descargó ', h('strong', null, file), '.'),
      h('p', { class: 'muted small' }, 'Huella SHA-256 (registrada en la bitácora; permite demostrar que el archivo no ha sido alterado):'), h('code', { class: 'hash' }, hash)),
      actions: [{ label: 'Cerrar', kind: 'primary' }] });
  };

  // =================== PANTALLA DE TALENTO HUMANO ===================
  AP.route('/consola/th', function (qs) {
    if (!puedeRegistrar() && !AP.Session.can('ver')) { AP.go('/'); return; }
    var ED = puedeRegistrar();
    var tab = qs.t || 'personal';
    var content = h('div', { class: 'stack' });
    var TABS = [['personal', 'Personal'], ['estado', 'Estado en planta'], ['permisos', 'Permisos'], ['ausencias', 'Vacaciones y ausencias'], ['programacion', 'Programación de turnos'],
      ['horas', 'Horas según portería'], ['estadisticas', 'Estadísticas']];
    var tabs = h('div', { class: 'tabs' }, TABS.map(function (t) {
      return h('a', { class: t[0] === tab ? 'on' : '', href: '#/consola/th?t=' + t[0] }, t[1]);
    }));
    var box = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    var acciones = h('div', { class: 'row gap wrap' });
    AP.consolaShell('/consola/th', 'Talento Humano — personal', content, ED ? acciones : AP.pill('Solo consulta', 'muted'));
    content.append(tabs, box);
    AP.onLeave(function () { if (AP.Viz) AP.Viz.limpiar(); });
    if (tab === 'ausencias') ausencias(); else if (tab === 'horas') horas(); else if (tab === 'estado') estado(); else if (tab === 'permisos') permisos();
    else if (tab === 'programacion') programacion(); else if (tab === 'estadisticas') estadisticas(); else personal();

    // Contexto para la ficha de consulta: programación de la semana, horarios, ausencias y permisos
    async function contextoFicha(per) {
      var hoy = U.ymd();
      var r = await Promise.all([D.semanas(hoy), D.horarios().catch(function () { return []; }), D.ausencias(10).catch(function () { return []; }), D.permisos(U.addDays(new Date(), -1).toISOString(), per).catch(function () { return []; })]);
      return { ctx: { semanas: J().indexarSemanas(r[0], per), horarios: r[1] }, ausencias: r[2], permisos: r[3] };
    }

    // ---------- Personal propio (solo consulta) ----------
    async function personal() {
      var per = [], fc = null;
      var fClase = AP.select('clase', [['', 'Toda clase de personal'], ['operativas', 'Operarios y personal operativo']].concat(AP.CAT.tiposPersonal, [['sin', 'Sin clase']]), '');
      var fArea = AP.select('area', [['', 'Todas las áreas']], ''), fCargo = AP.select('cargo', [['', 'Todos los cargos']], ''), fJefe = AP.select('jefe', [['', 'Cualquier jefe inmediato']], '');
      var fEst = AP.select('est', [['Habilitado', 'Habilitados'], ['Inhabilitado', 'Inhabilitados'], ['', 'Todos']], 'Habilitado');
      var q = AP.buscador('Buscar nombre, documento, uniforme, cargo, área o jefe', pintar);
      [fClase, fArea, fCargo, fJefe, fEst].forEach(function (s0) { s0.addEventListener('change', pintar); });
      var out = h('div');
      function filtrados() {
        return per.filter(function (p) {
          if (fEst.value && p.Estado !== fEst.value) return false;
          if (fClase.value === 'operativas') { if (AP.CAT.clasesOperativas.indexOf(p.TipoPersonal) < 0) return false; }
          else if (fClase.value === 'sin') { if (p.TipoPersonal) return false; }
          else if (fClase.value && p.TipoPersonal !== fClase.value) return false;
          if (fArea.value && p.Area !== fArea.value) return false;
          if (fCargo.value && p.Cargo !== fCargo.value) return false;
          if (fJefe.value === 'sin') { if (p.JefeId) return false; } else if (fJefe.value && p.JefeId !== fJefe.value) return false;
          return AP.coincide(p, q.value, ['Title', 'NumDoc', 'NumUniforme', 'Cargo', 'Area', 'TipoPersonal', 'Empresa', function (x) { return jefeDe(x, per); }]);
        });
      }
      async function ficha(p) {
        try { if (!fc) fc = await contextoFicha(per); } catch (e) { fc = { ctx: null, ausencias: [], permisos: [] }; }
        AP.Planta.ficha(p, { ctx: fc.ctx, ausencias: fc.ausencias, permisos: fc.permisos, jefeNombre: jefeDe(p, per), despues: pintar });
      }
      function pintar() {
        var l = filtrados();
        out.replaceChildren(h('div', { class: 'kpis' }, kpi(l.length, 'Personas en la vista'), kpi(l.filter(function (p) { return AP.CAT.clasesOperativas.indexOf(p.TipoPersonal) >= 0; }).length, 'Operarios y personal operativo'),
          kpi(l.filter(function (p) { return !p.JefeId; }).length, 'Sin jefe inmediato asignado')),
          tabla([
            ['Persona', function (p) { return h('div', null, h('strong', null, p.Title), h('small', { class: 'block muted' }, [[p.TipoDoc, p.NumDoc].filter(Boolean).join(' '), p.Tipo !== 'Personal propio' ? p.Tipo + (p.Empresa ? ' — ' + p.Empresa : '') : ''].filter(Boolean).join(' · '))); }],
            ['Uniforme', function (p) { return p.NumUniforme || '—'; }],
            ['Cargo / área', function (p) { return h('div', null, p.Cargo || '', h('small', { class: 'block muted' }, p.Area || '')); }],
            ['Clase', function (p) { return p.TipoPersonal || ''; }],
            ['Jefe inmediato', function (p) { return jefeDe(p, per); }],
            ['Estado', function (p) { return AP.estadoPill(p.Estado); }],
            ['', function (p) { return h('button', { class: 'btn small', type: 'button', onclick: function () { ficha(p); } }, AP.icon('eye', 16), 'Ficha'); }]
          ], l.slice().sort(porNombre), ficha));
      }
      try {
        per = await D.personal();
        var uniq = function (k) { return Array.from(new Set(per.map(function (p) { return p[k] || ''; }).filter(Boolean))).sort(); };
        uniq('Area').forEach(function (a) { fArea.appendChild(h('option', { value: a }, a)); });
        uniq('Cargo').forEach(function (a) { fCargo.appendChild(h('option', { value: a }, a)); });
        fJefe.appendChild(h('option', { value: 'sin' }, 'Sin jefe inmediato'));
        var jefes = {}; per.forEach(function (p) { if (p.JefeId) jefes[p.JefeId] = jefeDe(p, per); });
        Object.keys(jefes).sort(function (a, b) { return U.fold(jefes[a]) < U.fold(jefes[b]) ? -1 : 1; }).forEach(function (k) { fJefe.appendChild(h('option', { value: k }, jefes[k])); });
        box.replaceChildren(
          per.avisoReglas ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, 'Solo se muestra el personal propio: las reglas de seguridad de Firebase no están actualizadas y no permiten consultar a las personas de otras empresas con jefe inmediato. Avise al Director de Seguridad Integral para que las publique.')) : null,
          h('div', { class: 'banner info' }, AP.icon('users', 18), h('span', null, 'Personal propio de ' + AP.CFG.empresa + ' y personas de otras empresas que tienen jefe inmediato asignado. Solo consulta: los datos de las personas los registra y modifica únicamente el Director de Seguridad Integral, salvo el número de uniforme. ' +
            'La fotografía no se muestra aquí: se autorizó solo para el cotejo visual en portería (principio de finalidad, art. 4 Ley 1581 de 2012).')),
          h('div', { class: 'filters' }, fClase, fArea, fCargo, fJefe, fEst, q, ED ? h('button', { class: 'btn', type: 'button', onclick: function () { AP.Planta.uniformes(filtrados(), pintar); } }, AP.icon('edit', 18), 'Números de uniforme') : null, AP.btnExcel(function () {
            var l = filtrados();
            if (!l.length) return AP.toast('No hay personas con el filtro actual.', 'warn');
            AP.exportar('Personal_talento_humano', [['Persona', function (p) { return p.Title; }, 30], ['Tipo doc.', function (p) { return p.TipoDoc; }, 8], ['Documento', function (p) { return p.NumDoc; }, 15],
              ['Tipo', function (p) { return p.Tipo; }, 16], ['Empresa', function (p) { return p.Empresa; }, 24], ['Número de uniforme', function (p) { return p.NumUniforme; }, 11],
              ['Cargo', function (p) { return p.Cargo; }, 24], ['Área', function (p) { return p.Area; }, 18], ['Clase de personal', function (p) { return p.TipoPersonal; }, 16],
              ['Jefe inmediato', function (p) { return jefeDe(p, per); }, 28], ['Estado', function (p) { return p.Estado; }, 12]], l.slice().sort(porNombre), 'xlsx',
              [['Vista', 'Personal propio y personas con jefe inmediato (solo consulta)'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
          })), out);
        pintar();
      } catch (e) { box.replaceChildren(errBox(e)); }
    }

    // ---------- Estado del personal en planta (según portería) ----------
    async function estado() {
      try {
        var hoy = U.ymd(), ayer = J().addYmd(hoy, -1);
        var per = await D.personal();
        // Si una consulta secundaria falla, el personal se muestra igual, con el aviso correspondiente
        var avisos = [];
        var falla = function (txt) { return function (e) { avisos.push(txt + ' no se pudo consultar' + (e && e.offline ? ' (sin conexión)' : e && e.message ? ': ' + e.message : '') + '.'); return []; }; };
        var r0 = await Promise.all([D.semanas(hoy).catch(falla('La programación semanal')), D.horarios().catch(falla('Los horarios')), D.ausencias(10).catch(falla('Las ausencias')),
          D.movimientos(ayer, hoy, null, per).catch(falla('Los ingresos y salidas de portería'))]);
        if (r0[3].avisoLegado) avisos.push(AP.Planta.AVISO_LEGADO);
        var r = [per, r0[0], r0[1], r0[2], r0[3]];
        var ctx = { semanas: J().indexarSemanas(r[1], r[0]), horarios: r[2] };
        var fc = null;
        AP.Planta.tablero(box, r[0], ctx, r[4], r[3], { clases: true, claseDef: 'operativas', aviso: avisos.join(' '),
          uniformes: ED ? function () { AP.Planta.uniformes(per, estado); } : null,
          onRow: async function (f) {
            try { if (!fc) fc = await contextoFicha(r[0]); } catch (e) { fc = { ausencias: r[3], permisos: [] }; }
            AP.Planta.ficha(f.p, { estado: f.e, ctx: ctx, ausencias: r[3], permisos: fc.permisos, jefeNombre: jefeDe(f.p, r[0]), despues: estado });
          } });
      } catch (e) { box.replaceChildren(errBox(e)); }
    }

    // ---------- Permisos del personal propio y con jefe inmediato ----------
    async function permisos() {
      if (ED) acciones.replaceChildren(h('button', { class: 'btn primary', type: 'button', onclick: registrar }, AP.icon('plus', 18), 'Registrar permiso'));
      var datos = [], per = [];
      var fEst = AP.select('est', [['', 'Todos los estados'], ['Vigente', 'Vigentes'], ['Programado', 'Programados'], ['Vencido', 'Vencidos'], ['Anulado', 'Anulados']], '');
      var fTipo = AP.select('tipo', [['', 'Todos los tipos']].concat(AP.CAT.tiposPermiso), '');
      var q = AP.buscador('Buscar persona, documento, tipo, quien autoriza o detalle', pintar);
      [fEst, fTipo].forEach(function (s0) { s0.addEventListener('change', pintar); });
      var out = h('div');
      var ahora = Date.now();
      var estadoDe = function (p) { return p.Estado === 'Anulado' ? 'Anulado' : new Date(p.Hasta).getTime() < ahora ? 'Vencido' : new Date(p.Desde).getTime() > ahora ? 'Programado' : 'Vigente'; };
      var KIND = { Anulado: 'deny', Vencido: 'muted', Programado: 'warn', Vigente: 'ok' };
      function filtrados() { return datos.filter(function (p) { return (!fEst.value || estadoDe(p) === fEst.value) && (!fTipo.value || p.Tipo === fTipo.value) && AP.coincide(p, q.value, ['Title', 'NumDoc', 'Tipo', 'Detalle', 'AutorizadoPor', 'Area']); }); }
      function pintar() {
        out.replaceChildren(tabla([
          ['Persona', function (p) { return h('div', null, h('strong', null, p.Title), h('small', { class: 'block muted' }, [p.NumDoc, p.TipoPersonal, p.Area].filter(Boolean).join(' · '))); }],
          ['Tipo', function (p) { return p.Tipo; }],
          ['Vigencia', function (p) { return AP.CAT.permisosSinFin.indexOf(p.Tipo) >= 0 ? 'Desde ' + U.fDateTime(p.Desde) + ' (sin hora final)' : U.fDateTime(p.Desde) + ' → ' + U.fDateTime(p.Hasta); }],
          ['Autoriza', function (p) { return p.AutorizadoPor; }],
          ['Registró', function (p) { return h('small', { class: 'muted' }, p._createdBy || ''); }],
          ['Estado', function (p) { var e = estadoDe(p); return h('div', null, AP.pill(e, KIND[e]), p.MotivoAnulacion ? h('small', { class: 'block muted' }, p.MotivoAnulacion) : null); }],
          ['', function (p) { return ED && p.Estado !== 'Anulado' && new Date(p.Hasta).getTime() >= Date.now() ? h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { anular(p); } }, 'Anular') : null; }]
        ], filtrados()));
      }
      async function cargar() {
        out.replaceChildren(AP.spinner('Consultando…'));
        try {
          if (!per.length) per = await D.personal();
          var crudoP = await D.permisos(U.addDays(new Date(), -30).toISOString(), per);
          datos = crudoP.slice().sort(function (a, b) { return a.Desde < b.Desde ? 1 : -1; });
          ahora = Date.now(); pintar();
          if (crudoP.avisoLegado) out.prepend(h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, AP.Planta.AVISO_LEGADO)));
        } catch (e) { out.replaceChildren(errBox(e)); }
      }
      async function registrar() {
        try { if (!per.length) per = await D.personal(); } catch (e) { return AP.toast(e.message, 'error'); }
        var hab = per.filter(function (p) { return p.Estado === 'Habilitado'; });
        var r = await AP.crearPermiso({ th: AP.Session.rol === 'Talento Humano', personas: hab, todas: AP.Session.can('editar') ? undefined : hab });
        if (r) cargar();
      }
      function anular(p) {
        AP.modal({ title: 'Anular permiso', body: function (close) {
          var m = AP.input('m', '', { placeholder: 'Motivo de la anulación' });
          return h('div', { class: 'stack' }, h('p', null, p.Title + ' — ' + p.Tipo), AP.field('Motivo *', m),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
              h('button', { class: 'btn danger', type: 'button', onclick: async function () {
                if (m.value.trim().length < 4) return AP.toast('Indique el motivo.', 'warn');
                if (RE_SALUD.test(m.value)) return AP.toast('El motivo parece contener información de salud. Escriba solo el hecho general.', 'warn', 8000);
                try {
                  await AP.B.update('AP_Permisos', p.id, { Estado: 'Anulado', AnuladoPor: AP.Session.user.upn, MotivoAnulacion: m.value.trim(), FechaAnulacion: new Date().toISOString() });
                  await AP.Planta.registrarCambio('Anulación de permiso', p.Title + ' — ' + p.Tipo, U.fDateTime(p.Desde) + '. Motivo: ' + m.value.trim(), 1, 0, '', m.value.trim(), p.JefeId || '');
                  await AP.Audit.log('Anulación de permiso', p.Title + ' — ' + p.Tipo, m.value.trim());
                  close(); AP.toast('Permiso anulado.'); cargar();
                } catch (e) { AP.toast(e.message, 'error'); }
              } }, 'Anular permiso')));
        } });
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('key', 18), h('span', null, 'Permisos por horas del personal propio y de las personas con jefe inmediato asignado (incluso de otras empresas): ingreso tardío, salida anticipada (sin hora final), salida temporal o ingreso y salida fuera de horario. La portería los aplica al leer el QR. ' +
          'Las vacaciones y los permisos de día completo se registran en «Vacaciones y ausencias». Un permiso no se borra: se anula con motivo.')),
        h('div', { class: 'filters' }, fEst, fTipo, q, AP.btnExcel(function () {
          var l = filtrados();
          if (!l.length) return AP.toast('No hay permisos con el filtro actual.', 'warn');
          AP.exportar('Permisos_talento_humano', [['Persona', function (p) { return p.Title; }, 30], ['Documento', function (p) { return p.NumDoc; }, 15], ['Clase', function (p) { return p.TipoPersonal; }, 14], ['Área', function (p) { return p.Area; }, 16],
            ['Tipo', function (p) { return p.Tipo; }, 28], ['Desde', function (p) { return U.toDate(p.Desde); }, 17], ['Hasta', function (p) { return AP.CAT.permisosSinFin.indexOf(p.Tipo) >= 0 ? 'Sin hora final' : U.toDate(p.Hasta); }, 17],
            ['Estado', estadoDe, 12], ['Autorizado por', function (p) { return p.AutorizadoPor; }, 28], ['Detalle', function (p) { return p.Detalle; }, 36], ['Registrado por', function (p) { return p._createdBy; }, 16],
            ['Motivo de anulación', function (p) { return p.MotivoAnulacion; }, 30]], l, 'xlsx', [['Vista', 'Permisos del personal propio y con jefe inmediato (últimos 30 días y vigentes)'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
        })), out);
      cargar();
    }

    // ---------- Programación de turnos de los Jefes de Producción (solo consulta) ----------
    async function programacion() {
      var modo = qs.m === 'semana' ? 'semana' : 'persona';
      var seg = AP.segmented('modo', [{ value: 'persona', label: 'Todo lo programado, por persona', icon: 'users' }, { value: 'semana', label: 'Semana por jefe inmediato', icon: 'calendar' }], modo,
        function (v) { AP.go('/consola/th?t=programacion&m=' + v); });
      try {
        var per = await D.personal();
        var jefes = {};
        per.forEach(function (p) { if (p.JefeId) { jefes[p.JefeId] = jefes[p.JefeId] || { n: 0, nombre: jefeDe(p, per) }; jefes[p.JefeId].n++; } });
        var ids = Object.keys(jefes).sort(function (a, b) { return U.fold(jefes[a].nombre) < U.fold(jefes[b].nombre) ? -1 : 1; });
        if (modo === 'persona') return porPersona(per, jefes, ids, seg);
        var g = qs.j === 'sin' ? '' : (qs.j && jefes[qs.j] ? qs.j : (ids[0] || ''));
        var sel = AP.select('grupo', ids.map(function (k) { return [k, jefes[k].nombre + ' (' + jefes[k].n + ')']; }).concat([['sin', 'Personal propio sin jefe inmediato']]), g || 'sin');
        sel.addEventListener('change', function () { AP.go('/consola/th?t=programacion&m=semana&j=' + encodeURIComponent(sel.value)); });
        var grid = h('div', { class: 'stack' });
        box.replaceChildren(seg, h('div', { class: 'filters' }, AP.field('Personal a cargo de (jefe inmediato)', sel), h('small', { class: 'muted' }, 'Solo consulta. La programación la hace cada Jefe de Producción con su personal.')), grid);
        AP.Planta.semana({ box: grid, acciones: null, g: g, gNombre: g ? jefes[g].nombre : '', ED: false, s: qs.s,
          ir: function (ymd) { AP.go('/consola/th?t=programacion&m=semana&j=' + encodeURIComponent(g || 'sin') + '&s=' + ymd); },
          personal: function () { return Promise.resolve(per.filter(function (p) { return g ? p.JefeId === g : !p.JefeId; })); } });
      } catch (e) { box.replaceChildren(errBox(e)); }
    }

    // Todo lo programado a cada persona en un rango de fechas: turnos de la programación semanal de su jefe inmediato,
    // descansos y horarios fijos, con las ausencias registradas (solo consulta)
    function porPersona(per, jefes, ids, seg) {
      var hoy = U.ymd(), lun = J().lunes(hoy);
      var DIAS_L = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      var fJefe = AP.select('jefe', [['', 'Todos los jefes inmediatos']].concat(ids.map(function (k) { return [k, jefes[k].nombre]; }), [['sin', 'Sin jefe inmediato']]), '');
      var desde = AP.input('desde', lun, { type: 'date' }), hasta = AP.input('hasta', J().addYmd(lun, 13), { type: 'date' });
      var q = AP.buscador('Buscar persona, documento, cargo o jefe', pintar);
      fJefe.addEventListener('change', pintar);
      var out = h('div', { class: 'stack' });
      var filas = null, rango = null;
      function fDia(y) { return U.fDate(U.fromLocal(y, '12:00')); }
      function turnoTxt(t) { return !t ? 'Sin turno ni horario' : t.cod === 'D' ? 'Descanso' : t.fuente === 'planta' ? (t.cod ? t.cod + ' · ' + (t.nombre || t.cod) : 'Sin turno en la semana programada') : (t.nombre || 'Horario fijo') + (t.libre ? ' (acceso libre)' : ''); }
      function horaTxt(t) { return t && t.e ? t.e + '–' + t.s + (J().toMin(t.s) <= J().toMin(t.e) ? ' (+1 día)' : '') : ''; }
      function fuenteTxt(t) { return !t ? '' : t.fuente === 'planta' ? 'Programación semanal del jefe inmediato' : 'Horario fijo'; }
      async function calcular() {
        if (!desde.value || !hasta.value || hasta.value < desde.value) return AP.toast('Revise el rango de fechas.', 'warn');
        if ((U.fromLocal(hasta.value, '12:00') - U.fromLocal(desde.value, '12:00')) / 864e5 > 62) return AP.toast('Consulte máximo 62 días por vez.', 'warn');
        out.replaceChildren(AP.spinner('Consultando la programación…'));
        try {
          var diasAus = Math.max(1, Math.ceil((Date.now() - U.fromLocal(desde.value, '00:00').getTime()) / 864e5) + 1);
          var r = await Promise.all([D.semanas(desde.value), D.horarios().catch(function () { return []; }), D.ausencias(diasAus).catch(function () { return []; })]);
          var ctx = { semanas: J().indexarSemanas(r[0], per), horarios: r[1] }, aus = r[2];
          var dias = [], y = desde.value;
          while (y <= hasta.value) { dias.push(y); y = J().addYmd(y, 1); }
          filas = per.map(function (p) {
            var det = dias.map(function (d) {
              var a = aus.find(function (x) { return x.Token === p.Token && x.Estado !== 'Anulada' && U.ymd(x.Desde) <= d && U.ymd(x.Hasta) >= d; });
              return { y: d, t: J().turnoDe(ctx, p.Token, d), a: a };
            });
            var conTurno = det.filter(function (d) { return d.t && d.t.e; });
            return { p: p, det: det, turnos: conTurno.length, desc: det.filter(function (d) { return d.t && d.t.cod === 'D'; }).length,
              horas: conTurno.reduce(function (s0, d) { return s0 + J().horasTurno(d.t); }, 0), sinProg: det.filter(function (d) { return !d.t; }).length,
              aus: det.filter(function (d) { return d.a; }).length, planta: det.some(function (d) { return d.t && d.t.fuente === 'planta'; }), fijo: det.some(function (d) { return d.t && d.t.fuente === 'horario'; }) };
          }).filter(function (f) { return f.p.Estado === 'Habilitado' || f.planta; });
          rango = [desde.value, hasta.value];
          pintar();
        } catch (e) { out.replaceChildren(errBox(e)); }
      }
      function filtradas() {
        return (filas || []).filter(function (f) {
          if (fJefe.value === 'sin') { if (f.p.JefeId) return false; } else if (fJefe.value && f.p.JefeId !== fJefe.value) return false;
          return AP.coincide(f.p, q.value, ['Title', 'NumDoc', 'NumUniforme', 'Cargo', 'Area', function (x) { return jefeDe(x, per); }]);
        }).sort(function (a, b) { return porNombre(a.p, b.p); });
      }
      function detalle(f) {
        AP.modal({ title: f.p.Title + ' — ' + fDia(rango[0]) + ' a ' + fDia(rango[1]), size: 'wide', body: h('div', { class: 'stack' },
          h('p', { class: 'muted small' }, [f.p.NumDoc, f.p.Cargo, f.p.Area, f.p.JefeId ? 'Jefe inmediato: ' + jefeDe(f.p, per) : 'Sin jefe inmediato'].filter(Boolean).join(' · ')),
          tabla([['Día', function (d) { return DIAS_L[J().dow(d.y)] + ' ' + fDia(d.y) + (J().festivo(d.y) ? ' (festivo)' : ''); }], ['Turno u horario', function (d) { return turnoTxt(d.t); }],
            ['Hora', function (d) { return horaTxt(d.t); }], ['Fuente', function (d) { return fuenteTxt(d.t); }], ['Ausencia registrada', function (d) { return d.a ? d.a.Tipo : ''; }]], f.det)) });
      }
      function pintar() {
        if (!filas) return;
        var l = filtradas();
        var S = function (k) { return l.reduce(function (a, f) { return a + f[k]; }, 0); };
        out.replaceChildren(
          h('div', { class: 'kpis' }, kpi(l.length, 'Personas en la vista'), kpi(S('turnos'), 'Días con turno u horario', 'brand'), kpi(fh(S('horas')), 'Horas programadas'),
            kpi(S('desc'), 'Descansos programados'), kpi(l.filter(function (f) { return !f.turnos && !f.desc; }).length, 'Personas sin programación en el periodo', 'warn')),
          tabla([
            ['Persona', function (f) { return h('div', null, h('strong', null, f.p.Title), h('small', { class: 'block muted' }, [f.p.NumDoc, f.p.Cargo, f.p.Estado !== 'Habilitado' ? 'INHABILITADO' : ''].filter(Boolean).join(' · '))); }],
            ['Jefe inmediato', function (f) { return jefeDe(f.p, per) || '—'; }],
            ['Días con turno', function (f) { return String(f.turnos); }, 'num'],
            ['Descansos', function (f) { return String(f.desc); }, 'num'],
            ['Horas programadas', function (f) { return fh(f.horas); }, 'num'],
            ['Días sin programación', function (f) { return String(f.sinProg); }, 'num'],
            ['Fuente', function (f) { return [f.planta ? 'Programación semanal' : '', f.fijo ? 'Horario fijo' : ''].filter(Boolean).join(' y ') || '—'; }],
            ['', function (f) { return h('button', { class: 'btn small', type: 'button', onclick: function () { detalle(f); } }, AP.icon('eye', 16), 'Día por día'); }]
          ], l, detalle),
          h('p', { class: 'muted small' }, 'Fuente: programación semanal guardada por cada Jefe de Producción, horarios fijos y ausencias registradas. En las semanas en que la persona figura en la programación semanal, esa programación reemplaza su horario fijo.'));
      }
      function exportar() {
        if (!filas) return AP.toast('Primero consulte la programación.', 'warn');
        var l = filtradas();
        if (!l.length) return AP.toast('No hay personas con el filtro actual.', 'warn');
        var det = [];
        l.forEach(function (f) { f.det.forEach(function (d) { det.push({ f: f, d: d }); }); });
        AP.exportarHojas('Programacion_por_persona_' + rango[0] + '_a_' + rango[1], [
          { sheet: 'Resumen por persona', rows: l, cols: [['Persona', function (f) { return f.p.Title; }, 30], ['Documento', function (f) { return f.p.NumDoc; }, 15], ['Número de uniforme', function (f) { return f.p.NumUniforme; }, 11],
            ['Cargo', function (f) { return f.p.Cargo; }, 22], ['Área', function (f) { return f.p.Area; }, 16], ['Jefe inmediato', function (f) { return jefeDe(f.p, per); }, 28], ['Días con turno', function (f) { return f.turnos; }, 10],
            ['Descansos', function (f) { return f.desc; }, 10], ['Horas programadas', function (f) { return Math.round(f.horas * 100) / 100; }, 11], ['Días sin programación', function (f) { return f.sinProg; }, 11], ['Días con ausencia', function (f) { return f.aus; }, 10]] },
          { sheet: 'Detalle por día', rows: det, cols: [['Persona', function (x) { return x.f.p.Title; }, 30], ['Documento', function (x) { return x.f.p.NumDoc; }, 15], ['Jefe inmediato', function (x) { return jefeDe(x.f.p, per); }, 28],
            ['Fecha', function (x) { return x.d.y; }, 11], ['Día', function (x) { return DIAS_L[J().dow(x.d.y)]; }, 10], ['Festivo', function (x) { return J().festivo(x.d.y) || ''; }, 16],
            ['Turno u horario', function (x) { return turnoTxt(x.d.t); }, 30], ['Entrada', function (x) { return x.d.t && x.d.t.e ? x.d.t.e : ''; }, 8], ['Salida', function (x) { return x.d.t && x.d.t.s ? x.d.t.s : ''; }, 8],
            ['Fuente', function (x) { return fuenteTxt(x.d.t); }, 30], ['Ausencia registrada', function (x) { return x.d.a ? x.d.a.Tipo : ''; }, 26]] }
        ], [['Periodo', rango[0] + ' a ' + rango[1]], ['Jefe inmediato', AP.textoOpcion(fJefe)], ['Filtro', q.value || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())],
          ['Fuente', 'Programación semanal de planta (AP_ProgPlanta), horarios (AP_Horarios) y ausencias (AP_Ausencias)']]);
      }
      box.replaceChildren(seg,
        h('div', { class: 'banner info' }, AP.icon('calendar', 18), h('span', null, 'Todo lo que cada Jefe de Producción programó a cada persona en el periodo (turnos, descansos y horarios fijos), con las ausencias registradas. Solo consulta.')),
        h('div', { class: 'filters' }, AP.field('Desde', desde), AP.field('Hasta', hasta), h('button', { class: 'btn primary', type: 'button', onclick: calcular }, AP.icon('search', 18), 'Consultar'), fJefe, q, AP.btnExcel(exportar)),
        out);
      calcular();
    }

    // ---------- Ausencias ----------
    async function ausencias() {
      if (ED) acciones.replaceChildren(h('button', { class: 'btn primary', type: 'button', onclick: registrar }, AP.icon('plus', 18), 'Registrar ausencia'));
      var datos = [], personal = null;
      var fEst = AP.select('est', [['vigentes', 'Vigentes y próximas'], ['todas', 'Últimos 120 días'], ['anuladas', 'Anuladas']], 'vigentes');
      var fTipo = AP.select('tipo', [['', 'Todos los tipos']].concat(AP.CAT.tiposAusencia), '');
      var q = AP.buscador('Buscar persona, documento, área o detalle', pintar);
      var out = h('div');
      [fEst, fTipo].forEach(function (s) { s.addEventListener('change', pintar); });
      function estadoDe(a) { var ahora = Date.now(); return a.Estado === 'Anulada' ? 'Anulada' : new Date(a.Hasta).getTime() < ahora ? 'Terminada' : new Date(a.Desde).getTime() > ahora ? 'Próxima' : 'Vigente'; }
      var KIND = { Anulada: 'deny', Terminada: 'muted', 'Próxima': 'warn', Vigente: 'ok' };
      function filtradas() {
        return datos.filter(function (a) {
          var e = estadoDe(a);
          if (fEst.value === 'vigentes' && !(e === 'Vigente' || e === 'Próxima')) return false;
          if (fEst.value === 'anuladas' && e !== 'Anulada') return false;
          if (fTipo.value && a.Tipo !== fTipo.value) return false;
          return AP.coincide(a, q.value, ['Title', 'NumDoc', 'Area', 'Cargo', 'Tipo', 'Detalle', 'TipoPersonal']);
        });
      }
      function dias(a) { return Math.round((U.fromLocal(U.ymd(a.Hasta), '12:00') - U.fromLocal(U.ymd(a.Desde), '12:00')) / 864e5) + 1; }
      function pintar() {
        out.replaceChildren(tabla([
          ['Persona', function (a) { return h('div', null, h('strong', null, a.Title), h('small', { class: 'block muted' }, [a.NumDoc, a.TipoPersonal, a.Area].filter(Boolean).join(' · '))); }],
          ['Tipo', function (a) { return a.Tipo; }],
          ['Fechas', function (a) { return U.fDate(a.Desde) + (U.ymd(a.Desde) !== U.ymd(a.Hasta) ? ' a ' + U.fDate(a.Hasta) : '') + ' (' + dias(a) + ' día' + (dias(a) > 1 ? 's' : '') + ')'; }],
          ['Detalle', function (a) { return a.Detalle || ''; }],
          ['Registró', function (a) { return h('small', { class: 'muted' }, (a.RegistradoPorNombre || a._createdBy || '') + (a._created ? ' · ' + U.fDateTime(a._created) : '')); }],
          ['Estado', function (a) { var e = estadoDe(a); return h('div', null, AP.pill(e, KIND[e]), a.MotivoAnulacion ? h('small', { class: 'block muted' }, a.MotivoAnulacion) : null); }],
          ['', function (a) { return ED && a.Estado !== 'Anulada' && new Date(a.Hasta).getTime() >= Date.now() ? h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { anular(a); } }, 'Anular') : null; }]
        ], filtradas().sort(function (x, y) { return x.Desde < y.Desde ? 1 : -1; })));
      }
      async function cargar() {
        out.replaceChildren(AP.spinner('Consultando…'));
        try { datos = await D.ausencias(120); pintar(); } catch (e) { out.replaceChildren(errBox(e)); }
      }
      async function registrar() {
        try { if (!personal) personal = (await D.personal()).filter(function (p) { return p.Estado === 'Habilitado'; }); }
        catch (e) { return AP.toast(e.message, 'error'); }
        AP.modal({ title: 'Registrar ausencia', size: 'wide', body: function (close) {
          var sel = null;
          var buscar = h('input', { type: 'search', placeholder: 'Nombre, documento, cargo o área', autocomplete: 'off' });
          var res = h('div', { class: 'list anf-res' }), vista = h('div', { class: 'stack sm' });
          function pintarSel() {
            if (sel) vista.replaceChildren(h('div', { class: 'sel-persona' }, AP.icon('user', 22), h('div', null, h('strong', null, sel.Title), h('small', { class: 'block muted' }, [sel.NumDoc, sel.TipoPersonal, sel.Cargo, sel.Area].filter(Boolean).join(' · '))),
              h('button', { class: 'btn small', type: 'button', onclick: function () { sel = null; buscar.value = ''; res.replaceChildren(); pintarSel(); } }, 'Cambiar')));
            else vista.replaceChildren(buscar, res);
          }
          buscar.addEventListener('input', U.debounce(function () {
            var t = U.fold(buscar.value), d = U.normDoc(buscar.value);
            if (t.length < 2) { res.replaceChildren(); return; }
            var l = personal.filter(function (p) { return U.fold([p.Title, p.Cargo, p.Area].join(' ')).indexOf(t) >= 0 || (d.length >= 3 && U.normDoc(p.NumDoc).indexOf(d) >= 0); }).slice(0, 8);
            res.replaceChildren.apply(res, l.length ? l.map(function (p) {
              return h('button', { class: 'list-item', type: 'button', onclick: function () { sel = p; pintarSel(); } }, AP.icon('user', 20),
                h('div', null, h('strong', null, p.Title), h('small', null, [p.NumDoc, p.TipoPersonal, p.Cargo, p.Area].filter(Boolean).join(' · '))));
            }) : [h('p', { class: 'muted small' }, 'No aparece en el personal habilitado (personal propio o con jefe inmediato).')]);
          }, 200));
          pintarSel();
          var tipo = AP.select('Tipo', AP.CAT.tiposAusencia, 'Vacaciones');
          var desde = AP.input('Desde', U.ymd(), { type: 'date' }), hasta = AP.input('Hasta', U.ymd(), { type: 'date' });
          var det = AP.textarea('Detalle', '', { rows: 2, placeholder: 'Opcional: número de solicitud o referencia interna. Sin diagnósticos ni datos de salud.' });
          var btn = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            if (!sel) return AP.toast('Elija a la persona.', 'warn');
            if (!desde.value || !hasta.value || hasta.value < desde.value) return AP.toast('Revise las fechas: «hasta» no puede ser anterior a «desde».', 'warn');
            if (RE_SALUD.test(det.value)) return AP.toast('El detalle parece contener información de salud (dato sensible, art. 5 Ley 1581 de 2012). Use «Ausencia justificada (reservada)» sin describir la causa.', 'warn', 9000);
            var cruce = datos.find(function (a) { return a.Token === sel.Token && a.Estado !== 'Anulada' && U.ymd(a.Desde) <= hasta.value && U.ymd(a.Hasta) >= desde.value; });
            if (cruce && !(await AP.confirm('Ausencia que se cruza', sel.Title + ' ya tiene registrada «' + cruce.Tipo + '» del ' + U.fDate(cruce.Desde) + ' al ' + U.fDate(cruce.Hasta) + '. ¿Registrar de todas formas?', 'Registrar'))) return;
            btn.disabled = true;
            try {
              var rec = {
                Title: sel.Title, PersonaId: sel.id, Token: sel.Token, NumDoc: sel.NumDoc, TipoPersonal: sel.TipoPersonal || '', Area: sel.Area || '', Cargo: sel.Cargo || '', JefeId: sel.JefeId || '',
                Tipo: tipo.value, Desde: U.fromLocal(desde.value, '00:00').toISOString(), Hasta: new Date(U.fromLocal(hasta.value, '23:59').getTime() + 59000).toISOString(),
                Estado: 'Vigente', Detalle: det.value.trim(), RegistradoPorNombre: AP.Session.user.nombre
              };
              await AP.B.create('AP_Ausencias', rec);
              var txt = tipo.value + ' del ' + U.fDate(rec.Desde) + ' al ' + U.fDate(rec.Hasta);
              await AP.Planta.registrarCambio('Ausencia', sel.Title + ' (' + (sel.NumDoc || '') + ')', txt + (rec.Detalle ? '. ' + rec.Detalle : ''), 1, desde.value <= U.ymd() ? 1 : 0, '', '', sel.JefeId || '');
              await AP.Audit.log('Registro de ausencia', sel.Title + ' (' + (sel.NumDoc || '') + ')', txt);
              close(); AP.toast('Ausencia registrada. La portería la recibe en su próxima actualización.', 'info', 6000); cargar();
            } catch (e) { AP.toast(e.message, 'error', 8000); btn.disabled = false; }
          } }, AP.icon('check', 18), 'Registrar ausencia');
          return h('div', { class: 'stack' },
            AP.field('Persona *', vista),
            h('div', { class: 'form-grid' }, AP.field('Tipo *', tipo, null, 'span2'), AP.field('Desde *', desde), AP.field('Hasta (inclusive) *', hasta), AP.field('Detalle', det, null, 'span2')),
            h('p', { class: 'note small' }, 'En esas fechas la portería no deja ingresar a la persona sin aprobación del Director de Seguridad Integral (al vigilante solo se le muestra «ausencia registrada», sin el tipo). ' +
              'Incapacidades, licencias de maternidad o paternidad y demás asuntos de salud: registre «Ausencia justificada (reservada)», sin diagnóstico; el soporte se conserva en Talento Humano (dato sensible, art. 5 Ley 1581 de 2012).'),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), btn));
        } });
      }
      function anular(a) {
        AP.modal({ title: 'Anular ausencia', body: function (close) {
          var m = AP.input('m', '', { placeholder: 'Motivo (p. ej., la persona aplazó sus vacaciones)' });
          return h('div', { class: 'stack' }, h('p', null, a.Title + ' — ' + a.Tipo + ' (' + U.fDate(a.Desde) + ' a ' + U.fDate(a.Hasta) + ')'), AP.field('Motivo *', m),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
              h('button', { class: 'btn danger', type: 'button', onclick: async function () {
                if (m.value.trim().length < 4) return AP.toast('Indique el motivo.', 'warn');
                if (RE_SALUD.test(m.value)) return AP.toast('El motivo parece contener información de salud. Escriba solo el hecho general.', 'warn', 8000);
                try {
                  await AP.B.update('AP_Ausencias', a.id, { Estado: 'Anulada', AnuladoPor: AP.Session.user.upn, MotivoAnulacion: m.value.trim(), FechaAnulacion: new Date().toISOString() });
                  await AP.Planta.registrarCambio('Anulación de ausencia', a.Title + ' (' + (a.NumDoc || '') + ')', a.Tipo + ' del ' + U.fDate(a.Desde) + ' al ' + U.fDate(a.Hasta) + '. Motivo: ' + m.value.trim(), 1, U.ymd(a.Desde) <= U.ymd() ? 1 : 0, '', m.value.trim(), a.JefeId || '');
                  await AP.Audit.log('Anulación de ausencia', a.Title + ' — ' + a.Tipo, m.value.trim());
                  close(); AP.toast('Ausencia anulada.'); cargar();
                } catch (e) { AP.toast(e.message, 'error'); }
              } }, 'Anular ausencia')));
        } });
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('calendar', 18), h('span', null, 'Vacaciones, permisos de día completo, licencias y demás ausencias del personal propio y de las personas con jefe inmediato asignado. En esas fechas no se permite el ingreso: si la persona llega, el vigilante envía la solicitud al Director de Seguridad Integral, que verifica y aprueba o rechaza. ' +
          'Una ausencia no se borra: se anula con motivo y queda en el registro de cambios.')),
        h('div', { class: 'filters' }, fEst, fTipo, q, AP.btnExcel(function () {
          var l = filtradas();
          if (!l.length) return AP.toast('No hay ausencias con el filtro actual.', 'warn');
          AP.exportar('Ausencias', [['Persona', function (a) { return a.Title; }, 30], ['Documento', function (a) { return a.NumDoc; }, 15], ['Clase de personal', function (a) { return a.TipoPersonal; }, 14],
            ['Cargo', function (a) { return a.Cargo; }, 20], ['Área', function (a) { return a.Area; }, 16], ['Tipo', function (a) { return a.Tipo; }, 30], ['Desde', function (a) { return U.fDate(a.Desde); }, 12],
            ['Hasta', function (a) { return U.fDate(a.Hasta); }, 12], ['Días', dias, 7], ['Estado', estadoDe, 11], ['Detalle', function (a) { return a.Detalle; }, 30],
            ['Registró', function (a) { return a.RegistradoPorNombre || a._createdBy; }, 24], ['Motivo de anulación', function (a) { return a.MotivoAnulacion; }, 28]], l, 'xlsx',
            [['Vista', AP.textoOpcion(fEst)], ['Filtro', [fTipo.value, q.value].filter(Boolean).join(' · ') || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
        })), out);
      cargar();
    }

    // ---------- Estadísticas del personal ----------
    function estadisticas() {
      var hoy = U.ymd(), p0 = U.partsCO(U.fromLocal(hoy, '12:00')), anio = Number(p0.year), mes = Number(p0.month);
      var pad = function (n) { return String(n).padStart(2, '0'); };
      var finMes = function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
      var mesAnt = mes === 1 ? [anio - 1, 12] : [anio, mes - 1];
      var PRE = { mes: ['Este mes', anio + '-' + pad(mes) + '-01', hoy], mesAnt: ['Mes anterior', mesAnt[0] + '-' + pad(mesAnt[1]) + '-01', mesAnt[0] + '-' + pad(mesAnt[1]) + '-' + finMes(mesAnt[0], mesAnt[1])],
        d30: ['Últimos 30 días', J().addYmd(hoy, -29), hoy] };
      var per0 = AP.select('per', Object.keys(PRE).map(function (k) { return [k, PRE[k][0]]; }).concat([['otro', 'Otro rango']]), 'mes');
      var desde = AP.input('desde', PRE.mes[1], { type: 'date' }), hasta = AP.input('hasta', PRE.mes[2], { type: 'date' });
      per0.addEventListener('change', function () { if (PRE[per0.value]) { desde.value = PRE[per0.value][1]; hasta.value = PRE[per0.value][2]; } });
      [desde, hasta].forEach(function (i) { i.addEventListener('change', function () { per0.value = 'otro'; }); });
      var fClase = AP.select('clase', [['', 'Todo el personal'], ['operativas', 'Operarios y personal operativo']].concat(AP.CAT.tiposPersonal), '');
      fClase.addEventListener('change', function () { if (datos) pintar(); });
      var out = h('div', { class: 'stack' });
      var datos = null;
      async function calcular() {
        if (!desde.value || !hasta.value || hasta.value < desde.value) return AP.toast('Revise el rango de fechas.', 'warn');
        if ((U.fromLocal(hasta.value, '12:00') - U.fromLocal(desde.value, '12:00')) / 864e5 > 62) return AP.toast('Consulte máximo 62 días por vez.', 'warn');
        var info = h('span', null, 'Consultando…');
        out.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spin' }), info));
        try {
          var a = desde.value, b = hasta.value > hoy ? hoy : hasta.value, ayer = J().addYmd(hoy, -1);
          var per = await D.personal();
          var r = await Promise.all([D.semanas(a), D.horarios().catch(function () { return []; }), D.ausencias(Math.round((Date.now() - U.fromLocal(a, '00:00')) / 864e5) + 70).catch(function () { return []; }),
            D.movimientos(J().addYmd(a, -1) < ayer ? J().addYmd(a, -1) : ayer, hoy, function (i, n) { info.textContent = 'Consultando los registros de portería (' + i + ' de ' + n + ' días)…'; }, per),
            D.permisos(U.fromLocal(a, '00:00').toISOString(), per).catch(function () { return []; })]);
          var ctx = { semanas: J().indexarSemanas(r[0], per), horarios: r[1] };
          var hab = per.filter(function (p) { return p.Estado === 'Habilitado'; });
          datos = { a: a, b: b, per: per, hab: hab, ctx: ctx, aus: r[2], movs: r[3], permisos: r[4].filter(function (x) { return U.ymd(x.Desde) >= a && U.ymd(x.Desde) <= b && x.Estado !== 'Anulado'; }),
            comp: J().compendio(hab, r[3], a, b, ctx, r[2]), grupos: J().agrupar(r[3]), avisoLegado: !!(r[3].avisoLegado || r[4].avisoLegado) };
          pintar();
        } catch (e) { out.replaceChildren(errBox(e)); }
      }
      function enClase(p) { return !fClase.value || (fClase.value === 'operativas' ? AP.CAT.clasesOperativas.indexOf(p.TipoPersonal) >= 0 : p.TipoPersonal === fClase.value); }
      function pintar() {
        var d = datos, hab = d.hab.filter(enClase), toks = new Set(hab.map(function (p) { return p.Token; }));
        var comp = d.comp.filter(function (x) { return toks.has(x.p.Token); });
        var est = hab.map(function (p) { return J().estadoAhora(p, d.grupos, d.ctx, d.aus); });
        var dentro = est.filter(function (e) { return e.k === 'dentro'; }).length, ausHoy = est.filter(function (e) { return e.k === 'ausente'; }).length;
        // Asistencia a turnos programados ya transcurridos
        var prog = 0, asis = 0, porJefe = {};
        comp.forEach(function (x) {
          var jn = jefeDe(x.p, d.per) || 'Sin jefe inmediato';
          porJefe[jn] = porJefe[jn] || { prog: 0, asis: 0 };
          x.dias.forEach(function (y) { if (y.turno && y.fecha <= hoy) { prog++; porJefe[jn].prog++; if (y.entradas.length) { asis++; porJefe[jn].asis++; } } });
        });
        // Días de ausencia por tipo dentro del periodo
        var ausP = [];
        d.aus.filter(function (x) { return toks.has(x.Token) && x.Estado !== 'Anulada'; }).forEach(function (x) {
          var y0 = U.ymd(x.Desde) > d.a ? U.ymd(x.Desde) : d.a, y1 = U.ymd(x.Hasta) < d.b ? U.ymd(x.Hasta) : d.b, n = 0;
          while (y0 <= y1) { n++; y0 = J().addYmd(y0, 1); }
          if (n > 0) ausP.push({ Tipo: x.Tipo, __n: n });
        });
        var permisos = d.permisos.filter(function (x) { return toks.has(x.Token); });
        var tardes = comp.reduce(function (s, x) { return s + x.tardes; }, 0), horasT = comp.reduce(function (s, x) { return s + x.tot.total; }, 0);
        var ser = [{ k: 'S', n: 'Personas' }];
        var barras = function (l, nombre) { return l.length ? AP.Viz.hbars(l.slice(0, 15).map(function (x) { return { label: x.k, valores: { S: x.n } }; }), [{ k: 'S', n: nombre }], { serie: nombre.toLowerCase() }) : h('p', { class: 'muted small' }, 'Sin datos en el periodo.'); };
        var serAsis = [{ k: 'F', n: 'Con ingreso' }, { k: 'D', n: 'Sin ingreso' }];
        var jefesK = Object.keys(porJefe).sort();
        out.replaceChildren(
          d.avisoLegado ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, AP.Planta.AVISO_LEGADO)) : null,
          h('div', { class: 'kpis' }, kpi(hab.length, 'Personas habilitadas en la vista'), kpi(hab.filter(function (p) { return AP.CAT.clasesOperativas.indexOf(p.TipoPersonal) >= 0; }).length, 'Operarios y personal operativo'),
            kpi(dentro, 'En planta ahora (portería)', 'brand'), kpi(hab.length - dentro, 'Fuera de planta ahora'), kpi(ausHoy, 'Con ausencia hoy'),
            kpi(pct(asis, prog), 'Asistencia a turnos programados'), kpi(tardes, 'Llegadas tarde', tardes ? 'warn' : ''), kpi(ausP.reduce(function (s, x) { return s + x.__n; }, 0), 'Días de ausencia en el periodo'),
            kpi(permisos.length, 'Permisos en el periodo'), kpi(fh(horasT), 'Horas en planta según portería')),
          h('div', { class: 'grid-2' },
            h('section', { class: 'card stack sm' }, h('h3', null, 'Personal por clase'), barras(cuenta(hab, function (p) { return p.TipoPersonal; }), 'Personas')),
            h('section', { class: 'card stack sm' }, h('h3', null, 'Personal por área'), barras(cuenta(hab, function (p) { return p.Area; }), 'Personas')),
            h('section', { class: 'card stack sm' }, h('h3', null, 'Días de ausencia por tipo'), barras(cuenta(ausP, function (x) { return x.Tipo; }), 'Días')),
            h('section', { class: 'card stack sm' }, h('h3', null, 'Permisos por tipo'), barras(cuenta(permisos, function (x) { return x.Tipo; }), 'Permisos'))),
          jefesK.length ? h('section', { class: 'card stack sm' }, h('h3', null, 'Asistencia a turnos programados, por jefe inmediato'), AP.Viz.leyenda(serAsis),
            AP.Viz.hbars(jefesK.map(function (k) { return { label: k, valores: { F: porJefe[k].asis, D: porJefe[k].prog - porJefe[k].asis }, extra: 'Asistencia ' + pct(porJefe[k].asis, porJefe[k].prog) }; }), serAsis, { unidad: 'turnos' })) : null,
          h('p', { class: 'muted small' }, 'Fuentes: fichas del personal (propio y con jefe inmediato), registros de ingreso y salida en portería, programación de turnos de los Jefes de Producción, permisos y ausencias registradas. ' +
            'La asistencia cuenta los turnos programados ya transcurridos en los que la persona registró ingreso en portería.'));
        out.exportar = function () {
          AP.exportarHojas('Estadisticas_personal_' + d.a + '_a_' + d.b, [
            { sheet: 'Por clase', rows: cuenta(hab, function (p) { return p.TipoPersonal; }), cols: [['Clase de personal', function (x) { return x.k; }, 26], ['Personas', function (x) { return x.n; }, 10]] },
            { sheet: 'Por área', rows: cuenta(hab, function (p) { return p.Area; }), cols: [['Área', function (x) { return x.k; }, 26], ['Personas', function (x) { return x.n; }, 10]] },
            { sheet: 'Por cargo', rows: cuenta(hab, function (p) { return p.Cargo; }), cols: [['Cargo', function (x) { return x.k; }, 30], ['Personas', function (x) { return x.n; }, 10]] },
            { sheet: 'Ausencias (días)', rows: cuenta(ausP, function (x) { return x.Tipo; }), cols: [['Tipo de ausencia', function (x) { return x.k; }, 36], ['Días en el periodo', function (x) { return x.n; }, 12]] },
            { sheet: 'Permisos', rows: cuenta(permisos, function (x) { return x.Tipo; }), cols: [['Tipo de permiso', function (x) { return x.k; }, 36], ['Permisos', function (x) { return x.n; }, 10]] },
            { sheet: 'Asistencia por jefe', rows: jefesK, cols: [['Jefe inmediato', function (k) { return k; }, 30], ['Turnos programados', function (k) { return porJefe[k].prog; }, 12], ['Con ingreso', function (k) { return porJefe[k].asis; }, 12]] }
          ], [['Periodo', d.a + ' a ' + d.b], ['Vista', AP.textoOpcion(fClase)], ['Corte del estado en planta', U.fDateTime(new Date())], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
        };
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('trend', 18), h('span', null, 'Estadísticas del personal propio y con jefe inmediato: composición por clase y área, presencia en planta según portería, asistencia a los turnos programados, ausencias y permisos del periodo.')),
        h('div', { class: 'filters' }, per0, AP.field('Desde', desde), AP.field('Hasta', hasta), h('button', { class: 'btn primary', type: 'button', onclick: calcular }, AP.icon('search', 18), 'Calcular')),
        h('div', { class: 'filters' }, fClase, AP.btnExcel(function () { if (!datos || !out.exportar) return AP.toast('Primero calcule las estadísticas.', 'warn'); out.exportar(); })),
        out);
      calcular();
    }

    // ---------- Horas en planta ----------
    function horas() {
      var hoy = U.ymd(), d0 = U.fromLocal(hoy, '12:00');
      var p = U.partsCO(d0), anio = Number(p.year), mes = Number(p.month), dia = Number(p.day);
      var pad = function (n) { return String(n).padStart(2, '0'); };
      var finMes = function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
      var mesAnt = mes === 1 ? [anio - 1, 12] : [anio, mes - 1];
      var lunes = J().lunes(hoy);
      var PRE = {
        semana: ['Esta semana', lunes, hoy],
        semanaAnt: ['Semana anterior', J().addYmd(lunes, -7), J().addYmd(lunes, -1)],
        quincena: ['Quincena actual', anio + '-' + pad(mes) + '-' + (dia <= 15 ? '01' : '16'), hoy],
        quincenaAnt: ['Quincena anterior', dia <= 15 ? mesAnt[0] + '-' + pad(mesAnt[1]) + '-16' : anio + '-' + pad(mes) + '-01', dia <= 15 ? mesAnt[0] + '-' + pad(mesAnt[1]) + '-' + finMes(mesAnt[0], mesAnt[1]) : anio + '-' + pad(mes) + '-15'],
        mes: ['Este mes', anio + '-' + pad(mes) + '-01', hoy],
        mesAnt: ['Mes anterior', mesAnt[0] + '-' + pad(mesAnt[1]) + '-01', mesAnt[0] + '-' + pad(mesAnt[1]) + '-' + finMes(mesAnt[0], mesAnt[1])]
      };
      var per = AP.select('per', Object.keys(PRE).map(function (k) { return [k, PRE[k][0]]; }).concat([['otro', 'Otro rango']]), 'quincena');
      var desde = AP.input('desde', PRE.quincena[1], { type: 'date' }), hasta = AP.input('hasta', PRE.quincena[2], { type: 'date' });
      per.addEventListener('change', function () { if (PRE[per.value]) { desde.value = PRE[per.value][1]; hasta.value = PRE[per.value][2]; } });
      [desde, hasta].forEach(function (i) { i.addEventListener('change', function () { per.value = 'otro'; }); });
      var fClase = AP.select('clase', [['', 'Toda clase de personal'], ['operativas', 'Operarios y personal operativo']].concat(AP.CAT.tiposPersonal), 'operativas');
      var fArea = AP.select('area', [['', 'Todas las áreas']], '');
      var fNov = AP.select('nov', [['', 'Todas las personas'], ['reg', 'Solo con registros'], ['inc', 'Solo con registros incompletos'], ['tarde', 'Solo con llegadas tarde']], 'reg');
      var q = AP.buscador('Buscar persona, documento o cargo', pintar);
      [fClase, fArea, fNov].forEach(function (s) { s.addEventListener('change', pintar); });
      var out = h('div', { class: 'stack' });
      var res = null, rango = null, personal = [], avisoH = false;
      function filtrados() {
        return (res || []).filter(function (r) {
          if (fClase.value === 'operativas') { if (AP.CAT.clasesOperativas.indexOf(r.p.TipoPersonal) < 0) return false; }
          else if (fClase.value && r.p.TipoPersonal !== fClase.value) return false;
          if (fArea.value && r.p.Area !== fArea.value) return false;
          if (fNov.value === 'reg' && !r.dias.some(function (d) { return d.entradas.length || d.salidas.length; })) return false;
          if (fNov.value === 'inc' && !r.incompletos) return false;
          if (fNov.value === 'tarde' && !r.tardes) return false;
          return AP.coincide(r.p, q.value, ['Title', 'NumDoc', 'Cargo', 'Area']);
        });
      }
      async function calcular() {
        if (!desde.value || !hasta.value || hasta.value < desde.value) return AP.toast('Revise el rango de fechas.', 'warn');
        var nDias = Math.round((U.fromLocal(hasta.value, '12:00') - U.fromLocal(desde.value, '12:00')) / 864e5) + 1;
        if (nDias > 62) return AP.toast('Consulte máximo 62 días por vez.', 'warn');
        var info = h('span', null, 'Consultando…');
        out.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spin' }), info));
        try {
          var a = J().addYmd(desde.value, -1), b = hasta.value < hoy ? J().addYmd(hasta.value, 1) : hasta.value;
          var per0 = await D.personal();
          var r = await Promise.all([per0, D.semanas(desde.value), D.horarios().catch(function () { return []; }), D.ausencias(nDias + 70).catch(function () { return []; }),
            D.movimientos(a, b, function (i, n) { info.textContent = 'Consultando los registros de portería (' + i + ' de ' + n + ' días)…'; }, per0)]);
          avisoH = !!r[4].avisoLegado;
          personal = r[0];
          var ctx = { semanas: J().indexarSemanas(r[1]), horarios: r[2] };
          ctx.semanas = J().indexarSemanas(r[1], personal);
          res = J().compendio(personal, r[4], desde.value, hasta.value, ctx, r[3]);
          rango = [desde.value, hasta.value];
          var areas = Array.from(new Set(personal.map(function (x) { return x.Area || ''; }).filter(Boolean))).sort(), v = fArea.value;
          fArea.replaceChildren.apply(fArea, [h('option', { value: '' }, 'Todas las áreas')].concat(areas.map(function (x) { return h('option', { value: x }, x); })));
          fArea.value = v;
          pintar();
        } catch (e) { out.replaceChildren(errBox(e)); }
      }
      function suma(l, k) { return l.reduce(function (a, r) { return a + r.tot[k]; }, 0); }
      function pintar() {
        if (!res) return;
        var l = filtrados().sort(function (x, y) { return y.tot.total - x.tot.total; });
        var kpi = function (v, t, kind) { return h('div', { class: 'kpi ' + (kind || '') }, h('strong', null, v), h('span', null, t)); };
        var inc = l.reduce(function (a, r) { return a + r.incompletos; }, 0);
        var top = l.filter(function (r) { return r.tot.total > 0; }).slice(0, 15);
        var series = [{ k: 'D', n: 'Diurnas' }, { k: 'N', n: 'Nocturnas' }, { k: 'F', n: 'Domingo o festivo' }];
        out.replaceChildren(
          avisoH ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, AP.Planta.AVISO_LEGADO)) : null,
          h('p', { class: 'banner warn' }, AP.icon('door', 18), h('span', null, 'Estas horas se cuentan desde la entrada hasta la salida de cada persona, de acuerdo con los registros de ingreso y salida en portería. No son la jornada liquidada.')),
          h('div', { class: 'kpis' }, kpi(String(l.length), 'Personas en la vista'), kpi(fh(suma(l, 'total')), 'Horas en planta según portería', 'brand'), kpi(fh(suma(l, 'nocturnas') + suma(l, 'dfNocturnas')), 'Horas nocturnas'),
            kpi(fh(suma(l, 'dfDiurnas') + suma(l, 'dfNocturnas')), 'Horas en domingo o festivo'), kpi(String(inc), 'Registros incompletos', inc ? 'warn' : '')),
          top.length ? h('section', { class: 'card stack sm' }, h('h3', null, 'Horas en planta por persona' + (top.length > 1 ? ' (las ' + top.length + ' con más horas)' : '')), AP.Viz.leyenda(series),
            AP.Viz.hbars(top.map(function (r) { return { label: r.p.Title, valores: { D: r.tot.diurnas, N: r.tot.nocturnas, F: r.tot.dfDiurnas + r.tot.dfNocturnas } }; }), series, { unidad: 'h' })) : null,
          tabla([
            ['Persona', function (r) { return h('div', null, h('strong', null, r.p.Title), h('small', { class: 'block muted' }, [r.p.NumDoc, r.p.TipoPersonal, r.p.Area].filter(Boolean).join(' · '))); }],
            ['Días', function (r) { return String(r.diasConRegistro); }, 'num'],
            ['Horas en planta (portería)', function (r) { return h('strong', null, fh(r.tot.total)); }, 'num'],
            ['Diurnas', function (r) { return fh(r.tot.diurnas); }, 'num'],
            ['Nocturnas', function (r) { return fh(r.tot.nocturnas); }, 'num'],
            ['Dom./fest. diurnas', function (r) { return fh(r.tot.dfDiurnas); }, 'num'],
            ['Dom./fest. nocturnas', function (r) { return fh(r.tot.dfNocturnas); }, 'num'],
            ['Programadas', function (r) { return r.programadas ? fh(r.programadas) : '—'; }, 'num'],
            ['Novedades', function (r) { return h('div', null, r.tardes ? AP.pill(r.tardes + ' tarde', 'warn') : null, r.incompletos ? AP.pill(r.incompletos + ' incompleto(s)', 'deny') : null, r.diasAus ? AP.pill(r.diasAus + ' día(s) de ausencia', 'muted') : null); }]
          ], l, detalle),
          h('p', { class: 'muted small' }, 'Horas entre la entrada y la salida registradas en portería (permanencia en planta). Diurnas de ' + ((AP.CFG.jornada || {}).inicioDiurno || '06:00') + ' a ' + ((AP.CFG.jornada || {}).inicioNocturno || '19:00') +
            ' y nocturnas de ' + ((AP.CFG.jornada || {}).inicioNocturno || '19:00') + ' a ' + ((AP.CFG.jornada || {}).inicioDiurno || '06:00') + '; domingos y festivos de Colombia aparte. No descuentan pausas ni califican horas extra: Talento Humano valida antes de liquidar la nómina.'));
      }
      function detalle(r) {
        AP.modal({ title: r.p.Title + ' — ' + U.fDate(U.fromLocal(rango[0], '12:00')) + ' a ' + U.fDate(U.fromLocal(rango[1], '12:00')), size: 'wide', body: h('div', { class: 'stack' },
          h('p', { class: 'muted small' }, 'Horas desde la entrada hasta la salida, según los registros de ingreso y salida en portería.'), tabla([
          ['Fecha', function (d) { var f = J().festivo(d.fecha); return h('div', null, U.fDate(U.fromLocal(d.fecha, '12:00')), h('small', { class: 'block muted' }, ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][J().dow(d.fecha)] + (f ? ' · ' + f : ''))); }],
          ['Turno', function (d) { return d.turno || ''; }],
          ['Entrada', function (d) { return d.entradas.map(U.fTime).join(', '); }],
          ['Salida', function (d) { return d.salidas.map(function (x) { return U.fTime(x) + (U.ymd(x) !== d.fecha ? ' (+1)' : ''); }).join(', '); }],
          ['Horas (portería)', function (d) { return fh(d.total); }, 'num'],
          ['Diurnas / nocturnas', function (d) { return fh(d.diurnas + d.dfDiurnas) + ' / ' + fh(d.nocturnas + d.dfNocturnas); }, 'num'],
          ['Novedad', function (d) { return [d.ausencia ? 'Ausencia: ' + d.ausencia : ''].concat(d.estados, d.novedades).filter(Boolean).join(' | '); }]
        ], r.dias)) });
      }
      function exportar() {
        var l = filtrados();
        if (!l.length) return AP.toast('No hay personas con el filtro actual.', 'warn');
        var filasDia = [];
        l.forEach(function (r) { r.dias.forEach(function (d) { filasDia.push({ r: r, d: d }); }); });
        var n2 = function (x) { return Math.round((x || 0) * 100) / 100; };
        AP.exportarHojas('Horas_en_planta_' + rango[0] + '_a_' + rango[1], [
          { sheet: 'Resumen', rows: l, cols: [['Persona', function (r) { return r.p.Title; }, 30], ['Documento', function (r) { return r.p.NumDoc; }, 15], ['Clase', function (r) { return r.p.TipoPersonal; }, 13],
            ['Cargo', function (r) { return r.p.Cargo; }, 20], ['Área', function (r) { return r.p.Area; }, 16], ['Días con registro', function (r) { return r.diasConRegistro; }, 10],
            ['Horas en planta', function (r) { return n2(r.tot.total); }, 11], ['Diurnas', function (r) { return n2(r.tot.diurnas); }, 10], ['Nocturnas', function (r) { return n2(r.tot.nocturnas); }, 10],
            ['Dominical/festiva diurnas', function (r) { return n2(r.tot.dfDiurnas); }, 12], ['Dominical/festiva nocturnas', function (r) { return n2(r.tot.dfNocturnas); }, 12],
            ['Horas programadas', function (r) { return n2(r.programadas); }, 11], ['Días programados', function (r) { return r.diasProg; }, 10], ['Llegadas tarde', function (r) { return r.tardes; }, 9],
            ['Registros incompletos', function (r) { return r.incompletos; }, 11], ['Días de ausencia (TH)', function (r) { return r.diasAus; }, 11]] },
          { sheet: 'Detalle por día', rows: filasDia, cols: [['Fecha', function (x) { return x.d.fecha; }, 11], ['Día', function (x) { return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][J().dow(x.d.fecha)]; }, 10],
            ['Festivo', function (x) { return J().festivo(x.d.fecha) || ''; }, 18], ['Persona', function (x) { return x.r.p.Title; }, 30], ['Documento', function (x) { return x.r.p.NumDoc; }, 15], ['Área', function (x) { return x.r.p.Area; }, 16],
            ['Turno programado', function (x) { return x.d.turno || ''; }, 22], ['Entrada(s)', function (x) { return x.d.entradas.map(U.fDateTime).join(' | '); }, 20], ['Salida(s)', function (x) { return x.d.salidas.map(U.fDateTime).join(' | '); }, 20],
            ['Horas en planta', function (x) { return n2(x.d.total); }, 10], ['Diurnas', function (x) { return n2(x.d.diurnas); }, 9], ['Nocturnas', function (x) { return n2(x.d.nocturnas); }, 9],
            ['Dom./fest. diurnas', function (x) { return n2(x.d.dfDiurnas); }, 10], ['Dom./fest. nocturnas', function (x) { return n2(x.d.dfNocturnas); }, 10],
            ['Novedad', function (x) { return [x.d.ausencia ? 'Ausencia: ' + x.d.ausencia : ''].concat(x.d.estados, x.d.novedades).filter(Boolean).join(' | '); }, 40]] }
        ], [['Periodo', rango[0] + ' a ' + rango[1]], ['Filtro', [fClase.value, fArea.value, AP.textoOpcion(fNov), q.value].filter(Boolean).join(' · ')],
          ['Franjas', 'Diurna ' + ((AP.CFG.jornada || {}).inicioDiurno || '06:00') + '–' + ((AP.CFG.jornada || {}).inicioNocturno || '19:00') + '; nocturna ' + ((AP.CFG.jornada || {}).inicioNocturno || '19:00') + '–' + ((AP.CFG.jornada || {}).inicioDiurno || '06:00') + ' (art. 160 CST, modificado por la Ley 2466 de 2025). Domingos y festivos (Ley 51 de 1983) se informan aparte.'],
          ['Alcance', 'Horas de permanencia en planta según los registros de ingreso y salida de portería. No descuentan pausas ni califican horas extra o recargos; Talento Humano los valida antes de liquidar la nómina.'],
          ['Registros incompletos', 'Ingresos sin salida o salidas sin ingreso: no suman horas hasta que se aclaren.'],
          ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Colecciones AP_Movimientos, AP_ProgPlanta, AP_Horarios y AP_Ausencias']]);
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('clock', 18), h('span', null, 'Compendio de horas de cada persona, contadas desde la entrada hasta la salida, de acuerdo con los registros de ingreso y salida en portería; divididas en diurnas, nocturnas y en domingo o festivo. ' +
          'Es un soporte para Talento Humano: no reemplaza la liquidación de nómina.')),
        h('div', { class: 'filters' }, per, AP.field('Desde', desde), AP.field('Hasta', hasta), h('button', { class: 'btn primary', type: 'button', onclick: calcular }, AP.icon('search', 18), 'Calcular')),
        h('div', { class: 'filters' }, fClase, fArea, fNov, q, AP.btnExcel(exportar)),
        out);
      out.replaceChildren(h('p', { class: 'muted' }, 'Elija el periodo y oprima «Calcular».'));
    }
  });
})();
