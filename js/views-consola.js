/* Consola web de la Dirección de Seguridad Integral */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function guard(perm) {
    if (!AP.Session.can(perm || 'consola')) { AP.go('/porteria'); return false; }
    return true;
  }
  function offlineBox() {
    return AP.empty('offline', 'Sin conexión con el servidor', 'La consola consulta los datos en línea. Verifique la conexión e intente de nuevo.',
      h('button', { class: 'btn', type: 'button', onclick: function () { AP.render(); } }, AP.icon('sync', 18), 'Reintentar'));
  }
  function errorBox(e) {
    if (e && e.offline) return offlineBox();
    if (e && e.missingList) return AP.empty('settings', 'Falta configurar la base de datos', e.message, AP.Session.can('admin') ? h('a', { class: 'btn primary', href: '#/consola/instalacion' }, 'Ir a instalación') : null);
    return AP.empty('alert', 'No fue posible cargar la información', e && e.message);
  }
  async function load(content, fn) {
    content.replaceChildren(AP.spinner('Consultando…'));
    try { await fn(); } catch (e) { console.error(e); content.replaceChildren(errorBox(e)); }
  }

  // Tabla con paginación
  function table(cols, rows, opt) {
    opt = opt || {};
    var page = 0, size = opt.size || 25;
    var wrap = h('div', { class: 'table-wrap' });
    function paint() {
      var slice = rows.slice(page * size, (page + 1) * size);
      var t = h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { class: c.cls || '' }, c.label); }))),
        h('tbody', null, slice.length ? slice.map(function (r) {
          return h('tr', { class: opt.rowClass ? opt.rowClass(r) : '', onclick: opt.onRow ? function (e) { if (!e.target.closest('button,a,input,label')) opt.onRow(r); } : null },
            cols.map(function (c) { var v = c.render ? c.render(r) : r[c.key]; return h('td', { class: c.cls || '', 'data-label': c.label }, v === undefined || v === null ? '' : v); }));
        }) : h('tr', null, h('td', { colspan: cols.length, class: 'center muted' }, opt.empty || 'Sin registros'))));
      var pages = Math.max(1, Math.ceil(rows.length / size));
      var pager = rows.length > size ? h('div', { class: 'pager' },
        h('button', { class: 'btn small', type: 'button', disabled: page === 0, onclick: function () { page--; paint(); } }, 'Anterior'),
        h('span', null, 'Página ' + (page + 1) + ' de ' + pages + ' · ' + rows.length + ' registros'),
        h('button', { class: 'btn small', type: 'button', disabled: page >= pages - 1, onclick: function () { page++; paint(); } }, 'Siguiente'))
        : h('div', { class: 'pager' }, h('span', null, rows.length + ' registro(s)'));
      wrap.replaceChildren(h('div', { class: 'tbl-scroll' }, t), pager);
      if (opt.afterPaint) opt.afterPaint(slice);
    }
    paint();
    wrap.repaint = function (newRows) { if (newRows) rows = newRows; page = 0; paint(); };
    return wrap;
  }

  // Exportación con huella SHA-256 registrada en bitácora
  async function exportar(nombre, columnas, filas, formato, info) {
    var blob;
    var stamp = U.ymd() + '_' + U.partsCO().hour + U.partsCO().minute;
    var file = U.safeName(nombre) + '_' + stamp + '.' + formato;
    if (formato === 'xlsx' && window.writeXlsxFile) {
      var head = columnas.map(function (c) { return { value: c[0], fontWeight: 'bold', backgroundColor: '#E8ECDD' }; });
      var data = [head].concat(filas.map(function (r) {
        return columnas.map(function (c) {
          var v = c[1](r);
          if (v instanceof Date) return { value: v, type: Date, format: 'dd/mm/yyyy hh:mm' };
          if (typeof v === 'number') return { value: v, type: Number };
          return { value: v === undefined || v === null ? '' : String(v), type: String };
        });
      }));
      var meta = [[{ value: 'Información de la exportación', fontWeight: 'bold' }]].concat((info || []).map(function (x) { return [{ value: x[0], fontWeight: 'bold' }, { value: String(x[1]) }]; }))
        .concat([[{ value: '' }], [{ value: AP.TX.pieExportacion, wrap: true }]]);
      blob = await window.writeXlsxFile([
        { data: data, sheet: 'Datos', columns: columnas.map(function (c) { return { width: c[2] || 18 }; }), stickyRowsCount: 1 },
        { data: meta, sheet: 'Información', columns: [{ width: 28 }, { width: 70 }] }
      ]).toBlob();
    } else {
      var rows = [columnas.map(function (c) { return c[0]; })].concat(filas.map(function (r) {
        return columnas.map(function (c) { var v = c[1](r); return v instanceof Date ? U.fDateTime(v) : v; });
      }));
      blob = new Blob([U.csv(rows)], { type: 'text/csv;charset=utf-8' });
      if (formato !== 'csv') file = file.replace(/\.\w+$/, '.csv');
    }
    var hash = await U.sha256(blob);
    U.download(blob, file);
    await AP.Audit.log('Exportación', file, filas.length + ' registros. ' + (info || []).map(function (x) { return x[0] + ': ' + x[1]; }).join(' | '), hash);
    AP.modal({
      title: 'Archivo generado',
      body: h('div', { class: 'stack' }, h('p', null, 'Se descargó ', h('strong', null, file), ' con ' + filas.length + ' registros.'),
        h('p', { class: 'muted small' }, 'Huella SHA-256 (registrada en la bitácora; permite demostrar que el archivo no ha sido alterado):'),
        h('code', { class: 'hash' }, hash)),
      actions: [{ label: 'Cerrar', kind: 'primary' }]
    });
  }
  AP.exportar = exportar;

  // =================== PANEL ===================
  AP.route('/consola/panel', function () {
    if (!guard()) return;
    var content = h('div', { class: 'stack' });
    AP.consolaShell('/consola/panel', 'Panel de control', content,
      h('button', { class: 'btn', type: 'button', onclick: function () { AP.render(); } }, AP.icon('sync', 18), 'Actualizar'));
    load(content, async function () {
      var B = AP.B;
      var hoy0 = U.startOfDayCO();
      var res = await Promise.all([
        B.listRange('AP_Movimientos', 'FechaHora', U.addDays(hoy0, -6), null),
        B.listRange('AP_Visitas', 'FechaFin', U.addDays(hoy0, -1), null),
        B.listAll('AP_Personas', { exclude: ['Foto', 'Observaciones'] }),
        B.listRange('AP_Inspecciones', 'FechaHora', hoy0, null).catch(function () { return []; }),
        AP.Session.consulta() ? B.listRange('AP_Rondas', 'FechaHora', hoy0, null).catch(function () { return []; }) : Promise.resolve([]),
        AP.Session.can('ver') ? AP.Sync.pullSolicitudes().catch(function () { return AP.Sync.solicitudes || []; }) : Promise.resolve([])
      ]);
      var movs = res[0], vis = res[1], pers = res[2], insp = res[3], rondas = res[4], solic = res[5];
      // Se combinan los registros de este dispositivo que aún no se han enviado
      var seen = new Set(movs.map(function (m) { return m.IdLocal; }));
      AP.Sync.outbox.forEach(function (o) { if (o.kind === 'mov' && !seen.has(o.fields.IdLocal)) movs.push(Object.assign({ _pendiente: true }, o.fields)); });
      AP.Sync.movs = movs.filter(function (m) { return !m._pendiente; });
      var hoy = movs.filter(function (m) { return new Date(m.FechaHora) >= hoy0; });
      var dentro = AP.Access.inside();
      var max = (AP.CFG.horasMaxPermanencia || 14) * 3600000;
      var ingresos = hoy.filter(function (m) { return m.Sentido === 'Ingreso' && m.Resultado === 'Permitido'; });
      var negados = hoy.filter(function (m) { return m.Resultado === 'Negado'; });
      var excep = hoy.filter(function (m) { return m.Excepcion; });
      // Visitas aprobadas para hoy que aún no han llegado: al ingresar el visitante salen de esta cuenta (ya está dentro)
      var ahoraP = new Date();
      var visHoy = vis.filter(function (v) {
        return v.Estado === 'Aprobada' && U.ymd(v.FechaInicio) <= U.ymd() && U.ymd(v.FechaFin) >= U.ymd() && new Date(v.FechaFin) > ahoraP && AP.Access.estadoVisita(v).clave === 'porLlegar';
      }).sort(function (a, b) { return a.FechaInicio < b.FechaInicio ? -1 : 1; });
      var pend = vis.filter(function (v) { return v.Estado === 'Pendiente' && new Date(v.FechaFin) >= new Date(); });
      var nc = insp.filter(function (i) { return i.Resultado === 'No conforme'; });
      var porPersona = new Map(pers.map(function (p) { return [p.Token, p]; }));
      var visTok = new Map(vis.map(function (v) { return [v.Token, v]; }));

      var alertas = [];
      dentro.forEach(function (m) {
        if (Date.now() - new Date(m.FechaHora).getTime() > max) alertas.push(['clock', 'warn', m.Title + ' lleva ' + U.duracion(m.FechaHora) + ' dentro (ingresó ' + U.fDateTime(m.FechaHora) + ').']);
        var v = visTok.get(m.Token);
        if (v && new Date(v.FechaFin) < new Date()) alertas.push(['user', 'warn', 'Visitante ' + m.Title + ' sigue dentro y su visita venció a las ' + U.fTime(v.FechaFin) + '.']);
        var p = porPersona.get(m.Token);
        if (p && p.Estado !== 'Habilitado') alertas.push(['lock', 'deny', m.Title + ' está dentro y hoy figura INHABILITADO.']);
      });
      movs.forEach(function (m) {
        if (m.SinConexion && m.Sentido === 'Ingreso' && m.Resultado === 'Permitido' && new Date(m.FechaHora) >= U.addDays(hoy0, -1)) {
          var p = porPersona.get(m.Token);
          if (p && p.Estado !== 'Habilitado') alertas.push(['offline', 'deny', 'Ingreso registrado sin conexión de ' + m.Title + ' (' + U.fDateTime(m.FechaHora) + '); hoy figura INHABILITADO. Verifique si la inhabilitación era anterior al ingreso.']);
        }
        if (m.DesfaseReloj && Math.abs(m.DesfaseReloj) > 300 && new Date(m.FechaHora) >= hoy0) alertas.push(['clock', 'warn', 'Registro de ' + m.Title + ' con hora del celular desfasada ' + Math.round(m.DesfaseReloj / 60) + ' min.']);
      });
      // Quién autorizó la excepción y por qué
      var autorizo = function (m) { return m.Excepcion ? ' Autorizó: ' + (m.AutorizadoPor || '—') + (m.MotivoExcepcion ? '. Justificación: ' + String(m.MotivoExcepcion).replace(/[.\s]+$/, '') : '') + '.' : ''; };
      movs.forEach(function (m) {
        if (!m.Novedad || new Date(m.FechaHora) < hoy0) return;
        var grave = /no autorizada|denegad/i.test(m.Novedad);
        var sinQR = /sin lectura de QR/i.test(m.Novedad);
        alertas.push([grave ? 'alert' : sinQR ? 'key' : 'clock', grave ? 'deny' : 'warn', m.Title + ' — ' + m.Novedad + ' (' + U.fTime(m.FechaHora) + (m.Vigilante ? ', registró ' + m.Vigilante : '') + ').' + autorizo(m) + ' Verifique en Novedades.']);
      });
      negados.forEach(function (m) { alertas.push(['x', 'deny', 'Ingreso negado a ' + m.Title + ' a las ' + U.fTime(m.FechaHora) + ': ' + (m.MotivoNegacion || '')]); });
      // Las excepciones con novedad ya figuran arriba, con quién autorizó y la justificación
      excep.filter(function (m) { return !m.Novedad; }).forEach(function (m) { alertas.push(['key', 'warn', 'Ingreso por excepción de ' + m.Title + ' (' + U.fTime(m.FechaHora) + ').' + autorizo(m)]); });
      hoy.filter(function (m) { return m.Categoria === 'Autoridad' && m.Sentido === 'Ingreso' && m.Resultado === 'Permitido'; }).forEach(function (m) {
        alertas.push(['badge', 'warn', 'Visita de autoridad: ' + [m.Empresa, m.Title].filter(Boolean).join(' — ') + (m.Area ? ' (' + m.Area + ')' : '') + ', ingresó a las ' + U.fTime(m.FechaHora) + (m.Vigilante ? ', registró ' + m.Vigilante : '') + '. Diligencie el formato AP-SG-FT-002.']);
      });
      nc.forEach(function (i) { alertas.push(['truck', 'deny', 'Inspección NO CONFORME: ' + i.Placa + ' (' + U.fTime(i.FechaHora) + '). ' + (i.NoConformidades || '')]); });
      solic.filter(function (x) { return x.Estado === 'Pendiente'; }).forEach(function (x) {
        alertas.unshift(['inbox', 'deny', 'Solicitud de ingreso esperando su decisión desde las ' + U.fTime(x.FechaSolicitud) + ': ' + x.Title + ' — ' + (x.Novedad || x.Tipo) + '. Decida en Solicitudes de ingreso.']);
      });
      rondas.filter(function (x) { return x.Novedad; }).forEach(function (x) {
        alertas.push(['route', 'warn', 'Novedad de ronda en ' + x.Title + ' (' + U.fTime(x.FechaHora) + '): ' + [x.TipoNovedad, x.Descripcion].filter(Boolean).join(' — ') + (x.Rondero ? '. Reportó ' + x.Rondero : '') + '.']);
      });
      pend.forEach(function (v) {
        alertas.push(v.Origen === 'Portería'
          ? ['user', 'warn', 'Visitante no anunciado esperando en portería desde las ' + U.fTime(v.FechaSolicitud || v.FechaInicio) + ': ' + v.Title + '. Apruebe o rechace en Visitas.']
          : ['user', 'info', 'Visita pendiente de aprobación: ' + v.Title + ' (' + U.fDateTime(v.FechaInicio) + ').']);
      });

      var kpi = function (n, l, icon, kind, href, onclick) {
        var attrs = { class: 'kpi ' + (kind || '') + (href || onclick ? ' kpi-link' : ''), href: href ? '#' + href : null };
        if (onclick) attrs.onclick = onclick;
        return h(href ? 'a' : 'div', attrs, AP.icon(icon, 22), h('strong', null, String(n)), h('span', null, l));
      };
      // Lista del panel con búsqueda y descarga en Excel de lo filtrado
      function modalLista(titulo, cols, filas, vacia) {
        AP.modal({ title: titulo, size: 'wide', body: function () {
          if (!filas.length) return h('p', { class: 'muted center' }, vacia || 'Sin registros.');
          var tbox = h('div');
          var q = AP.buscador('Buscar en la lista', pintarM);
          function filtradas() { return filas.filter(function (r) { return AP.coincide(r, q.value, cols.map(function (c) { return c[1]; })); }); }
          function pintarM() {
            var l = filtradas();
            tbox.replaceChildren(l.length ? h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
              h('thead', null, h('tr', null, cols.map(function (c) { return h('th', null, c[0]); }))),
              h('tbody', null, l.map(function (r) { return h('tr', null, cols.map(function (c) { var v = c[1](r); return h('td', { 'data-label': c[0] }, v == null ? '' : v); })); }))))
              : h('p', { class: 'muted center' }, 'Ningún registro coincide con la búsqueda.'));
          }
          pintarM();
          return h('div', { class: 'stack' }, h('div', { class: 'filters' }, q, AP.btnExcel(function () {
            var l = filtradas();
            if (!l.length) return AP.toast('No hay registros con el filtro actual.', 'warn');
            exportar(titulo.replace(/\s*\(\d+\)$/, ''), cols.map(function (c) { return [c[0], c[1], 22]; }), l, 'xlsx',
              [['Lista', titulo], ['Filtro', q.value || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
          })), tbox);
        } });
      }
      var cats = {};
      dentro.forEach(function (m) { var c = m.Categoria || 'Otro'; cats[c] = (cats[c] || 0) + 1; });

      // Ingresos por hora (hoy)
      var horas = new Array(24).fill(0);
      ingresos.forEach(function (m) { horas[parseInt(U.partsCO(m.FechaHora).hour, 10)]++; });
      var maxH = Math.max.apply(null, horas.concat([1]));
      var chart = h('div', { class: 'hbars', role: 'img', 'aria-label': 'Ingresos por hora hoy' }, horas.map(function (n, i) {
        return h('div', { class: 'hbar', title: i + ':00 — ' + n + ' ingresos' }, h('span', { style: { height: Math.round(n / maxH * 100) + '%' } }), h('small', null, i % 3 === 0 ? String(i) : ''));
      }));

      var recientes = movs.slice().sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; }).slice(0, 12);
      content.replaceChildren(
        h('div', { class: 'kpis' },
          kpi(dentro.length, 'Personas dentro ahora', 'users', 'brand', null, function () {
            modalLista('Personas dentro ahora (' + dentro.length + ')', [
              ['Nombre', function (m) { return m.Title; }],
              ['Categoría', function (m) { return m.Categoria; }],
              ['Empresa', function (m) { return m.Empresa; }],
              ['Ingresó', function (m) { return U.fDateTime(m.FechaHora); }],
              ['Tiempo dentro', function (m) { return U.duracion(m.FechaHora); }],
              ['Vigilante', function (m) { return m.Vigilante; }]
            ], dentro, 'Nadie registrado dentro en este momento.');
          }),
          kpi(ingresos.length, 'Ingresos hoy', 'door', '', null, function () {
            modalLista('Ingresos de hoy (' + ingresos.length + ')', [
              ['Hora', function (m) { return U.fTime(m.FechaHora); }],
              ['Nombre', function (m) { return m.Title; }],
              ['Categoría', function (m) { return m.Categoria; }],
              ['Empresa', function (m) { return m.Empresa; }],
              ['Placa', function (m) { return m.Placa; }],
              ['Vigilante', function (m) { return m.Vigilante; }]
            ], ingresos, 'Sin ingresos registrados hoy.');
          }),
          kpi(negados.length, 'Ingresos negados hoy', 'x', negados.length ? 'deny' : '', null, function () {
            modalLista('Ingresos negados hoy (' + negados.length + ')', [
              ['Hora', function (m) { return U.fTime(m.FechaHora); }],
              ['Nombre', function (m) { return m.Title; }],
              ['Motivo', function (m) { return m.MotivoNegacion; }],
              ['Vigilante', function (m) { return m.Vigilante; }]
            ], negados, 'Sin ingresos negados hoy.');
          }),
          kpi(excep.length, 'Excepciones hoy', 'key', excep.length ? 'warn' : '', null, function () {
            modalLista('Excepciones de hoy (' + excep.length + ')', [
              ['Hora', function (m) { return U.fTime(m.FechaHora); }],
              ['Nombre', function (m) { return m.Title; }],
              ['Autorizado por', function (m) { return m.AutorizadoPor; }],
              ['Motivo', function (m) { return m.MotivoExcepcion; }],
              ['Vigilante', function (m) { return m.Vigilante; }]
            ], excep, 'Sin excepciones registradas hoy.');
          }),
          kpi(hoy.filter(function (m) { return m.Novedad; }).length, 'Novedades hoy', 'alert', hoy.some(function (m) { return m.Novedad; }) ? 'warn' : '', null, function () {
            modalLista('Novedades de hoy', [
              ['Hora', function (m) { return U.fTime(m.FechaHora); }],
              ['Nombre', function (m) { return m.Title; }],
              ['Novedad', function (m) { return m.Novedad; }],
              ['Vigilante', function (m) { return m.Vigilante; }]
            ], hoy.filter(function (m) { return m.Novedad; }), 'Sin novedades registradas hoy.');
          }),
          kpi(visHoy.length, 'Visitas por llegar hoy', 'user', '', null, function () {
            modalLista('Visitas por llegar hoy (' + visHoy.length + ')', [
              ['Visitante', function (v) { return v.Title; }],
              ['Empresa', function (v) { return v.Empresa; }],
              ['Hora inicio', function (v) { return U.fTime(v.FechaInicio); }],
              ['Hora fin', function (v) { return U.fTime(v.FechaFin); }],
              ['Anfitrión', function (v) { return v.Anfitrion; }],
              ['Área', function (v) { return v.Area; }]
            ], visHoy, 'No hay visitas aprobadas por llegar hoy. Las que ya ingresaron figuran en «Personas dentro ahora».');
          }),
          kpi(pend.length, AP.Session.can('editar') ? 'Visitas por aprobar' : 'Visitas pendientes de aprobación', 'inbox', pend.length ? 'warn' : '', '/consola/visitas?t=pendientes'),
          kpi(insp.length, 'Inspecciones hoy', 'truck', nc.length ? 'deny' : '', null, function () {
            modalLista('Inspecciones de hoy (' + insp.length + ')', [
              ['Hora', function (i) { return U.fTime(i.FechaHora); }],
              ['Placa', function (i) { return i.Placa; }],
              ['Tipo', function (i) { return i.TipoVehiculo; }],
              ['Resultado', function (i) { return i.Resultado; }],
              ['No conformidades', function (i) { return i.NoConformidades; }],
              ['Inspector', function (i) { return i.Inspector; }]
            ], insp, 'Sin inspecciones registradas hoy.');
          }),
          AP.Session.can('ver') ? kpi(solic.filter(function (x) { return x.Estado === 'Pendiente'; }).length, 'Ingresos por decidir', 'inbox', solic.some(function (x) { return x.Estado === 'Pendiente'; }) ? 'deny' : '', '/consola/solicitudes') : null,
          AP.Session.consulta() ? kpi(rondas.length, 'Marcaciones de ronda hoy', 'route', rondas.some(function (x) { return x.Novedad; }) ? 'warn' : '', null, function () {
            modalLista('Marcaciones de ronda de hoy (' + rondas.length + ')', [
              ['Hora', function (x) { return U.fTime(x.FechaHora); }],
              ['Punto', function (x) { return x.Title; }],
              ['Registró', function (x) { return x.Rondero + (x.Rol && x.Rol !== 'Rondero' ? ' (supervisión)' : ''); }],
              ['Lectura', function (x) { return x.Origen; }],
              ['Novedad', function (x) { return x.Novedad ? [x.TipoNovedad, x.Descripcion].filter(Boolean).join(' — ') : 'Sin novedad'; }]
            ], rondas.slice().sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; }), 'Sin marcaciones de ronda hoy.');
          }) : null,
          kpi(pers.filter(function (p) { return p.Estado === 'Habilitado'; }).length, 'Personas habilitadas', 'badge', '', '/consola/personas')),
        h('div', { class: 'grid-2' },
          h('section', { class: 'card' }, h('h3', null, 'Alertas'),
            alertas.length ? h('ul', { class: 'alerts' }, alertas.slice(0, 40).map(function (a) { return h('li', { class: a[1] }, AP.icon(a[0], 18), h('span', null, a[2])); }))
              : h('p', { class: 'muted' }, 'Sin alertas.')),
          h('section', { class: 'card' }, h('h3', null, 'Dentro de las instalaciones'),
            Object.keys(cats).length ? h('ul', { class: 'cats' }, Object.keys(cats).map(function (c) { return h('li', null, h('span', null, c), h('strong', null, String(cats[c]))); })) : h('p', { class: 'muted' }, 'Nadie registrado dentro.'),
            h('h3', { class: 'mt' }, 'Ingresos por hora (hoy)'), chart)),
        h('section', { class: 'card' }, h('div', { class: 'row between wrap gap' }, h('h3', null, 'Actividad reciente'),
          h('a', { class: 'btn small', href: '#/consola/historial' }, AP.icon('search', 16), 'Buscar y descargar en Ingresos y salidas')),
          table([
            { label: 'Hora', render: function (m) { return U.fDateTime(m.FechaHora); } },
            { label: 'Nombre', key: 'Title' },
            { label: 'Categoría', key: 'Categoria' },
            { label: 'Movimiento', render: function (m) { return m.Resultado === 'Negado' ? AP.pill('Negado', 'deny') : AP.pill(m.Sentido, m.Sentido === 'Ingreso' ? 'ok' : 'muted'); } },
            { label: 'Placa', key: 'Placa' },
            { label: 'Vigilante', key: 'Vigilante' },
            { label: '', render: function (m) { return [m.Excepcion ? AP.pill('Excepción', 'warn') : null, m.SinConexion ? AP.pill('Sin conexión', 'muted') : null, m._pendiente ? AP.pill('Pendiente', 'warn') : null]; } }
          ], recientes, { size: 12 })));
    });
    var t = setInterval(function () { if (document.visibilityState === 'visible' && location.hash === '#/consola/panel') AP.render(); }, 120000);
    AP.onLeave(function () { clearInterval(t); });
  });

  // =================== PERSONAS ===================
  AP.route('/consola/personas', function () {
    if (!guard()) return;
    var content = h('div', { class: 'stack' });
    var personas = [];
    var sel = new Set();
    var q = AP.input('q', '', { type: 'search', placeholder: 'Buscar por nombre, documento, empresa, placa o uniforme' });
    var fTipo = AP.select('tipo', [['', 'Todos los tipos']].concat(AP.CAT.tiposPersona), '');
    var fEst = AP.select('estado', [['', 'Todos los estados'], 'Habilitado', 'Inhabilitado', ['vencido', 'Habilitación vencida'], ['alerta', 'Con alerta de salida']], '');
    var fTP = AP.select('tipoPersonal', [['', 'Toda clase de personal']].concat(AP.CAT.tiposPersonal, [['sin', 'Personal propio sin clase']]), '');
    var fEmp = AP.select('empresa', [['', 'Todas las empresas']], '');
    var fJefe = AP.select('jefe', [['', 'Cualquier jefe inmediato']], '');
    var empresas = [], cargos = [];
    var tbl = null;
    var ED = AP.Session.can('editar');
    var actions = ED ? [
      h('button', { class: 'btn primary', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Nueva persona'),
      h('button', { class: 'btn', type: 'button', onclick: function () { AP.cargaMasiva(function () { AP.render(); }); } }, AP.icon('upload', 18), 'Carga masiva'),
      h('button', { class: 'btn', type: 'button', onclick: fotosLote }, AP.icon('camera', 18), 'Fotos en lote')
    ] : [AP.pill('Solo consulta', 'muted')];
    AP.consolaShell('/consola/personas', 'Personas habilitadas', content, actions);

    function filtrar() {
      var t = U.fold(q.value), d = U.normDoc(q.value), hoy = U.ymd();
      return personas.filter(function (p) {
        if (fTipo.value && p.Tipo !== fTipo.value) return false;
        if (fEst.value === 'vencido') { if (!(p.Estado === 'Habilitado' && p.VigenciaHasta && p.VigenciaHasta < hoy)) return false; }
        else if (fEst.value === 'alerta') { if (!p.AlertaSalida) return false; }
        else if (fEst.value && p.Estado !== fEst.value) return false;
        if (fTP.value === 'sin') { if (!(p.Tipo === 'Personal propio' && !p.TipoPersonal)) return false; }
        else if (fTP.value && p.TipoPersonal !== fTP.value) return false;
        if (fEmp.value === 'sin') { if (p.EmpresaId) return false; }
        else if (fEmp.value && p.EmpresaId !== fEmp.value) return false;
        if (fJefe.value === 'sin') { if (p.JefeId) return false; }
        else if (fJefe.value && p.JefeId !== fJefe.value) return false;
        if (!t) return true;
        // Solo los datos de la persona (no el nombre de su jefe inmediato: para eso está el filtro «jefe inmediato»)
        return U.fold([p.Title, p.Empresa, p.Cargo, p.Area, p.Placa, p.NumUniforme].join(' ')).indexOf(t) >= 0 || (d && U.normDoc(p.NumDoc).indexOf(d) >= 0);
      }).sort(function (a, b) { return U.fold(a.Title) < U.fold(b.Title) ? -1 : 1; });
    }
    // Nombre vigente del jefe inmediato (si cambió su nombre en su ficha, se muestra el actual)
    function jefeNombre(p) {
      if (!p.JefeId) return '';
      var j = personas.find(function (x) { return x.id === p.JefeId; });
      return j ? j.Title : (p.JefeNombre || '');
    }
    function opcionesFiltros() {
      var emps = {};
      personas.forEach(function (p) { if (p.EmpresaId) emps[p.EmpresaId] = (empresas.find(function (e) { return e.id === p.EmpresaId; }) || {}).Title || p.Empresa || p.EmpresaId; });
      var jefes = {};
      personas.forEach(function (p) { if (p.JefeId) jefes[p.JefeId] = jefeNombre(p) || p.JefeId; });
      var orden = function (o) { return Object.keys(o).sort(function (a, b) { return U.fold(o[a]) < U.fold(o[b]) ? -1 : 1; }).map(function (k) { return [k, o[k]]; }); };
      [[fEmp, 'Todas las empresas', 'Sin empresa vinculada', emps], [fJefe, 'Cualquier jefe inmediato', 'Sin jefe inmediato', jefes]].forEach(function (x) {
        var v = x[0].value;
        x[0].replaceChildren.apply(x[0], [['', x[1]], ['sin', x[2]]].concat(orden(x[3])).map(function (o) { return h('option', { value: o[0] }, o[1]); }));
        x[0].value = v;
      });
    }

    // Carga diferida de fotos de la página visible
    var fotoCache = {};
    async function fotosPagina(rows) {
      var faltan = rows.filter(function (p) { return !(p.id in fotoCache); }).map(function (p) { return p.id; });
      if (!faltan.length) return;
      faltan.forEach(function (id) { fotoCache[id] = null; });
      try {
        var f = await AP.B.getFields('AP_Personas', faltan, ['Foto']);
        Object.keys(f).forEach(function (id) { fotoCache[id] = f[id].Foto || ''; });
        document.querySelectorAll('img[data-pid]').forEach(function (img) { var v = fotoCache[img.dataset.pid]; if (v) img.src = v; });
      } catch (e) { /* las fotos son opcionales en el listado */ }
    }

    function render() {
      var rows = filtrar();
      var hoy = U.ymd();
      var cols = [
        ED ? { label: '', cls: 'w-check', render: function (p) { var c = h('input', { type: 'checkbox', checked: sel.has(p.id), 'aria-label': 'Seleccionar ' + p.Title }); c.addEventListener('change', function () { c.checked ? sel.add(p.id) : sel.delete(p.id); selInfo(); }); return c; } } : null,
        { label: '', cls: 'w-photo', render: function (p) { return h('img', { class: 'photo xs', src: fotoCache[p.id] || U.avatar(p.Title), alt: '', dataset: { pid: p.id } }); } },
        { label: 'Nombre', render: function (p) { return h('div', null, h('strong', null, p.Title), h('small', { class: 'block muted' }, (p.TipoDoc || '') + ' ' + (p.NumDoc || '') + (p.NumUniforme ? ' · Uniforme ' + p.NumUniforme : ''))); } },
        { label: 'Tipo', render: function (p) { return h('div', null, p.Tipo || '', p.TipoPersonal ? h('small', { class: 'block muted' }, p.TipoPersonal) : null); } },
        { label: 'Empresa / cargo', render: function (p) { return h('div', null, p.Empresa || '', !p.EmpresaId && p.Empresa ? h('small', { class: 'txt-warn' }, ' (sin vincular)') : null, h('small', { class: 'block muted' }, [p.Cargo, p.Area].filter(Boolean).join(' · ')), p.JefeId ? h('small', { class: 'block muted' }, 'Jefe: ' + jefeNombre(p)) : null); } },
        { label: 'Placa', key: 'Placa' },
        { label: 'Vigencia', render: function (p) { return p.VigenciaHasta ? h('span', { class: p.VigenciaHasta < hoy ? 'txt-deny' : '' }, p.VigenciaHasta) : '—'; } },
        { label: 'Estado', render: function (p) { return h('div', null, AP.estadoPill(p.Estado), p.AlertaSalida ? h('small', { class: 'block' }, AP.pill('Alerta de salida', 'warn')) : null); } },
        { label: '', cls: 'right', render: function (p) {
          if (!ED) return h('button', { class: 'btn small', type: 'button', title: 'Ver ficha', onclick: function () { editar(p); } }, AP.icon('eye', 16), 'Ver');
          return h('div', { class: 'row gap nowrap' },
            h('button', { class: 'btn small', type: 'button', title: 'Editar', onclick: function () { editar(p); } }, AP.icon('edit', 16)),
            h('button', { class: 'btn small ' + (p.Estado === 'Habilitado' ? 'danger-outline' : ''), type: 'button', onclick: function () { cambiarEstado(p); } },
              AP.icon(p.Estado === 'Habilitado' ? 'lock' : 'unlock', 16), p.Estado === 'Habilitado' ? 'Inhabilitar' : 'Habilitar'),
            h('button', { class: 'btn small' + (p.AlertaSalida ? ' warn-outline' : ''), type: 'button', title: p.AlertaSalida ? 'Quitar la alerta de salida' : 'Alerta de salida: avisarme cuando salga', onclick: function () { alertaSalida(p); } }, AP.icon('bell', 16)),
            h('button', { class: 'btn small', type: 'button', title: 'Credencial QR', onclick: function () { credencial(p); } }, AP.icon('qr', 16)),
            AP.Session.can('admin') ? h('button', { class: 'btn small danger-outline', type: 'button', title: 'Borrar registro', onclick: function (e) { e.stopPropagation(); borrarPersona(p); } }, AP.icon('trash', 16)) : null);
        } }
      ].filter(Boolean);
      if (!tbl) tbl = table(cols, rows, { onRow: editar, afterPaint: fotosPagina, rowClass: function (p) { return p.Estado !== 'Habilitado' ? 'row-deny' : ''; } });
      else tbl.repaint(rows);
      return tbl;
    }
    var selBox = h('div', { class: 'row gap wrap' });
    function selInfo() {
      selBox.replaceChildren();
      var n = sel.size;
      if (!ED) {
        AP.add(selBox, h('button', { class: 'btn small', type: 'button', onclick: function () { exportarPersonas(filtrar()); } }, AP.icon('download', 16), 'Exportar listado'));
        return;
      }
      AP.add(selBox, h('span', { class: 'muted' }, n ? n + ' seleccionada(s)' : 'Seleccione personas para imprimir carnés'),
        h('button', { class: 'btn small', type: 'button', disabled: !n, onclick: function () {
          var ids = Array.from(sel);
          imprimirCarnes(personas.filter(function (p) { return ids.indexOf(p.id) >= 0; }));
        } }, AP.icon('print', 16), 'Imprimir carnés'),
        h('button', { class: 'btn small', type: 'button', onclick: function () { filtrar().forEach(function (p) { sel.add(p.id); }); AP.render.personasRepaint(); } }, 'Seleccionar todo lo filtrado'),
        n ? h('button', { class: 'btn small ghost', type: 'button', onclick: function () { sel.clear(); AP.render.personasRepaint(); } }, 'Quitar selección') : null,
        h('button', { class: 'btn small', type: 'button', onclick: function () { exportarPersonas(filtrar()); } }, AP.icon('download', 16), 'Exportar listado'),
        h('button', { class: 'btn small', type: 'button', onclick: AP.plantillaPersonas }, AP.icon('file', 16), 'Plantilla de carga'));
    }
    AP.render.personasRepaint = function () { selInfo(); tbl && tbl.repaint(filtrar()); };

    [q, fTipo, fEst, fTP, fEmp, fJefe].forEach(function (el) { el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', U.debounce(function () { tbl.repaint(filtrar()); }, 150)); });

    load(content, async function () {
      var r = await Promise.all([AP.B.listAll('AP_Personas', { exclude: ['Foto'] }), AP.Maestros.empresas(true).catch(function () { return []; }), AP.Maestros.cargos(true).catch(function () { return []; })]);
      personas = r[0]; empresas = r[1]; cargos = r[2];
      opcionesFiltros();
      var sinEmp = personas.filter(function (p) { return !p.EmpresaId; }).length;
      content.replaceChildren(
        ED && !empresas.length ? h('p', { class: 'banner warn' }, AP.icon('building', 18), h('span', null, 'Aún no hay empresas registradas. Para crear personas, registre primero las empresas (personas jurídicas) en ', h('a', { href: '#/consola/empresas' }, 'Empresas'), ' y los cargos en ', h('a', { href: '#/consola/cargos' }, 'Cargos'), '.')) : null,
        ED && empresas.length && sinEmp ? h('p', { class: 'banner info' }, AP.icon('building', 18), h('span', null, sinEmp + ' persona(s) sin empresa vinculada (filtre por «Sin empresa vinculada»). Puede vincularlas desde la ficha de cada empresa con «Vincular personas con este nombre».')) : null,
        h('div', { class: 'filters' }, q, fTipo, fTP, fEmp, fJefe, fEst), selBox, render());
      selInfo();
    });

    async function cambiarEstado(p) {
      var habil = p.Estado !== 'Habilitado';
      AP.modal({
        title: (habil ? 'Habilitar a ' : 'Inhabilitar a ') + p.Title,
        body: function (close) {
          var mot = AP.textarea('motivo', '', { placeholder: habil ? 'Motivo de la habilitación (opcional)' : 'Motivo de la inhabilitación (obligatorio). Se mostrará al vigilante.' });
          return h('div', { class: 'stack' },
            habil ? null : h('p', { class: 'note' }, 'El cambio se aplica de inmediato en los celulares conectados. Los que estén sin conexión lo recibirán al sincronizar; si es urgente, avise también al supervisor de portería.'),
            AP.field('Motivo', mot),
            h('button', { class: 'btn block ' + (habil ? 'primary' : 'danger'), type: 'button', onclick: async function () {
              if (!habil && mot.value.trim().length < 5) return AP.toast('Indique el motivo.', 'warn');
              try {
                await AP.B.update('AP_Personas', p.id, { Estado: habil ? 'Habilitado' : 'Inhabilitado', MotivoEstado: mot.value.trim() });
                await AP.Audit.log(habil ? 'Habilitación' : 'Inhabilitación', p.Title + ' (' + (p.NumDoc || '') + ')', mot.value.trim());
                p.Estado = habil ? 'Habilitado' : 'Inhabilitado'; p.MotivoEstado = mot.value.trim();
                close(); AP.toast(p.Title + (habil ? ' habilitado.' : ' inhabilitado.'));
                tbl.repaint(filtrar());
                AP.Sync.run();
              } catch (e) { AP.toast(e.message, 'error'); }
            } }, habil ? 'Habilitar' : 'Inhabilitar'));
        }
      });
    }

    // Alerta de salida: la salida no se impide (arts. 24 y 28 C.P.); el vigilante la registra y el Director recibe el aviso
    function alertaSalida(p) {
      var activa = !!p.AlertaSalida;
      AP.modal({
        title: (activa ? 'Quitar la alerta de salida de ' : 'Alerta de salida — ') + p.Title,
        body: function (close) {
          var mot = AP.input('motivo', p.MotivoAlertaSalida || '', { placeholder: 'Motivo breve: lo ve el vigilante. Escriba solo lo necesario, sin datos sensibles.' });
          return h('div', { class: 'stack' },
            h('p', { class: 'note' }, activa ? 'Al quitarla, la portería registra sus salidas sin aviso.'
              : 'Cuando esta persona salga, el vigilante registra la salida normalmente y se le avisa a usted de inmediato (en la consola y por WhatsApp desde portería). La salida NO se impide: nadie puede ser retenido por el personal de vigilancia (arts. 24 y 28 de la Constitución). Para impedir el INGRESO use «Inhabilitar».'),
            activa ? null : AP.field('Motivo *', mot),
            h('button', { class: 'btn block ' + (activa ? '' : 'primary'), type: 'button', onclick: async function () {
              if (!activa && mot.value.trim().length < 4) return AP.toast('Indique el motivo.', 'warn');
              try {
                var d = activa ? { AlertaSalida: false, MotivoAlertaSalida: '' } : { AlertaSalida: true, MotivoAlertaSalida: mot.value.trim() };
                await AP.B.update('AP_Personas', p.id, d);
                await AP.Audit.log(activa ? 'Retiro de alerta de salida' : 'Alerta de salida', p.Title + ' (' + (p.NumDoc || '') + ')', d.MotivoAlertaSalida || '');
                Object.assign(p, d); close(); AP.toast(activa ? 'Alerta de salida retirada.' : 'Alerta de salida activada.');
                tbl.repaint(filtrar()); AP.Sync.run();
              } catch (e) { AP.toast(e.message, 'error'); }
            } }, activa ? 'Quitar alerta' : 'Activar alerta de salida'));
        }
      });
    }

    async function editar(p) {
      var nuevo = !p;
      if (nuevo && ED && !empresas.length) return AP.toast('Registre primero la empresa (persona jurídica) en «Empresas»: toda persona se vincula a una empresa ya creada.', 'warn', 8000);
      var propia = AP.Maestros.propia(empresas);
      var full = p ? Object.assign({}, p) : { Tipo: 'Personal propio', TipoDoc: 'CC', Estado: 'Habilitado', EmpresaId: propia ? propia.id : '', Empresa: propia ? propia.Title : '' };
      if (p) {
        try { var ff = await AP.B.getFields('AP_Personas', [p.id], ['Foto', 'Observaciones']); Object.assign(full, ff[p.id] || {}); } catch (e) { /* sin foto */ }
      }
      var foto = full.Foto || '';
      AP.modal({
        title: nuevo ? 'Nueva persona' : full.Title + (ED ? '' : ' (solo consulta)'),
        size: 'wide',
        body: function (close) {
          var I = AP.input;
          var img = h('img', { class: 'photo big', src: foto || U.avatar(full.Title || '?'), alt: 'Fotografía' });
          var fotoBtns = h('div', { class: 'row gap wrap center' },
            h('button', { class: 'btn small', type: 'button', onclick: async function () {
              var f = await AP.pickImage(U.isMobile() ? 'user' : null); if (!f) return;
              try { foto = await U.personPhoto(f); img.src = foto; } catch (e) { AP.toast(e.message, 'error'); }
            } }, AP.icon('camera', 16), 'Tomar / cargar foto'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: function () { foto = ''; img.src = U.avatar(full.Title || '?'); } }, 'Quitar'));
          // Empresa y cargo: se eligen de las listas que administra el Director (Empresas y Cargos)
          var optsEmp = [['', '— Seleccione la empresa —']].concat(empresas.filter(function (e) { return e.Activo !== false || e.id === full.EmpresaId; })
            .map(function (e) { return [e.id, e.Title + (e.NIT ? ' — NIT ' + e.NIT : '') + (e.Activo === false ? ' (inactiva)' : '')]; }));
          var legEmp = !full.EmpresaId && !!full.Empresa, legCar = !full.CargoId && !!full.Cargo;
          if (legEmp) optsEmp.splice(1, 0, ['__legado', 'Sin vincular: «' + full.Empresa + '» (elija la empresa registrada)']);
          var selEmp = AP.select('EmpresaId', optsEmp, legEmp ? '__legado' : (full.EmpresaId || ''));
          var optsCar = [['', '— Sin cargo —']].concat(cargos.filter(function (c) { return c.Activo !== false || c.id === full.CargoId; })
            .map(function (c) { return [c.id, c.Title + (c.Area ? ' · ' + c.Area : '') + (c.Activo === false ? ' (inactivo)' : '')]; }));
          if (legCar) optsCar.splice(1, 0, ['__legado', 'Sin vincular: «' + full.Cargo + '» (elija el cargo del catálogo)']);
          var selCar = AP.select('CargoId', optsCar, legCar ? '__legado' : (full.CargoId || ''));
          var areaIn = I('Area', full.Area), claseSel = AP.select('TipoPersonal', [['', '— No aplica / sin clase —']].concat(AP.CAT.tiposPersonal), full.TipoPersonal || '');
          selCar.addEventListener('change', function () {
            var c = cargos.find(function (x) { return x.id === selCar.value; });
            if (!c) return;
            if (c.Area && !areaIn.value.trim()) areaIn.value = c.Area;
            if (c.TipoPersonal && !claseSel.value) claseSel.value = c.TipoPersonal;
          });
          // Jefe inmediato (para cualquier tipo de persona): persona registrada del personal propio. El Jefe de Producción ve y
          // programa a quienes lo tienen como jefe.
          var jefe0 = full.JefeId ? personas.find(function (x) { return x.id === full.JefeId; }) || { id: full.JefeId, Title: full.JefeNombre || 'Jefe registrado' } : null;
          var jefePick = AP.personaPicker({
            fuente: function () { return Promise.resolve(personas); },
            filtro: function (x) { return x.Tipo === 'Personal propio' && x.Estado === 'Habilitado' && (!p || x.id !== p.id); },
            valor: jefe0, quitar: 'Cambiar o quitar', placeholder: 'Buscar al jefe inmediato (nombre, documento o cargo)', fijo: !ED,
            vacio: 'No aparece en el personal propio habilitado.',
            detalle: function (x) { var u = (AP.Sync.vigilantes || []).find(function (v) { return v.PersonaId === x.id && v.Activo !== false; }); return [x.Cargo, x.Area, u ? 'Usuario: ' + u.Rol : ''].filter(Boolean).join(' · '); }
          });
          var form = h('div', { class: 'form-grid' },
            AP.field('Nombres y apellidos *', I('Title', full.Title)),
            AP.field('Tipo *', AP.select('Tipo', AP.CAT.tiposPersona, full.Tipo)),
            AP.field('Tipo de documento', AP.select('TipoDoc', AP.CAT.tiposDoc, full.TipoDoc)),
            AP.field('Número de documento *', I('NumDoc', full.NumDoc, { inputmode: 'numeric' })),
            AP.field('Empresa (persona jurídica) *', selEmp, ED ? h('span', null, 'Se administran en ', h('a', { href: '#/consola/empresas' }, 'Empresas'), '.') : null),
            AP.field('Cargo', selCar, ED ? h('span', null, 'Se administran en ', h('a', { href: '#/consola/cargos' }, 'Cargos'), '.') : null),
            AP.field('Área', areaIn),
            AP.field('Teléfono', I('Telefono', full.Telefono, { inputmode: 'tel' })),
            AP.field('Correo (para enviarle su QR)', I('Correo', full.Correo, { type: 'email' })),
            AP.field('Vigente hasta', I('VigenciaHasta', full.VigenciaHasta, { type: 'date' }), 'Contratistas: fecha hasta la cual está verificada la seguridad social.'),
            AP.field('Placa(s) de vehículo', I('Placa', full.Placa, { autocapitalize: 'characters' }), 'Separe varias con coma.'),
            AP.field('Tipo de vehículo', AP.select('VehiculoTipo', AP.CAT.vehiculos, full.VehiculoTipo)),
            AP.field('Clase de personal', claseSel, 'Personal propio. Talento Humano ve en planta a los operarios y al personal operativo.'),
            AP.field('Número de uniforme', I('NumUniforme', full.NumUniforme, { maxlength: 20 }), 'También lo pueden actualizar el jefe inmediato y Talento Humano.'),
            AP.field('Jefe inmediato', jefePick, 'Para cualquier tipo de persona (también contratistas). El Jefe de Producción ve, consulta y programa a quienes lo tienen como jefe inmediato, y Talento Humano los incluye en su consulta.', 'span2'),
            AP.field('Estado', AP.select('Estado', ['Habilitado', 'Inhabilitado'], full.Estado)),
            AP.field('Motivo del estado', I('MotivoEstado', full.MotivoEstado)),
            h('div', { class: 'field span2 stack sm' },
              AP.check('AutorizaDatos', 'Existe autorización firmada de tratamiento de datos (versión ' + AP.CFG.versionAutorizacion + ')', full.AutorizaDatos),
              AP.check('AutorizaFoto', 'Autorizó el uso de su fotografía para el cotejo visual en portería', full.AutorizaFoto)),
            AP.field('Observaciones', AP.textarea('Observaciones', full.Observaciones), null, 'span2'));
          var qrBox = h('div', { class: 'qr-mini' });
          if (full.Token) AP.add(qrBox, h('div', { class: 'qr', html: U.qrSvg(U.qrPayload(full.Token), 4, 2) }), h('small', { class: 'muted' }, 'Credencial vigente'));
          if (!ED) {
            // Solo consulta: la ficha se muestra sin posibilidad de cambio
            form.querySelectorAll('input,select,textarea').forEach(function (el) { el.disabled = true; });
            return h('div', { class: 'edit-person' },
              h('div', { class: 'edit-side' }, img, h('p', { class: 'help' }, 'Solo consulta.')),
              h('div', { class: 'stack' }, form,
                h('div', { class: 'row gap wrap end' },
                  full.Tipo === 'Personal propio' ? h('button', { class: 'btn', type: 'button', onclick: function () { visitasRecibidas(p); } }, AP.icon('user', 18), 'Visitas recibidas') : null,
                  h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cerrar'))));
          }
          var save = async function () {
            var d = AP.formData(form);
            if (d.Title.length < 5 || !d.NumDoc) return AP.toast('Nombre y número de documento son obligatorios.', 'warn');
            // Empresa, cargo y jefe inmediato vinculados (se guarda también el nombre, para consultas y registros)
            var emp = empresas.find(function (e) { return e.id === d.EmpresaId; });
            if (d.EmpresaId === '__legado') delete d.EmpresaId;   // conserva el nombre escrito antes (sin vínculo)
            else if (!emp) return AP.toast('Seleccione la empresa (persona jurídica) a la que pertenece la persona. Si no está, créela en «Empresas».', 'warn', 8000);
            else d.Empresa = emp.Title;
            var car = cargos.find(function (c) { return c.id === d.CargoId; });
            if (d.CargoId === '__legado') delete d.CargoId;
            else if (car) d.Cargo = car.Title;
            else { d.CargoId = ''; d.Cargo = ''; }
            var jf = jefePick.valor();
            d.JefeId = jf ? jf.id : ''; d.JefeNombre = jf ? jf.Title : '';
            if (d.Tipo !== 'Personal propio') { d.TipoPersonal = ''; }
            // Ámbito de Talento Humano: personal propio o con jefe inmediato asignado
            d.AmbitoTH = d.Tipo === 'Personal propio' || !!d.JefeId;
            d.NumUniforme = String(d.NumUniforme || '').trim().slice(0, 20);
            if (foto && !d.AutorizaFoto) return AP.toast('Para guardar la fotografía debe constar la autorización de su uso. Márquela o quite la foto.', 'warn', 7000);
            var dup = personas.find(function (x) { return U.normDoc(x.NumDoc) === U.normDoc(d.NumDoc) && (!p || x.id !== p.id); });
            if (dup) return AP.toast('Ya existe una persona con ese documento: ' + dup.Title, 'warn');
            d.Placa = String(d.Placa || '').split(',').map(U.normPlaca).filter(Boolean).join(', ');
            d.Foto = foto;
            if (d.AutorizaDatos && !full.AutorizaDatos) { d.FechaAutorizacion = U.ymd(); d.VersionAutorizacion = AP.CFG.versionAutorizacion; }
            try {
              if (nuevo) {
                d.Token = U.newToken();
                var rec = await AP.B.create('AP_Personas', d);
                personas.push(Object.assign({}, rec, { Foto: undefined }));
                fotoCache[rec.id] = foto;
                await AP.Audit.log('Alta de persona', d.Title + ' (' + d.NumDoc + ')', 'Tipo: ' + d.Tipo + '; estado: ' + d.Estado);
              } else {
                await AP.B.update('AP_Personas', p.id, d);
                var cambios = Object.keys(d).filter(function (k) { return k !== 'Foto' && String(d[k] || '') !== String(full[k] || ''); });
                if (foto !== (full.Foto || '')) cambios.push('Foto');
                Object.assign(p, d, { Foto: undefined });
                fotoCache[p.id] = foto;
                await AP.Audit.log('Modificación de persona', d.Title + ' (' + d.NumDoc + ')', 'Campos: ' + cambios.join(', '));
                if ((full.JefeId || '') !== d.JefeId || (full.Tipo || '') !== d.Tipo) {
                  try { await moverAlNuevoJefe(p, full.JefeId || '', d.JefeId); }
                  catch (e) { AP.toast('Se guardó la persona, pero no se pudieron actualizar sus permisos, ausencias u horarios vigentes: ' + e.message, 'warn', 10000); }
                }
              }
              close(); AP.toast('Guardado.');
              tbl.repaint(filtrar());
              AP.Sync.run();
            } catch (e) { AP.toast(e.message, 'error'); }
          };
          return h('div', { class: 'edit-person' },
            h('div', { class: 'edit-side' }, img, fotoBtns, h('p', { class: 'help' }, 'Foto de baja resolución, solo para cotejo visual.'), qrBox),
            h('div', { class: 'stack' }, form,
              h('div', { class: 'row gap wrap end' },
                !nuevo && full.Tipo === 'Personal propio' ? h('button', { class: 'btn', type: 'button', onclick: function () { visitasRecibidas(p); } }, AP.icon('user', 18), 'Visitas recibidas') : null,
                !nuevo ? h('button', { class: 'btn', type: 'button', onclick: function () { close(); credencial(p); } }, AP.icon('qr', 18), 'Credencial') : null,
                h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
                h('button', { class: 'btn primary', type: 'button', onclick: save }, AP.icon('check', 18), 'Guardar'))));
        }
      });
    }

    // Cambio de jefe inmediato (o de tipo de persona): los permisos y ausencias vigentes o futuros y los horarios fijos
    // asignados por el jefe anterior pasan al nuevo jefe (o quedan a cargo del Director si ya no tiene jefe), para que
    // el nuevo jefe los vea y la portería los siga aplicando. Lo pasado no se modifica.
    async function moverAlNuevoJefe(p, antes, ahora) {
      var hoyIso = new Date().toISOString(), amb = p.Tipo === 'Personal propio' || !!ahora, n = 0;
      var r = await Promise.all([AP.B.consulta('AP_Permisos', [['Token', '==', p.Token]]), AP.B.consulta('AP_Ausencias', [['Token', '==', p.Token]]), AP.B.consulta('AP_Horarios', [['Token', '==', p.Token]])]);
      var perm = r[0].filter(function (x) { return AP.permisoActivo(x) && x.Hasta >= hoyIso && ((x.JefeId || '') !== ahora || !!x.AmbitoTH !== amb); });
      for (var i = 0; i < perm.length; i++) {
        await AP.B.update('AP_Permisos', perm[i].id, { JefeId: ahora, AmbitoTH: amb, PersonaId: p.id, PersonaTipo: p.Tipo, Mes: perm[i].Mes || U.ymd(perm[i].Desde).slice(0, 7) }); n++;
      }
      var aus = r[1].filter(function (x) { return x.Estado !== 'Anulada' && x.Hasta >= hoyIso && (x.JefeId || '') !== ahora; });
      for (var j = 0; j < aus.length; j++) { await AP.B.update('AP_Ausencias', aus[j].id, { JefeId: ahora }); n++; }
      var hor = r[2].filter(function (x) { return x.JefeId && x.JefeId === antes && x.JefeId !== ahora; });
      for (var k = 0; k < hor.length; k++) { await AP.B.update('AP_Horarios', hor[k].id, { JefeId: ahora, PersonaId: p.id }); n++; }
      if (n) await AP.Audit.log('Cambio de jefe inmediato', p.Title + ' (' + (p.NumDoc || '') + ')', perm.length + ' permiso(s), ' + aus.length + ' ausencia(s) y ' + hor.length + ' horario(s) fijo(s) actualizados al nuevo jefe inmediato.');
    }

    // Visitas en las que el colaborador figura como anfitrión (vínculo por identificador o por documento)
    async function visitasRecibidas(p) {
      var m = AP.modal({ title: 'Visitas recibidas por ' + p.Title, size: 'wide', body: AP.spinner('Consultando…') });
      try {
        var doc = U.normDoc(p.NumDoc);
        var l = (await AP.B.listRange('AP_Visitas', 'FechaFin', U.addDays(new Date(), -90), null, { exclude: ['Foto'] }))
          .filter(function (v) { return v.AnfitrionId === p.id || (doc && v.AnfitrionDoc && U.normDoc(v.AnfitrionDoc) === doc); })
          .sort(function (a, b) { return a.FechaInicio < b.FechaInicio ? 1 : -1; });
        var cuerpo = l.length ? h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
          h('thead', null, h('tr', null, ['Fecha', 'Visitante', 'Empresa', 'Motivo', 'Origen', 'Estado'].map(function (c) { return h('th', null, c); }))),
          h('tbody', null, l.map(function (v) {
            return h('tr', null, h('td', { 'data-label': 'Fecha' }, U.fDateTime(v.FechaInicio)), h('td', { 'data-label': 'Visitante' }, v.Title),
              h('td', { 'data-label': 'Empresa' }, v.Empresa || ''), h('td', { 'data-label': 'Motivo' }, v.Motivo || ''),
              h('td', { 'data-label': 'Origen' }, v.Origen === 'Portería' ? 'No anunciado (portería)' : 'Prerregistro'), h('td', { 'data-label': 'Estado' }, AP.estadoPill(v.Estado)));
          }))))
          : AP.empty('user', 'Sin visitas vinculadas', 'En los últimos 90 días no hay visitas en las que este colaborador figure como anfitrión.');
        m.el.querySelector('.modal-body').replaceChildren(h('div', { class: 'row between wrap gap' }, h('p', { class: 'muted small' }, 'Últimos 90 días · ' + l.length + ' visita(s).'),
          l.length ? AP.btnExcel(function () {
            exportar('Visitas_recibidas_' + p.Title, [['Fecha', function (v) { return U.toDate(v.FechaInicio); }, 17], ['Visitante', function (v) { return v.Title; }, 30], ['Documento', function (v) { return v.NumDoc; }, 15],
              ['Empresa', function (v) { return v.Empresa; }, 26], ['Motivo', function (v) { return v.Motivo; }, 34], ['Origen', function (v) { return v.Origen === 'Portería' ? 'No anunciado (portería)' : 'Prerregistro'; }, 20], ['Estado', function (v) { return v.Estado; }, 12]],
              l, 'xlsx', [['Anfitrión', p.Title + ' (' + (p.NumDoc || '') + ')'], ['Periodo', 'Últimos 90 días'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
          }) : null), cuerpo);
      } catch (e) { m.el.querySelector('.modal-body').replaceChildren(h('p', { class: 'note' }, e.message)); }
    }

    async function credencial(p) {
      AP.modal({
        title: 'Credencial de ' + p.Title,
        body: function (close) {
          var blobCredencial = null;
          var nombreArchivo = 'Credencial_' + U.safeName(p.Title) + '.png';
          AP.paseCanvas({ titulo: 'Credencial de acceso', nombre: p.Title, linea2: (p.TipoDoc || '') + ' ' + (p.NumDoc || ''), linea3: p.Cargo || undefined, linea4: [p.Tipo, p.Empresa].filter(Boolean).join(' · '), linea5: p.Area || undefined, token: p.Token, pie: 'Personal e intransferible' })
            .then(function (c) { return new Promise(function (r) { c.toBlob(r, 'image/png'); }); })
            .then(function (b) { blobCredencial = b; });
          var num = AP.waNum(p.Telefono);
          var textoWa = 'Señor(a) ' + p.Title + ': la Dirección de Seguridad Integral de ' + AP.CFG.empresa + ' le remite su credencial digital de acceso. Preséntela en portería junto con su documento de identidad. Es personal e intransferible.';
          var qr = h('div', { class: 'qr big', html: U.qrSvg(U.qrPayload(p.Token), 6, 3) });
          return h('div', { class: 'stack center' }, qr,
            h('p', { class: 'muted small' }, 'El código no contiene datos personales: es un identificador aleatorio que se valida contra la lista de personas habilitadas.'),
            h('div', { class: 'row gap wrap center' },
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); imprimirCarnes([p]); } }, AP.icon('print', 18), 'Imprimir carné'),
              h('button', { class: 'btn', type: 'button', onclick: function () {
                if (blobCredencial) U.download(blobCredencial, nombreArchivo);
              } }, AP.icon('download', 18), 'Descargar imagen'),
              num ? h('a', { class: 'btn primary', href: AP.waLink(num, textoWa), target: '_blank', rel: 'noopener', onclick: function () {
                if (blobCredencial) U.download(blobCredencial, nombreArchivo);
                AP.toast('Se descargó la imagen (' + nombreArchivo + ') y se abrió el chat de WhatsApp: adjúntela desde su galería/descargas y envíela.', 'info', 12000);
              } }, AP.icon('whatsapp', 18), 'Enviar por WhatsApp') : null,
              p.Correo ? h('button', { class: 'btn', type: 'button', onclick: async function () {
                try {
                  await AP.enviarCredencial(p);
                  AP.toast('Credencial enviada a ' + p.Correo);
                } catch (e) { AP.toast(e.message, 'error'); }
              } }, AP.icon('mail', 18), 'Enviar por correo') : null,
              h('button', { class: 'btn danger-outline', type: 'button', onclick: async function () {
                if (!(await AP.confirm('Regenerar credencial', 'El código actual dejará de funcionar (por pérdida, robo o reimpresión). Deberá entregar un nuevo carné o enviar el nuevo código.', 'Regenerar', 'danger'))) return;
                try {
                  var t = U.newToken();
                  await AP.B.update('AP_Personas', p.id, { Token: t });
                  await AP.Audit.log('Regeneración de credencial', p.Title + ' (' + p.NumDoc + ')', 'Credencial anterior revocada');
                  p.Token = t; close(); credencial(p); AP.Sync.run();
                } catch (e) { AP.toast(e.message, 'error'); }
              } }, AP.icon('sync', 18), 'Regenerar')));
        }
      });
    }

    async function fotosLote() {
      AP.modal({
        title: 'Cargar fotografías en lote',
        body: function (close) {
          var inp = h('input', { type: 'file', accept: 'image/*', multiple: true });
          var log = h('div', { class: 'log' });
          return h('div', { class: 'stack' },
            h('p', null, 'Nombre cada archivo con el número de documento de la persona (por ejemplo, ', h('code', null, '1000000101.jpg'), '). Solo se cargan para personas con autorización de fotografía.'),
            inp, log,
            h('button', { class: 'btn primary', type: 'button', onclick: async function () {
              var files = Array.from(inp.files || []);
              if (!files.length) return AP.toast('Seleccione los archivos.', 'warn');
              var ok = 0;
              for (var i = 0; i < files.length; i++) {
                var f = files[i];
                var doc = U.normDoc(f.name.replace(/\.[^.]+$/, ''));
                var p = personas.find(function (x) { return U.normDoc(x.NumDoc) === doc; });
                if (!p) { log.appendChild(h('div', { class: 'txt-deny' }, f.name + ': no existe persona con ese documento.')); continue; }
                if (!p.AutorizaFoto) { log.appendChild(h('div', { class: 'txt-warn' }, f.name + ': ' + p.Title + ' no tiene autorización de fotografía.')); continue; }
                try {
                  var data = await U.personPhoto(f);
                  await AP.B.update('AP_Personas', p.id, { Foto: data });
                  fotoCache[p.id] = data; ok++;
                  log.appendChild(h('div', null, f.name + ': ' + p.Title + ' ✓'));
                } catch (e) { log.appendChild(h('div', { class: 'txt-deny' }, f.name + ': ' + e.message)); }
              }
              await AP.Audit.log('Carga de fotografías', ok + ' fotografías', files.length + ' archivos procesados');
              AP.toast(ok + ' fotografías cargadas.');
              tbl.repaint(filtrar());
            } }, AP.icon('upload', 18), 'Cargar'));
        }
      });
    }

    async function borrarPersona(p) {
      var ok = await new Promise(function (res) {
        AP.modal({
          title: 'Borrar registro',
          body: function (close) {
            return h('div', { class: 'stack' },
              h('p', null, '¿Confirma el borrado definitivo de ', h('strong', null, p.Title), '? Esta acción no se puede deshacer.'),
              h('div', { class: 'row gap' },
                h('button', { class: 'btn danger', type: 'button', onclick: function () { res(true); close(); } }, AP.icon('trash', 16), 'Borrar definitivamente'),
                h('button', { class: 'btn ghost', type: 'button', onclick: function () { res(false); close(); } }, 'Cancelar')));
          },
          onClose: function () { res(false); }
        });
      });
      if (!ok) return;
      try {
        await AP.B.borrarFisico('AP_Personas', p.id);
        personas = personas.filter(function (x) { return x.id !== p.id; });
        AP.render.personasRepaint();
        AP.toast('Registro borrado.', 'ok');
      } catch (e) { AP.toast(e.message || 'No fue posible borrar el registro.', 'err'); }
    }

    function exportarPersonas(rows) {
      exportar('Personas', [
        ['Nombre', function (p) { return p.Title; }, 34], ['Tipo', function (p) { return p.Tipo; }, 18], ['Tipo doc.', function (p) { return p.TipoDoc; }, 8],
        ['Documento', function (p) { return p.NumDoc; }, 16], ['Empresa', function (p) { return p.Empresa; }, 28],
        ['NIT empresa', function (p) { var e = empresas.find(function (x) { return x.id === p.EmpresaId; }); return e ? e.NIT : (p.Empresa ? 'Sin vincular' : ''); }, 14],
        ['Cargo', function (p) { return p.Cargo; }, 22],
        ['Área', function (p) { return p.Area; }, 18], ['Teléfono', function (p) { return p.Telefono; }, 14], ['Placa', function (p) { return p.Placa; }, 12],
        ['Clase de personal', function (p) { return p.TipoPersonal; }, 16], ['Jefe inmediato', jefeNombre, 28], ['Número de uniforme', function (p) { return p.NumUniforme; }, 11],
        ['Vigente hasta', function (p) { return p.VigenciaHasta; }, 13], ['Estado', function (p) { return p.Estado; }, 12], ['Motivo estado', function (p) { return p.MotivoEstado; }, 30],
        ['Alerta de salida', function (p) { return p.AlertaSalida ? 'Sí — ' + (p.MotivoAlertaSalida || '') : 'No'; }, 22],
        ['Autoriza datos', function (p) { return U.yesNo(p.AutorizaDatos); }, 10], ['Autoriza foto', function (p) { return U.yesNo(p.AutorizaFoto); }, 10]
      ], rows, 'xlsx', [['Generado por', AP.Session.user.nombre + ' (' + AP.Session.user.upn + ')'], ['Fecha', U.fDateTime(new Date())],
        ['Filtro', [q.value, fTipo.value, fTP.value, fEmp.value ? AP.textoOpcion(fEmp) : '', fJefe.value ? AP.textoOpcion(fJefe) : '', fEst.value].filter(Boolean).join(' · ') || 'ninguno']]);
    }
  });

  // =================== IMPRESIÓN DE CARNÉS Y PASES ===================
  function imprimirCarnes(lista, tipo) {
    AP.State.print = { lista: lista, tipo: tipo || 'persona' };
    AP.go('/imprimir');
  }
  AP.imprimirCarnes = imprimirCarnes;

  AP.route('/imprimir', function () {
    var st = AP.State.print;
    if (!st || !st.lista || !st.lista.length) return AP.go('/consola/personas');
    var cards = h('div', { class: 'print-sheet' });
    var page = h('div', { class: 'print-page' },
      h('div', { class: 'no-print row gap wrap between print-bar' },
        h('div', null, h('strong', null, st.lista.length + ' credencial(es)'), h('small', { class: 'block muted' }, 'Tamaño tarjeta (85,6 × 54 mm). Use papel grueso o impresora de carnés; recorte por las líneas.')),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn', type: 'button', onclick: function () { history.back(); } }, AP.icon('back', 18), 'Volver'),
          AP.CFG.sinImpresion ? null : h('button', { class: 'btn primary', type: 'button', onclick: function () { window.print(); } }, AP.icon('print', 18), 'Imprimir'))),
      AP.CFG.sinImpresion ? h('p', { class: 'note no-print' }, 'En esta vista de demostración no se puede abrir el diálogo de impresión. En la aplicación instalada este botón imprime las credenciales.') : null,
      cards);
    AP.mount(page, 'is-print');
    (async function () {
      var lista = st.lista;
      if (st.tipo === 'persona') {
        try {
          var f = await AP.B.getFields('AP_Personas', lista.map(function (p) { return p.id; }), ['Foto']);
          lista = lista.map(function (p) { return Object.assign({}, p, { Foto: (f[p.id] || {}).Foto || p.Foto }); });
        } catch (e) { /* sin fotos */ }
      }
      lista.forEach(function (p) {
        var vis = st.tipo === 'visita';
        cards.appendChild(h('div', { class: 'id-card' + (vis ? ' visit' : '') },
          h('div', { class: 'id-head' }, h('img', { src: 'img/logo-informe.png', alt: 'Avo Pak' }), h('span', null, vis ? 'PASE DE VISITANTE' : 'CREDENCIAL DE ACCESO')),
          h('div', { class: 'id-body' },
            vis ? null : h('img', { class: 'id-photo', src: p.Foto || U.avatar(p.Title), alt: '' }),
            h('div', { class: 'id-data' },
              h('strong', null, p.Title),
              h('span', null, (p.TipoDoc || '') + ' ' + (p.NumDoc || '')),
              !vis && p.Cargo ? h('span', null, p.Cargo) : null,
              vis && p.Empresa ? h('span', null, p.Empresa) : null,
              h('span', null, vis ? U.fDateTime(p.FechaInicio) + ' – ' + U.fTime(p.FechaFin) : (p.Tipo || '')),
              h('span', null, vis ? 'Visita a: ' + [p.Anfitrion, p.Area].filter(Boolean).join(' · ') : (p.Empresa || '')),
              !vis && p.Area ? h('span', { class: 'muted' }, p.Area) : null,
              !vis && p.VigenciaHasta ? h('span', { class: 'id-vig' }, 'Vigente hasta ' + p.VigenciaHasta) : null),
            h('div', { class: 'id-qr', html: U.qrSvg(U.qrPayload(p.Token), 3, 2) })),
          h('div', { class: 'id-foot' }, vis ? 'Debe permanecer acompañado · Devolver al salir' : 'Personal e intransferible · ' + AP.CFG.empresa)));
      });
    })();
  });

  // Imagen del pase (para correo, descarga o WhatsApp)
  AP.paseCanvas = async function (o) {
    var W = 720, H = 1220;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#587e50'; x.fillRect(0, 0, W, 150);
    try {
      // Logo completo y proporcional dentro de la franja verde (sin recortes)
      var logo = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = 'img/logo-informe.png'; });
      var caja = 122, k = Math.min(caja / logo.width, caja / logo.height), lw = logo.width * k, lh = logo.height * k;
      x.fillStyle = '#ffffff';
      if (x.roundRect) { x.beginPath(); x.roundRect(30, 14, caja, caja, 12); x.fill(); } else x.fillRect(30, 14, caja, caja);
      x.drawImage(logo, 30 + (caja - lw) / 2, 14 + (caja - lh) / 2, lw, lh);
    } catch (e) { /* sin logo */ }
    x.fillStyle = '#ffffff'; x.font = '700 30px system-ui, Arial'; x.textAlign = 'right';
    x.fillText(o.titulo.toUpperCase(), W - 36, 86);
    x.fillStyle = '#dfd57c'; x.fillRect(0, 150, W, 8);
    var q = U.qrCanvas(U.qrPayload(o.token), 520);
    x.drawImage(q, (W - q.width) / 2, 190);
    var y = 190 + q.height + 50;
    x.textAlign = 'center'; x.fillStyle = '#22261c';
    x.font = '700 34px system-ui, Arial'; y += wrap(o.nombre, y, 40); y += 48;
    x.font = '400 26px system-ui, Arial'; x.fillStyle = '#444';
    [o.linea2, o.linea3, o.linea4, o.linea5].forEach(function (l) { if (l) { y += wrap(l, y, 32); y += 40; } });
    x.fillStyle = '#587e50'; x.fillRect(0, H - 70, W, 70);
    x.fillStyle = '#fff'; x.font = '600 22px system-ui, Arial'; x.fillText(o.pie || '', W / 2, H - 28);
    // Ajusta el texto a dos líneas como máximo; devuelve el alto adicional usado
    function wrap(t, yy, lh) {
      var words = String(t).split(' '), lines = [], cur = '';
      words.forEach(function (w) { var test = cur ? cur + ' ' + w : w; if (x.measureText(test).width > W - 70 && cur) { lines.push(cur); cur = w; } else cur = test; });
      if (cur) lines.push(cur);
      if (lines.length > 2) { lines = lines.slice(0, 2); while (x.measureText(lines[1] + '…').width > W - 70 && lines[1].length > 3) lines[1] = lines[1].slice(0, -1); lines[1] += '…'; }
      lines.forEach(function (l, i) { x.fillText(l, W / 2, yy + i * lh); });
      return (lines.length - 1) * lh;
    }
    return c;
  };

  AP.enviarCredencial = async function (p) {
    var c = await AP.paseCanvas({ titulo: 'Credencial de acceso', nombre: p.Title, linea2: (p.TipoDoc || '') + ' ' + (p.NumDoc || ''), linea3: p.Cargo || undefined, linea4: [p.Tipo, p.Empresa].filter(Boolean).join(' · '), linea5: p.Area || undefined, token: p.Token, pie: 'Personal e intransferible' });
    var blob = await new Promise(function (r) { c.toBlob(r, 'image/png'); });
    var b64 = await U.blobToBase64(blob);
    var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
      '<p>' + esc(p.Title) + ':</p><p>La Dirección de Seguridad Integral de ' + esc(AP.CFG.empresa) + ' le remite su credencial digital de acceso. ' +
      'Preséntela en la portería desde su celular o impresa. Es personal e intransferible.</p>' +
      '<p><img src="cid:credencial" alt="Credencial" width="300"></p>' +
      '<p style="font-size:11px;color:#666">' + esc(AP.TX.avisoPrivacidad(AP.CFG)) + '</p></div>';
    await AP.B.sendMail({ to: [p.Correo], subject: 'Credencial de acceso — ' + AP.CFG.empresa, html: html, attachments: [{ name: 'credencial.png', type: 'image/png', base64: b64, cid: 'credencial' }] });
    await AP.Audit.log('Envío de credencial', p.Title, 'Correo: ' + p.Correo);
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  AP.esc = esc;
})();
