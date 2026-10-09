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
        B.listRange('AP_Inspecciones', 'FechaHora', hoy0, null).catch(function () { return []; })
      ]);
      var movs = res[0], vis = res[1], pers = res[2], insp = res[3];
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
      var visHoy = vis.filter(function (v) { return U.ymd(v.FechaInicio) === U.ymd() && v.Estado === 'Aprobada'; });
      var pend = vis.filter(function (v) { return v.Estado === 'Pendiente'; });
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
      movs.forEach(function (m) {
        if (!m.Novedad || new Date(m.FechaHora) < hoy0) return;
        var grave = /no autorizada|denegad/i.test(m.Novedad);
        alertas.push([grave ? 'alert' : 'clock', grave ? 'deny' : 'warn', m.Title + ' — ' + m.Novedad + ' (' + U.fTime(m.FechaHora) + (m.Vigilante ? ', registró ' + m.Vigilante : '') + '). Verifique en Novedades.']);
      });
      negados.forEach(function (m) { alertas.push(['x', 'deny', 'Ingreso negado a ' + m.Title + ' a las ' + U.fTime(m.FechaHora) + ': ' + (m.MotivoNegacion || '')]); });
      excep.forEach(function (m) { alertas.push(['key', 'warn', 'Ingreso por excepción de ' + m.Title + ' autorizado por ' + (m.AutorizadoPor || '—') + '.']); });
      nc.forEach(function (i) { alertas.push(['truck', 'deny', 'Inspección NO CONFORME: ' + i.Placa + ' (' + U.fTime(i.FechaHora) + '). ' + (i.NoConformidades || '')]); });
      pend.forEach(function (v) { alertas.push(['user', 'info', 'Visita pendiente de aprobación: ' + v.Title + ' (' + U.fDateTime(v.FechaInicio) + ').']); });

      var kpi = function (n, l, icon, kind, href) {
        return h(href ? 'a' : 'div', { class: 'kpi ' + (kind || ''), href: href ? '#' + href : null }, AP.icon(icon, 22), h('strong', null, String(n)), h('span', null, l));
      };
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
          kpi(dentro.length, 'Personas dentro ahora', 'users', 'brand'),
          kpi(ingresos.length, 'Ingresos hoy', 'door'),
          kpi(negados.length, 'Ingresos negados hoy', 'x', negados.length ? 'deny' : ''),
          kpi(excep.length, 'Excepciones hoy', 'key', excep.length ? 'warn' : ''),
          kpi(hoy.filter(function (m) { return m.Novedad; }).length, 'Novedades de horario y salida hoy', 'alert', hoy.some(function (m) { return m.Novedad; }) ? 'warn' : '', '/consola/novedades'),
          kpi(visHoy.length, 'Visitas aprobadas hoy', 'user', '', '/consola/visitas'),
          kpi(pend.length, 'Visitas por aprobar', 'inbox', pend.length ? 'warn' : '', '/consola/visitas'),
          kpi(insp.length, 'Inspecciones de carga hoy', 'truck', nc.length ? 'deny' : '', '/consola/inspecciones'),
          kpi(pers.filter(function (p) { return p.Estado === 'Habilitado'; }).length, 'Personas habilitadas', 'badge', '', '/consola/personas')),
        h('div', { class: 'grid-2' },
          h('section', { class: 'card' }, h('h3', null, 'Alertas'),
            alertas.length ? h('ul', { class: 'alerts' }, alertas.slice(0, 40).map(function (a) { return h('li', { class: a[1] }, AP.icon(a[0], 18), h('span', null, a[2])); }))
              : h('p', { class: 'muted' }, 'Sin alertas.')),
          h('section', { class: 'card' }, h('h3', null, 'Dentro de las instalaciones'),
            Object.keys(cats).length ? h('ul', { class: 'cats' }, Object.keys(cats).map(function (c) { return h('li', null, h('span', null, c), h('strong', null, String(cats[c]))); })) : h('p', { class: 'muted' }, 'Nadie registrado dentro.'),
            h('h3', { class: 'mt' }, 'Ingresos por hora (hoy)'), chart)),
        h('section', { class: 'card' }, h('h3', null, 'Actividad reciente'),
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
    var q = AP.input('q', '', { type: 'search', placeholder: 'Buscar por nombre, documento, empresa o placa' });
    var fTipo = AP.select('tipo', [['', 'Todos los tipos']].concat(AP.CAT.tiposPersona), '');
    var fEst = AP.select('estado', [['', 'Todos los estados'], 'Habilitado', 'Inhabilitado', ['vencido', 'Habilitación vencida']], '');
    var tbl = null;
    var actions = [
      h('button', { class: 'btn primary', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Nueva persona'),
      h('button', { class: 'btn', type: 'button', onclick: function () { AP.cargaMasiva(function () { AP.render(); }); } }, AP.icon('upload', 18), 'Carga masiva'),
      h('button', { class: 'btn', type: 'button', onclick: fotosLote }, AP.icon('camera', 18), 'Fotos en lote')
    ];
    AP.consolaShell('/consola/personas', 'Personas habilitadas', content, actions);

    function filtrar() {
      var t = U.fold(q.value), d = U.normDoc(q.value), hoy = U.ymd();
      return personas.filter(function (p) {
        if (fTipo.value && p.Tipo !== fTipo.value) return false;
        if (fEst.value === 'vencido') { if (!(p.Estado === 'Habilitado' && p.VigenciaHasta && p.VigenciaHasta < hoy)) return false; }
        else if (fEst.value && p.Estado !== fEst.value) return false;
        if (!t) return true;
        return U.fold(p.Title + ' ' + p.Empresa + ' ' + p.Cargo + ' ' + p.Area + ' ' + p.Placa).indexOf(t) >= 0 || (d && U.normDoc(p.NumDoc).indexOf(d) >= 0);
      }).sort(function (a, b) { return U.fold(a.Title) < U.fold(b.Title) ? -1 : 1; });
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
        { label: '', cls: 'w-check', render: function (p) { var c = h('input', { type: 'checkbox', checked: sel.has(p.id), 'aria-label': 'Seleccionar ' + p.Title }); c.addEventListener('change', function () { c.checked ? sel.add(p.id) : sel.delete(p.id); selInfo(); }); return c; } },
        { label: '', cls: 'w-photo', render: function (p) { return h('img', { class: 'photo xs', src: fotoCache[p.id] || U.avatar(p.Title), alt: '', dataset: { pid: p.id } }); } },
        { label: 'Nombre', render: function (p) { return h('div', null, h('strong', null, p.Title), h('small', { class: 'block muted' }, (p.TipoDoc || '') + ' ' + (p.NumDoc || ''))); } },
        { label: 'Tipo', key: 'Tipo' },
        { label: 'Empresa / cargo', render: function (p) { return h('div', null, p.Empresa || '', h('small', { class: 'block muted' }, [p.Cargo, p.Area].filter(Boolean).join(' · '))); } },
        { label: 'Placa', key: 'Placa' },
        { label: 'Vigencia', render: function (p) { return p.VigenciaHasta ? h('span', { class: p.VigenciaHasta < hoy ? 'txt-deny' : '' }, p.VigenciaHasta) : '—'; } },
        { label: 'Estado', render: function (p) { return AP.estadoPill(p.Estado); } },
        { label: '', cls: 'right', render: function (p) {
          return h('div', { class: 'row gap nowrap' },
            h('button', { class: 'btn small', type: 'button', title: 'Editar', onclick: function () { editar(p); } }, AP.icon('edit', 16)),
            h('button', { class: 'btn small ' + (p.Estado === 'Habilitado' ? 'danger-outline' : ''), type: 'button', onclick: function () { cambiarEstado(p); } },
              AP.icon(p.Estado === 'Habilitado' ? 'lock' : 'unlock', 16), p.Estado === 'Habilitado' ? 'Inhabilitar' : 'Habilitar'),
            h('button', { class: 'btn small', type: 'button', title: 'Credencial QR', onclick: function () { credencial(p); } }, AP.icon('qr', 16)));
        } }
      ];
      if (!tbl) tbl = table(cols, rows, { onRow: editar, afterPaint: fotosPagina, rowClass: function (p) { return p.Estado !== 'Habilitado' ? 'row-deny' : ''; } });
      else tbl.repaint(rows);
      return tbl;
    }
    var selBox = h('div', { class: 'row gap wrap' });
    function selInfo() {
      selBox.replaceChildren();
      var n = sel.size;
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

    [q, fTipo, fEst].forEach(function (el) { el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', U.debounce(function () { tbl.repaint(filtrar()); }, 150)); });

    load(content, async function () {
      personas = await AP.B.listAll('AP_Personas', { exclude: ['Foto'] });
      content.replaceChildren(h('div', { class: 'filters' }, q, fTipo, fEst), selBox, render());
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

    async function editar(p) {
      var nuevo = !p;
      var full = p ? Object.assign({}, p) : { Tipo: 'Personal propio', TipoDoc: 'CC', Estado: 'Habilitado', Empresa: AP.CFG.empresa };
      if (p) {
        try { var ff = await AP.B.getFields('AP_Personas', [p.id], ['Foto', 'Observaciones']); Object.assign(full, ff[p.id] || {}); } catch (e) { /* sin foto */ }
      }
      var foto = full.Foto || '';
      AP.modal({
        title: nuevo ? 'Nueva persona' : full.Title,
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
          var form = h('div', { class: 'form-grid' },
            AP.field('Nombres y apellidos *', I('Title', full.Title)),
            AP.field('Tipo *', AP.select('Tipo', AP.CAT.tiposPersona, full.Tipo)),
            AP.field('Tipo de documento', AP.select('TipoDoc', AP.CAT.tiposDoc, full.TipoDoc)),
            AP.field('Número de documento *', I('NumDoc', full.NumDoc, { inputmode: 'numeric' })),
            AP.field('Empresa', I('Empresa', full.Empresa)),
            AP.field('Cargo / labor', I('Cargo', full.Cargo)),
            AP.field('Área', I('Area', full.Area)),
            AP.field('Teléfono', I('Telefono', full.Telefono, { inputmode: 'tel' })),
            AP.field('Correo (para enviarle su QR)', I('Correo', full.Correo, { type: 'email' })),
            AP.field('Vigente hasta', I('VigenciaHasta', full.VigenciaHasta, { type: 'date' }), 'Contratistas: fecha hasta la cual está verificada la seguridad social.'),
            AP.field('Placa(s) de vehículo', I('Placa', full.Placa, { autocapitalize: 'characters' }), 'Separe varias con coma.'),
            AP.field('Tipo de vehículo', AP.select('VehiculoTipo', AP.CAT.vehiculos, full.VehiculoTipo)),
            AP.field('Estado', AP.select('Estado', ['Habilitado', 'Inhabilitado'], full.Estado)),
            AP.field('Motivo del estado', I('MotivoEstado', full.MotivoEstado)),
            h('div', { class: 'field span2 stack sm' },
              AP.check('AutorizaDatos', 'Existe autorización firmada de tratamiento de datos (versión ' + AP.CFG.versionAutorizacion + ')', full.AutorizaDatos),
              AP.check('AutorizaFoto', 'Autorizó el uso de su fotografía para el cotejo visual en portería', full.AutorizaFoto)),
            AP.field('Observaciones', AP.textarea('Observaciones', full.Observaciones), null, 'span2'));
          var qrBox = h('div', { class: 'qr-mini' });
          if (full.Token) AP.add(qrBox, h('div', { class: 'qr', html: U.qrSvg(U.qrPayload(full.Token), 4, 2) }), h('small', { class: 'muted' }, 'Credencial vigente'));
          var save = async function () {
            var d = AP.formData(form);
            if (d.Title.length < 5 || !d.NumDoc) return AP.toast('Nombre y número de documento son obligatorios.', 'warn');
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
                !nuevo ? h('button', { class: 'btn', type: 'button', onclick: function () { close(); credencial(p); } }, AP.icon('qr', 18), 'Credencial') : null,
                h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
                h('button', { class: 'btn primary', type: 'button', onclick: save }, AP.icon('check', 18), 'Guardar'))));
        }
      });
    }

    async function credencial(p) {
      AP.modal({
        title: 'Credencial de ' + p.Title,
        body: function (close) {
          var qr = h('div', { class: 'qr big', html: U.qrSvg(U.qrPayload(p.Token), 6, 3) });
          return h('div', { class: 'stack center' }, qr,
            h('p', { class: 'muted small' }, 'El código no contiene datos personales: es un identificador aleatorio que se valida contra la lista de personas habilitadas.'),
            h('div', { class: 'row gap wrap center' },
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); imprimirCarnes([p]); } }, AP.icon('print', 18), 'Imprimir carné'),
              h('button', { class: 'btn', type: 'button', onclick: async function () {
                var c = await AP.paseCanvas({ titulo: 'Credencial de acceso', nombre: p.Title, linea2: (p.TipoDoc || '') + ' ' + (p.NumDoc || ''), linea3: [p.Tipo, p.Empresa].filter(Boolean).join(' · '), token: p.Token, pie: 'Personal e intransferible' });
                c.toBlob(function (b) { U.download(b, 'Credencial_' + U.safeName(p.Title) + '.png'); });
              } }, AP.icon('download', 18), 'Descargar imagen'),
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

    function exportarPersonas(rows) {
      exportar('Personas', [
        ['Nombre', function (p) { return p.Title; }, 34], ['Tipo', function (p) { return p.Tipo; }, 18], ['Tipo doc.', function (p) { return p.TipoDoc; }, 8],
        ['Documento', function (p) { return p.NumDoc; }, 16], ['Empresa', function (p) { return p.Empresa; }, 28], ['Cargo', function (p) { return p.Cargo; }, 22],
        ['Área', function (p) { return p.Area; }, 18], ['Teléfono', function (p) { return p.Telefono; }, 14], ['Placa', function (p) { return p.Placa; }, 12],
        ['Vigente hasta', function (p) { return p.VigenciaHasta; }, 13], ['Estado', function (p) { return p.Estado; }, 12], ['Motivo estado', function (p) { return p.MotivoEstado; }, 30],
        ['Autoriza datos', function (p) { return U.yesNo(p.AutorizaDatos); }, 10], ['Autoriza foto', function (p) { return U.yesNo(p.AutorizaFoto); }, 10]
      ], rows, 'xlsx', [['Generado por', AP.Session.user.nombre + ' (' + AP.Session.user.upn + ')'], ['Fecha', U.fDateTime(new Date())], ['Filtro', q.value || 'ninguno']]);
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
          h('div', { class: 'id-head' }, h('img', { src: 'img/logo-avo.png', alt: 'Avo Pak' }), h('span', null, vis ? 'PASE DE VISITANTE' : 'CREDENCIAL DE ACCESO')),
          h('div', { class: 'id-body' },
            vis ? null : h('img', { class: 'id-photo', src: p.Foto || U.avatar(p.Title), alt: '' }),
            h('div', { class: 'id-data' },
              h('strong', null, p.Title),
              h('span', null, (p.TipoDoc || '') + ' ' + (p.NumDoc || '')),
              h('span', null, vis ? 'Visita a: ' + (p.Anfitrion || '') : (p.Tipo || '')),
              h('span', null, vis ? U.fDateTime(p.FechaInicio) + ' – ' + U.fTime(p.FechaFin) : (p.Empresa || '')),
              !vis && p.VigenciaHasta ? h('span', { class: 'id-vig' }, 'Vigente hasta ' + p.VigenciaHasta) : null),
            h('div', { class: 'id-qr', html: U.qrSvg(U.qrPayload(p.Token), 3, 2) })),
          h('div', { class: 'id-foot' }, vis ? 'Debe permanecer acompañado · Devolver al salir' : 'Personal e intransferible · ' + AP.CFG.empresa)));
      });
    })();
  });

  // Imagen del pase (para correo, descarga o WhatsApp)
  AP.paseCanvas = async function (o) {
    var W = 720, H = 1100;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#66754e'; x.fillRect(0, 0, W, 150);
    try {
      var logo = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = 'img/logo-avo.png'; });
      var lw = 200, lh = lw * logo.height / logo.width; x.drawImage(logo, 36, (150 - lh) / 2, lw, lh);
    } catch (e) { /* sin logo */ }
    x.fillStyle = '#ffffff'; x.font = '700 30px system-ui, Arial'; x.textAlign = 'right';
    x.fillText(o.titulo.toUpperCase(), W - 36, 86);
    x.fillStyle = '#d2ce60'; x.fillRect(0, 150, W, 8);
    var q = U.qrCanvas(U.qrPayload(o.token), 520);
    x.drawImage(q, (W - q.width) / 2, 190);
    var y = 190 + q.height + 50;
    x.textAlign = 'center'; x.fillStyle = '#22261c';
    x.font = '700 34px system-ui, Arial'; y += wrap(o.nombre, y, 40); y += 48;
    x.font = '400 26px system-ui, Arial'; x.fillStyle = '#444';
    [o.linea2, o.linea3, o.linea4].forEach(function (l) { if (l) { y += wrap(l, y, 32); y += 40; } });
    x.fillStyle = '#66754e'; x.fillRect(0, H - 70, W, 70);
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
    var c = await AP.paseCanvas({ titulo: 'Credencial de acceso', nombre: p.Title, linea2: (p.TipoDoc || '') + ' ' + (p.NumDoc || ''), linea3: [p.Tipo, p.Empresa].filter(Boolean).join(' · '), token: p.Token, pie: 'Personal e intransferible' });
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
