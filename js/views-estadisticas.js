/* Estadísticas e indicadores para el Director de Seguridad Integral y Gobierno Corporativo: ingresos, visitas por
 * anfitrión, horas en planta, novedades, ingresos negados, decisiones del Director, inspecciones y rondas, por semana,
 * mes o rango de fechas, con filtros y descarga en Excel. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function errBox(e) { return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con el servidor' : 'No fue posible cargar la información', e && e.message); }
  function cuenta(l, clave) {
    var m = {};
    l.forEach(function (x) { var k = typeof clave === 'function' ? clave(x) : x[clave]; if (k == null || k === '') return; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { k: k, n: m[k] }; }).sort(function (a, b) { return b.n - a.n || (a.k < b.k ? -1 : 1); });
  }
  function esVisitante(m) { return m.RefLista === 'AP_Visitas' || /Visitante/.test(m.Categoria || ''); }
  // Clasificación de las novedades registradas en portería
  var TIPOS_NOV = [
    [/llegada tard|ingreso tard/i, 'Llegada tardía'], [/muy temprano|antes del horario/i, 'Llegada muy temprano'], [/fuera de turno|fuera del horario/i, 'Ingreso fuera de turno'],
    [/d[ií]a no programado/i, 'Día no programado'], [/ausencia/i, 'Ingreso durante ausencia'], [/salida no autorizada/i, 'Salida no autorizada'],
    [/sin lectura de qr/i, 'Sin lectura de QR'], [/alerta de salida/i, 'Salida con alerta del Director'], [/vencimiento|vencid/i, 'Vigencia vencida'],
    [/sin salida registrada/i, 'Ingreso anterior sin salida'], [/elemento/i, 'Elementos'], [/./, 'Otras novedades']];
  function tipoNov(t) { var x = TIPOS_NOV.find(function (r) { return r[0].test(t); }); return x ? x[1] : 'Otras novedades'; }

  AP.route('/consola/estadisticas', function () {
    if (!AP.Session.can('estadisticas')) { AP.go('/'); return; }
    var content = h('div', { class: 'stack' });
    AP.consolaShell('/consola/estadisticas', 'Estadísticas e indicadores', content);
    AP.onLeave(function () { AP.Viz.limpiar(); });

    var hoy = U.ymd(), J = AP.Jornada;
    var p = U.partsCO(), anio = Number(p.year), mes = Number(p.month);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var finMes = function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
    var mesAnt = mes === 1 ? [anio - 1, 12] : [anio, mes - 1];
    var lun = J.lunes(hoy);
    var PRE = {
      semana: ['Esta semana', lun, hoy], semanaAnt: ['Semana anterior', J.addYmd(lun, -7), J.addYmd(lun, -1)],
      mes: ['Este mes', anio + '-' + pad(mes) + '-01', hoy], mesAnt: ['Mes anterior', mesAnt[0] + '-' + pad(mesAnt[1]) + '-01', mesAnt[0] + '-' + pad(mesAnt[1]) + '-' + finMes(mesAnt[0], mesAnt[1])],
      d30: ['Últimos 30 días', J.addYmd(hoy, -29), hoy], d90: ['Últimos 90 días', J.addYmd(hoy, -89), hoy]
    };
    var per = AP.select('per', Object.keys(PRE).map(function (k) { return [k, PRE[k][0]]; }).concat([['otro', 'Otro rango']]), 'mes');
    var desde = AP.input('desde', PRE.mes[1], { type: 'date' }), hasta = AP.input('hasta', PRE.mes[2], { type: 'date' });
    per.addEventListener('change', function () { if (PRE[per.value]) { desde.value = PRE[per.value][1]; hasta.value = PRE[per.value][2]; consultar(); } });
    [desde, hasta].forEach(function (i) { i.addEventListener('change', function () { per.value = 'otro'; }); });
    var fCat = AP.select('cat', [['', 'Todas las categorías']], '');
    var fArea = AP.select('area', [['', 'Todas las áreas']], '');
    var fEmp = AP.buscador('Filtrar por empresa, persona o anfitrión', function () { pintar(); });
    [fCat, fArea].forEach(function (s) { s.addEventListener('change', function () { pintar(); }); });
    var out = h('div', { class: 'stack' });
    var data = null, hojas = [];

    content.append(
      h('div', { class: 'filters' }, per, AP.field('Desde', desde), AP.field('Hasta', hasta), h('button', { class: 'btn primary', type: 'button', onclick: consultar }, AP.icon('search', 18), 'Consultar')),
      h('div', { class: 'filters' }, fCat, fArea, fEmp, AP.btnExcel(exportar, 'Descargar todo en Excel')),
      out);

    async function consultar() {
      if (!desde.value || !hasta.value || hasta.value < desde.value) return AP.toast('Revise el rango de fechas.', 'warn');
      var n = Math.round((U.fromLocal(hasta.value, '12:00') - U.fromLocal(desde.value, '12:00')) / 864e5) + 1;
      if (n > 120) return AP.toast('Consulte máximo 120 días por vez.', 'warn');
      out.replaceChildren(AP.spinner('Consultando…'));
      var a = U.fromLocal(desde.value, '00:00'), b = new Date(U.fromLocal(hasta.value, '23:59').getTime() + 59999);
      try {
        var B = AP.B;
        var r = await Promise.all([
          B.listRange('AP_Movimientos', 'FechaHora', U.addDays(a, -1), new Date(b.getTime() + 864e5)),
          B.listRange('AP_Solicitudes', 'FechaSolicitud', a, b).catch(function () { return []; }),
          B.listRange('AP_Inspecciones', 'FechaHora', a, b).catch(function () { return []; }),
          B.listRange('AP_Rondas', 'FechaHora', a, b).catch(function () { return []; }),
          B.listRange('AP_Visitas', 'FechaFin', a, U.addDays(b, 400), { exclude: ['Foto'] }).catch(function () { return []; })
        ]);
        var todos = r[0];
        data = { a: a, b: b, d0: desde.value, d1: hasta.value, todos: todos,
          movs: todos.filter(function (m) { var t = new Date(m.FechaHora); return t >= a && t <= b; }),
          sol: r[1], insp: r[2], rondas: r[3], visitas: r[4].filter(function (v) { return new Date(v.FechaInicio) <= b; }) };
        var cats = cuenta(data.movs, 'Categoria').map(function (x) { return x.k; });
        var areas = cuenta(data.movs, 'Area').map(function (x) { return x.k; }).sort();
        var vc = fCat.value, va = fArea.value;
        fCat.replaceChildren.apply(fCat, [h('option', { value: '' }, 'Todas las categorías')].concat(cats.map(function (c) { return h('option', { value: c }, c); })));
        fArea.replaceChildren.apply(fArea, [h('option', { value: '' }, 'Todas las áreas')].concat(areas.map(function (c) { return h('option', { value: c }, c); })));
        fCat.value = vc; fArea.value = va;
        pintar();
      } catch (e) { out.replaceChildren(errBox(e)); }
    }

    function filtrar(l) {
      return l.filter(function (m) {
        if (fCat.value && m.Categoria !== fCat.value) return false;
        if (fArea.value && m.Area !== fArea.value) return false;
        return AP.coincide(m, fEmp.value, ['Empresa', 'Title', 'Anfitrion', 'NumDoc']);
      });
    }

    function seccion(titulo, sub, cuerpo, tablaCab, tablaFilas) {
      hojas.push({ sheet: titulo.slice(0, 31).replace(/[\\/?*\[\]:]/g, ''), cols: tablaCab.map(function (c, i) { return [c, function (f) { return f[i]; }, i === 0 ? 36 : 16]; }), rows: tablaFilas });
      return h('section', { class: 'card stack sm' }, h('h3', null, titulo), sub ? h('p', { class: 'muted small' }, sub) : null, cuerpo, AP.Viz.tablaDe('Ver la tabla', tablaCab, tablaFilas));
    }
    var S1 = [{ k: 'S', n: 'Ingresos' }];

    function pintar() {
      if (!data) return;
      AP.Viz.limpiar();
      hojas = [];
      var movs = filtrar(data.movs);
      var ingresos = movs.filter(function (m) { return m.Sentido === 'Ingreso' && m.Resultado === 'Permitido'; });
      var negados = movs.filter(function (m) { return m.Resultado === 'Negado'; });
      var excep = movs.filter(function (m) { return m.Excepcion; });
      var nov = movs.filter(function (m) { return m.Novedad; });
      var visit = ingresos.filter(esVisitante);
      var personas = new Set(ingresos.map(function (m) { return m.Token || U.normDoc(m.NumDoc) || m.IdLocal; }));
      var solDec = data.sol.filter(function (x) { return x.Estado === 'Aprobada' || x.Estado === 'Rechazada'; });
      var inspNC = data.insp.filter(function (i) { return i.Resultado === 'No conforme'; });
      var rondNov = data.rondas.filter(function (x) { return x.Novedad; });
      var kpi = function (v, t, kind) { return h('div', { class: 'kpi ' + (kind || '') }, h('strong', null, String(v)), h('span', null, t)); };

      // Ingresos por día
      var dias = [], y = data.d0;
      while (y <= data.d1) { dias.push(y); y = J.addYmd(y, 1); }
      var porDia = {}; ingresos.forEach(function (m) { var d = U.ymd(m.FechaHora); porDia[d] = (porDia[d] || 0) + 1; });
      var DS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      var serieDias = dias.map(function (d) { return { x: d.slice(8), titulo: DS[J.dow(d)] + ' ' + U.fDate(U.fromLocal(d, '12:00')) + (J.festivo(d) ? ' (festivo)' : ''), valores: { S: porDia[d] || 0 } }; });
      // Por hora del día
      var porHora = new Array(24).fill(0); ingresos.forEach(function (m) { porHora[parseInt(U.partsCO(m.FechaHora).hour, 10)]++; });
      // Visitas por anfitrión y empresas
      var anf = cuenta(visit, function (m) { return m.Anfitrion || 'Sin anfitrión registrado'; });
      var emp = cuenta(ingresos.filter(function (m) { return m.Empresa && !/^avo ?pak/i.test(m.Empresa); }), 'Empresa');
      var cats = cuenta(ingresos, 'Categoria');
      // Novedades
      var novTipo = cuenta(nov, function (m) { return String(m.Novedad).split(' | ').map(tipoNov)[0]; });
      var novPer = cuenta(nov.filter(function (m) { return !esVisitante(m); }), function (m) { return m.Title + (m.NumDoc ? ' (' + m.NumDoc + ')' : ''); });
      var negMot = cuenta(negados, function (m) { return String(m.EstadoMostrado || m.MotivoNegacion || 'Sin motivo').replace(/\s*—.*$/, '').replace(/\(\d+ MIN\)/i, '').trim(); });
      // Horas en planta del personal propio (entre la entrada y la salida registradas)
      var propios = data.todos.filter(function (m) { return /Personal propio/.test(m.Categoria || '') && (!fArea.value || m.Area === fArea.value) && AP.coincide(m, fEmp.value, ['Empresa', 'Title', 'NumDoc']); });
      var grupos = {};
      propios.forEach(function (m) { var k = m.Token || ('DOC:' + U.normDoc(m.NumDoc)); (grupos[k] = grupos[k] || []).push(m); });
      var horasPer = [], horasArea = {};
      Object.keys(grupos).forEach(function (k) {
        var ms = grupos[k].filter(function (m) { return m.Resultado === 'Permitido'; }).sort(function (a, b) { return a.FechaHora < b.FechaHora ? -1 : 1; });
        var tot = 0;
        J.intervalos(ms).forEach(function (iv) {
          if (iv.estado !== 'Completo') return;
          var d = U.ymd(iv.ini.FechaHora); if (d < data.d0 || d > data.d1) return;
          tot += (new Date(iv.fin.FechaHora) - new Date(iv.ini.FechaHora)) / 3600000;
        });
        if (!tot) return;
        var m0 = ms[ms.length - 1] || grupos[k][0];
        horasPer.push({ k: m0.Title + (m0.NumDoc ? ' (' + m0.NumDoc + ')' : ''), n: tot, area: m0.Area || 'Sin área' });
        horasArea[m0.Area || 'Sin área'] = (horasArea[m0.Area || 'Sin área'] || 0) + tot;
      });
      horasPer.sort(function (a, b) { return b.n - a.n; });
      var hArea = Object.keys(horasArea).map(function (k) { return { k: k, n: horasArea[k] }; }).sort(function (a, b) { return b.n - a.n; });
      // Decisiones del Director
      var solTipo = cuenta(data.sol, function (x) { return (x.Tipo || 'Solicitud') + ' — ' + (x.Estado || ''); });
      var inspRes = cuenta(data.insp, 'Resultado');
      var rondaPunto = cuenta(data.rondas, 'Title');
      var r1 = function (n) { return Math.round(n * 10) / 10; };
      var top = function (l, n) { return l.slice(0, n || 10); };
      var barras = function (l, unidad, serie) { return AP.Viz.hbars(l.map(function (x) { return { label: x.k, valores: { S: x.n } }; }), S1, { unidad: unidad || '', serie: serie || '' }); };

      out.replaceChildren(
        h('p', { class: 'muted small' }, 'Periodo: ' + U.fDate(data.a) + ' a ' + U.fDate(data.b) + (fCat.value || fArea.value || fEmp.value ? ' · Filtro: ' + [fCat.value, fArea.value, fEmp.value].filter(Boolean).join(' · ') : '') +
          '. Fuente: registros de portería (incluye los enviados sin conexión que ya llegaron al servidor).'),
        h('div', { class: 'kpis' }, kpi(ingresos.length, 'Ingresos registrados', 'brand'), kpi(personas.size, 'Personas distintas que ingresaron'), kpi(visit.length, 'Ingresos de visitantes'),
          kpi(negados.length, 'Ingresos negados', negados.length ? 'deny' : ''), kpi(excep.length, 'Excepciones', excep.length ? 'warn' : ''), kpi(nov.length, 'Registros con novedad', nov.length ? 'warn' : ''),
          kpi(data.visitas.filter(function (v) { return v.Estado === 'Aprobada'; }).length, 'Visitas aprobadas que tocan el periodo'),
          kpi(solDec.length + ' / ' + data.sol.length, 'Solicitudes al Director decididas'), kpi(data.insp.length + (inspNC.length ? ' (' + inspNC.length + ' NC)' : ''), 'Inspecciones de carga', inspNC.length ? 'deny' : ''),
          kpi(data.rondas.length + (rondNov.length ? ' (' + rondNov.length + ' nov.)' : ''), 'Marcaciones de ronda', rondNov.length ? 'warn' : '')),
        h('div', { class: 'grid-2' },
          seccion('Ingresos por día', 'Cada columna es un día del periodo.', AP.Viz.cols(serieDias, S1, { unidad: 'ingresos', serie: 'ingresos' }),
            ['Día', 'Ingresos'], serieDias.map(function (d) { return [d.titulo, d.valores.S]; })),
          seccion('Ingresos por hora del día', 'Hora de llegada (todas las fechas del periodo).', AP.Viz.cols(porHora.map(function (n, i) { return { x: String(i), titulo: pad(i) + ':00 a ' + pad(i) + ':59', valores: { S: n } }; }), S1, { unidad: 'ingresos', serie: 'ingresos' }),
            ['Hora', 'Ingresos'], porHora.map(function (n, i) { return [pad(i) + ':00', n]; }))),
        h('div', { class: 'grid-2' },
          seccion('Visitas recibidas por anfitrión', 'Ingresos de visitantes, por la persona de la compañía a la que visitaron (las 10 primeras).', anf.length ? barras(top(anf), 'visitas', 'visitas recibidas') : AP.empty('user', 'Sin visitas en el periodo'),
            ['Anfitrión', 'Visitas recibidas'], anf.map(function (x) { return [x.k, x.n]; })),
          seccion('Ingresos por categoría', null, cats.length ? barras(cats, 'ingresos') : AP.empty('users', 'Sin ingresos en el periodo'),
            ['Categoría', 'Ingresos'], cats.map(function (x) { return [x.k, x.n]; }))),
        h('div', { class: 'grid-2' },
          seccion('Horas en planta por área (personal propio)', 'Suma de las horas entre la entrada y la salida registradas en portería. No equivale a horas trabajadas para nómina.', hArea.length ? AP.Viz.hbars(hArea.map(function (x) { return { label: x.k, valores: { S: r1(x.n) } }; }), S1, { unidad: 'h', serie: 'horas en planta' }) : AP.empty('clock', 'Sin registros completos de entrada y salida'),
            ['Área', 'Horas en planta'], hArea.map(function (x) { return [x.k, r1(x.n)]; })),
          seccion('Personas con más horas en planta', 'Personal propio (las 10 primeras).', horasPer.length ? AP.Viz.hbars(top(horasPer).map(function (x) { return { label: x.k, valores: { S: r1(x.n) }, extra: x.area }; }), S1, { unidad: 'h', serie: 'horas en planta' }) : AP.empty('clock', 'Sin registros completos de entrada y salida'),
            ['Persona', 'Área', 'Horas en planta'], horasPer.map(function (x) { return [x.k, x.area, r1(x.n)]; }))),
        h('div', { class: 'grid-2' },
          seccion('Novedades por tipo', 'Llegadas tarde, ingresos fuera de turno, salidas no autorizadas y demás novedades registradas en portería.', novTipo.length ? barras(novTipo, 'novedades') : AP.empty('check', 'Sin novedades en el periodo'),
            ['Tipo de novedad', 'Registros'], novTipo.map(function (x) { return [x.k, x.n]; })),
          seccion('Personas con más novedades', 'Personal propio, contratistas y conductores (las 10 primeras).', novPer.length ? barras(top(novPer), 'novedades') : AP.empty('check', 'Sin novedades en el periodo'),
            ['Persona', 'Novedades'], novPer.map(function (x) { return [x.k, x.n]; }))),
        h('div', { class: 'grid-2' },
          seccion('Ingresos negados por motivo', null, negMot.length ? barras(top(negMot), 'negados') : AP.empty('check', 'Sin ingresos negados'),
            ['Motivo', 'Ingresos negados'], negMot.map(function (x) { return [x.k, x.n]; })),
          seccion('Empresas con más ingresos', 'Contratistas, transportadoras y visitantes de otras empresas (las 10 primeras).', emp.length ? barras(top(emp), 'ingresos') : AP.empty('truck', 'Sin ingresos de terceros'),
            ['Empresa', 'Ingresos'], emp.map(function (x) { return [x.k, x.n]; }))),
        h('div', { class: 'grid-2' },
          seccion('Solicitudes de ingreso decididas por el Director', 'Llegadas tardías, fuera de turno, días no programados y ausencias.', solTipo.length ? barras(solTipo, 'solicitudes') : AP.empty('inbox', 'Sin solicitudes en el periodo'),
            ['Tipo y decisión', 'Solicitudes'], solTipo.map(function (x) { return [x.k, x.n]; })),
          seccion('Inspecciones de carga y rondas', null, h('div', { class: 'stack sm' },
            inspRes.length ? barras(inspRes, 'inspecciones') : h('p', { class: 'muted small' }, 'Sin inspecciones en el periodo.'),
            rondaPunto.length ? h('div', { class: 'stack xs' }, h('strong', { class: 'small' }, 'Marcaciones de ronda por punto'), barras(top(rondaPunto), 'marcaciones')) : h('p', { class: 'muted small' }, 'Sin marcaciones de ronda en el periodo.')),
            ['Indicador', 'Cantidad'], inspRes.map(function (x) { return ['Inspección ' + x.k.toLowerCase(), x.n]; }).concat(rondaPunto.map(function (x) { return ['Ronda — ' + x.k, x.n]; })))));
    }

    function exportar() {
      if (!data || !hojas.length) return AP.toast('Consulte primero el periodo.', 'warn');
      AP.exportarHojas('Estadisticas_' + data.d0 + '_a_' + data.d1, hojas, [['Periodo', data.d0 + ' a ' + data.d1],
        ['Filtro', [fCat.value, fArea.value, fEmp.value].filter(Boolean).join(' · ') || 'ninguno'],
        ['Nota', 'Las horas en planta son el tiempo entre la entrada y la salida registradas en portería; no equivalen a horas trabajadas para nómina.'],
        ['Generado por', AP.Session.user.nombre + ' (' + AP.Session.rol + ')'], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Colecciones AP_Movimientos, AP_Solicitudes, AP_Inspecciones, AP_Rondas y AP_Visitas']]);
    }
    consultar();
  });
})();
