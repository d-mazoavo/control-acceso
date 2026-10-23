/* Manual de uso dentro de la aplicación (instructivo), con la estructura documental de Avo-Pak: encabezado con logo,
 * nombre, código, fecha y versión; objetivo y alcance; contenido por perfil; documentos relacionados; aviso de fin del
 * documento. Se consulta en pantalla, se imprime y se descarga en Word. Si el manual no corresponde a la versión de la
 * aplicación en uso, la pantalla lo advierte. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function M() { return AP.MANUAL || { secciones: [], cambios: [] }; }
  // Valores de la configuración vigente que el texto cita entre llaves
  function valores() {
    var c = AP.Horario ? AP.Horario.cfg() : {}, j = (AP.CFG && AP.CFG.jornada) || {};
    return { pendiente: c.minutosPendiente, pendienteMenos1: (c.minutosPendiente || 1) - 1, antelacion: c.minutosAntelacionTurno, horasMaxSinSalida: c.horasMaxSinSalida,
      diurno: j.inicioDiurno || '06:00', nocturno: j.inicioNocturno || '19:00', maxSemanal: j.maximaSemanal || 42, horasPin: AP.CFG.horasVigenciaPinTemporal || 72,
      horasMaxTurno: AP.CFG.horasMaxTurno || 13, minSinSincronizar: AP.CFG.minutosAlertaSinSincronizar || 30 };
  }
  function txt(t) { var v = valores(); return String(t == null ? '' : t).replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? String(v[k]) : m; }); }
  AP.manualTexto = txt;
  // Perfiles que ven el manual completo (incluye las funciones del Director, para auditorías como BRC)
  function completo() { return AP.Session.lectura() || AP.Session.can('ver'); }
  function aplica(sec) {
    if (completo()) return true;
    var r = sec.roles || ['todos'];
    return r.indexOf('todos') >= 0 || r.indexOf(AP.Session.rol) >= 0;
  }
  function bloqueHtml(b) {
    if (b.p) return h('p', null, txt(b.p));
    if (b.h) return h('h3', null, txt(b.h));
    if (b.ul) return h('ul', null, b.ul.map(function (x) { return h('li', null, txt(x)); }));
    if (b.ol) return h('ol', null, b.ol.map(function (x) { return h('li', null, txt(x)); }));
    if (b.nota) return h('p', { class: 'note' }, txt(b.nota));
    if (b.tabla) return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, b.tabla.cab.map(function (c) { return h('th', null, c); }))),
      h('tbody', null, b.tabla.filas.map(function (f) { return h('tr', null, f.map(function (c) { return h('td', null, txt(c)); })); }))));
    return null;
  }

  AP.route('/manual-uso', function () {
    var m = M();
    var todo = completo();
    var verTodo = todo;
    var cuerpo = h('div', { class: 'stack manual' });
    var desactualizado = m.appVersion && m.appVersion !== AP.VERSION;
    function pintar() {
      var secs = m.secciones.filter(function (s) { return verTodo ? true : aplica(s); });
      if (!todo) secs = m.secciones.filter(aplica);
      cuerpo.replaceChildren(
        h('div', { class: 'manual-head' },
          h('div', null, h('img', { src: 'img/logo.png', alt: 'Avo Pak' })),
          h('div', null, h('h1', null, m.titulo || 'Manual de uso'), h('strong', null, 'Avo-Pak'), h('small', { class: 'muted' }, 'Proceso: Seguridad · Dirección de Seguridad Integral')),
          h('div', null, h('span', { class: 'mh-meta' }, 'Código: ', h('strong', null, m.codigo || 'Por asignar')), h('span', { class: 'mh-meta' }, 'Fecha: ', h('strong', null, m.fecha ? U.fDate(U.fromLocal(m.fecha, '12:00')) : '')),
            h('span', { class: 'mh-meta' }, 'Versión: ', h('strong', null, m.version || '01')), h('span', { class: 'mh-meta' }, 'Aplicación: v', AP.VERSION))),
        desactualizado ? h('p', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, 'Este manual corresponde a la versión ' + m.appVersion + ' de la aplicación y la que está en uso es la ' + AP.VERSION + '. Pida la actualización del manual al Director de Seguridad Integral.')) : null,
        !todo ? h('p', { class: 'banner info' }, AP.icon('user', 18), h('span', null, 'Se muestran las secciones generales y las de su perfil (' + AP.Session.rol + ').')) : null,
        h('section', { class: 'card stack sm' }, h('strong', null, 'Contenido'),
          h('nav', { class: 'manual-toc' }, secs.map(function (s, i) { return h('a', { href: '#/manual-uso', onclick: function (e) { e.preventDefault(); var el = document.getElementById('m-' + s.id); if (el) el.scrollIntoView({ behavior: 'smooth' }); } }, (i + 1) + '. ' + s.titulo); }))),
        // Las secciones van dentro de un contenedor (replaceChildren no acepta listas: las convertiría en texto)
        h('div', { class: 'manual-cuerpo' }, secs.map(function (s, i) {
          return h('section', { id: 'm-' + s.id },
            h('h2', null, (i + 1) + '. ' + s.titulo),
            s.roles && s.roles.indexOf('todos') < 0 ? h('div', null, s.roles.map(function (r) { return AP.pill(r, r === AP.Session.rol ? 'ok' : 'muted'); })) : null,
            (s.bloques || []).map(bloqueHtml));
        })),
        todo && (m.cambios || []).length ? h('section', null, h('h2', null, 'Historial de versiones del manual'),
          h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Versión', 'Fecha', 'Descripción del cambio'].map(function (c) { return h('th', null, c); }))),
            h('tbody', null, m.cambios.map(function (c) { return h('tr', null, h('td', null, c.version), h('td', null, U.fDate(U.fromLocal(c.fecha, '12:00'))), h('td', null, c.descripcion)); }))))) : null,
        h('p', { class: 'm-fin' }, 'Fin del documento'));
    }
    var acciones = [
      h('button', { class: 'btn', type: 'button', onclick: function () { window.print(); } }, AP.icon('print', 18), 'Imprimir'),
      todo ? h('button', { class: 'btn primary', type: 'button', onclick: function () { AP.manualWord().catch(function (e) { AP.toast(e.message, 'error'); }); } }, AP.icon('word', 18), 'Descargar en Word') : null
    ];
    if (AP.Session.can('consola')) AP.consolaShell('/manual-uso', 'Manual de uso de la aplicación', cuerpo, acciones);
    else AP.porteriaShell('Manual', h('div', { class: 'stack' }, h('div', { class: 'row gap wrap' }, acciones), cuerpo), { back: AP.Session.inicio(), sub: 'Manual de uso' });
    pintar();
  });

  // ---------- Word (estructura del procedimiento de control documental AP-AC-PD-001: Arial Narrow) ----------
  AP.manualWord = async function () {
    var X = AP.Docx, m = M();
    var F = 'Arial Narrow';
    function r(t, o) {
      o = o || {};
      var pr = '<w:rFonts w:ascii="' + F + '" w:hAnsi="' + F + '" w:cs="' + F + '"/>' + (o.b ? '<w:b/><w:bCs/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') +
        '<w:sz w:val="' + Math.round((o.size || 11) * 2) + '"/><w:szCs w:val="' + Math.round((o.size || 11) * 2) + '"/>';
      return txt(t).split('\n').map(function (l, i) { return '<w:r><w:rPr>' + pr + '</w:rPr>' + (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + X.x(l) + '</w:t></w:r>'; }).join('');
    }
    function p(t, o) { o = o || {}; return X.par([r(t, o)], { align: o.align, after: o.after == null ? 100 : o.after, before: o.before, keep: o.keep, ind: o.ind }); }
    var doc = new X.Doc();
    // Logo en el encabezado
    var logo = null;
    try { var resp = await fetch('img/logo.png'); logo = new Uint8Array(await resp.arrayBuffer()); } catch (e) { logo = null; }
    var dib = logo ? await doc.imagen(logo, 'image/png', 2.2, 2.2, true) : '';
    var celda = function (xml, fill) { return { xml: xml, fill: fill, valign: 'center' }; };
    var enc = X.tabla([[
      celda(X.par([dib], { align: 'center', after: 0 })),
      celda(X.par([r(m.titulo || 'Manual de uso', { b: true, size: 22 })], { align: 'center', after: 0 }) + X.par([r('Avo-Pak', { b: true, size: 16 })], { align: 'center', after: 0 })),
      celda(X.par([r('Código: ' + (m.codigo || 'Por asignar'), { b: true })], { after: 0 }) + X.par([r('Fecha: ' + (m.fecha ? U.fDate(U.fromLocal(m.fecha, '12:00')) : ''), { b: true })], { after: 0 }) +
        X.par([r('Versión: ' + (m.version || '01'), { b: true })], { after: 0 }))
    ]], { anchos: [1700, 5338, 2600] });
    var pie = X.par([r('Página ', { b: true }), X.campo('PAGE', '1'), r(' de ', { b: true }), X.campo('NUMPAGES', '1')], { align: 'center', after: 0 });
    var secs = m.secciones;
    secs.forEach(function (s, i) {
      // Títulos principales: celda azul con letra blanca (Anexo 2 de AP-AC-PD-001)
      doc.add(X.tabla([[{ xml: X.par([r((i + 1) + '. ' + s.titulo, { b: true, size: 14, color: 'FFFFFF' })], { after: 0, keep: true }), fill: '1F4E79' }]], { anchos: [9638] }));
      if (s.roles && s.roles.indexOf('todos') < 0) doc.add(p('Perfiles: ' + s.roles.join(', '), { size: 10, color: '6F7A6B' }));
      (s.bloques || []).forEach(function (b) {
        if (b.p) doc.add(p(b.p, { align: 'both' }));
        else if (b.h) doc.add(p(b.h, { b: true, size: 12, keep: true, before: 80 }));
        else if (b.ul) b.ul.forEach(function (x) { doc.add(X.par([r('•  ' + x)], { ind: 360, after: 60 })); });
        else if (b.ol) b.ol.forEach(function (x, k) { doc.add(X.par([r((k + 1) + '.  ' + x)], { ind: 360, after: 60 })); });
        else if (b.nota) doc.add(X.tabla([[{ xml: X.par([r(b.nota, { size: 10 })], { after: 0 }), fill: 'FDF1D8' }]], { anchos: [9638] }));
        else if (b.tabla) {
          var n = b.tabla.cab.length, w = Math.floor(9638 / n);
          doc.add(X.tabla([b.tabla.cab.map(function (c) { return { xml: X.par([r(c, { b: true, size: 10 })], { after: 0 }), fill: 'DCE6F1' }; })].concat(b.tabla.filas.map(function (f) {
            return f.map(function (c) { return { xml: X.par([r(c, { size: 10 })], { after: 0 }) }; });
          })), { anchos: new Array(n).fill(w), cabecera: true }));
        }
      });
    });
    doc.add(p('Fin del documento', { b: true, align: 'center', before: 240 }));
    var blob = doc.blob({ titulo: m.titulo, autor: AP.Session.user.nombre, encabezado: enc, pie: pie });
    var nombre = 'Manual_Control_de_Acceso_v' + AP.VERSION + '_rev' + (m.version || '01') + '.docx';
    var hash = await U.sha256(blob);
    U.download(blob, nombre);
    await AP.Audit.log('Descarga del manual de uso', nombre, 'Versión del manual ' + (m.version || '') + ' · aplicación ' + AP.VERSION, hash);
  };
})();
