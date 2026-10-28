/* Documentos de Word (.docx) generados en el navegador, sin librerías externas.
 * Uso: informe de inspección de vehículo de carga para Gerencia o autoridades (estructura del modelo de informe de la
 * Dirección de Seguridad Integral: encabezado, memorando, antecedentes, desarrollo, fuentes e integridad, firma). */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  // ---------------- ZIP sin compresión (formato del paquete .docx) ----------------
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  var enc = new TextEncoder();
  function zip(files, mime) {
    var partes = [], central = [], off = 0;
    var d = new Date();
    var dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var nombre = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosT, true); lh.setUint16(12, dosD, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nombre.length, true); lh.setUint16(28, 0, true);
      partes.push(new Uint8Array(lh.buffer), nombre, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosT, true); ch.setUint16(14, dosD, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, nombre.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nombre);
      off += 30 + nombre.length + data.length;
    });
    var tamC = central.reduce(function (a, b) { return a + b.length; }, 0);
    var eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true); eo.setUint16(4, 0, true); eo.setUint16(6, 0, true); eo.setUint16(8, files.length, true); eo.setUint16(10, files.length, true);
    eo.setUint32(12, tamC, true); eo.setUint32(16, off, true); eo.setUint16(20, 0, true);
    return new Blob(partes.concat(central, [new Uint8Array(eo.buffer)]), { type: mime });
  }

  // ---------------- WordprocessingML ----------------
  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  var XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  function x(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var VERDE = '3D5A37', GRIS = '6F7A6B', ANCHO = 9638; // ancho útil en twips (carta, márgenes de 2,5 cm aprox.)

  // Texto con formato: o = { b, i, color, size (pt), caps }
  function run(t, o) {
    o = o || {};
    var pr = (o.b ? '<w:b/><w:bCs/>' : '') + (o.i ? '<w:i/><w:iCs/>' : '') + (o.caps ? '<w:caps/>' : '') +
      (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + (o.size ? '<w:sz w:val="' + Math.round(o.size * 2) + '"/><w:szCs w:val="' + Math.round(o.size * 2) + '"/>' : '');
    return String(t == null ? '' : t).split('\n').map(function (l, i) {
      return '<w:r>' + (pr ? '<w:rPr>' + pr + '</w:rPr>' : '') + (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + x(l) + '</w:t></w:r>';
    }).join('');
  }
  // Párrafo: contenido = texto, [run...] o XML; o = { align, after, before, keep, ind, style, size, b, i, color }
  function par(contenido, o) {
    o = o || {};
    var r = Array.isArray(contenido) ? contenido.join('') : (typeof contenido === 'string' && contenido.indexOf('<w:r>') === 0 ? contenido : run(contenido, o));
    var pr = (o.style ? '<w:pStyle w:val="' + o.style + '"/>' : '') + (o.keep ? '<w:keepNext/>' : '') +
      '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 120 : o.after) + '"/>' +
      (o.ind ? '<w:ind w:left="' + o.ind + '"/>' : '') + (o.align ? '<w:jc w:val="' + o.align + '"/>' : '');
    return '<w:p><w:pPr>' + pr + '</w:pPr>' + r + '</w:p>';
  }
  // Tabla: filas = [[celda...]], celda = texto | { t, b, fill, color, align, xml }; o = { anchos, cabecera, size }
  function tabla(filas, o) {
    o = o || {};
    var anchos = o.anchos;
    var borde = '<w:top w:val="single" w:sz="4" w:color="BFC8BA"/><w:left w:val="single" w:sz="4" w:color="BFC8BA"/><w:bottom w:val="single" w:sz="4" w:color="BFC8BA"/>' +
      '<w:right w:val="single" w:sz="4" w:color="BFC8BA"/><w:insideH w:val="single" w:sz="4" w:color="BFC8BA"/><w:insideV w:val="single" w:sz="4" w:color="BFC8BA"/>';
    var xml = '<w:tbl><w:tblPr><w:tblW w:w="' + anchos.reduce(function (a, b) { return a + b; }, 0) + '" w:type="dxa"/><w:tblBorders>' + (o.sinBordes ? '' : borde) + '</w:tblBorders>' +
      '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
      '<w:tblGrid>' + anchos.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>';
    filas.forEach(function (fila, ri) {
      var cab = o.cabecera && ri === 0;
      xml += '<w:tr>' + (cab ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>');
      fila.forEach(function (c, ci) {
        var cc = (c && typeof c === 'object') ? c : { t: c };
        var fill = cc.fill || (cab ? 'E4EEDF' : null);
        xml += '<w:tc><w:tcPr><w:tcW w:w="' + anchos[ci] + '" w:type="dxa"/>' + (fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>' : '') + '<w:vAlign w:val="' + (cc.valign || 'top') + '"/></w:tcPr>' +
          (cc.xml || par(cc.t == null ? '' : cc.t, { b: cc.b || cab, color: cc.color || (cab ? VERDE : null), size: cc.size || o.size || 9.5, after: 0, align: cc.align })) + '</w:tc>';
      });
      xml += '</w:tr>';
    });
    return xml + '</w:tbl>' + par('', { after: 60 });
  }
  function dibujo(rid, id, cx, cy, nombre) {
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:docPr id="' + id + '" name="' + x(nombre) + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + x(nombre) + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }
  function campo(instr, valor) {
    return '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ' + instr + ' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:r><w:t>' + valor + '</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
  }
  async function dimensiones(bytes, type) {
    try { var b = await createImageBitmap(new Blob([bytes], { type: type })); var r = { w: b.width, h: b.height }; if (b.close) b.close(); return r; }
    catch (e) { return { w: 4, h: 3 }; }
  }
  var EMU_CM = 360000;

  // Documento: doc.add(xml); doc.imagen(bytes, tipo, anchoMaxCm, altoMaxCm) → xml del dibujo; doc.blob(opciones)
  function Doc() { this.partes = []; this.media = []; this.n = 0; }
  Doc.prototype.add = function (xml) { this.partes.push(xml); return this; };
  Doc.prototype.imagen = async function (bytes, tipo, maxW, maxH, enEncabezado) {
    var d = await dimensiones(bytes, tipo);
    var k = Math.min(maxW / d.w, maxH / d.h);
    var cx = Math.round(d.w * k * EMU_CM), cy = Math.round(d.h * k * EMU_CM);
    var ext = /png/i.test(tipo) ? 'png' : 'jpeg';
    this.n++;
    var m = { id: this.n, rid: 'rIdImg' + this.n, archivo: 'media/imagen' + this.n + '.' + ext, bytes: bytes, encabezado: !!enEncabezado };
    this.media.push(m);
    return dibujo(m.rid, 100 + this.n, cx, cy, 'Imagen ' + this.n);
  };
  Doc.prototype.blob = function (o) {
    var cuerpo = this.partes.join('');
    var enc1 = this.media.filter(function (m) { return m.encabezado; }), doc1 = this.media.filter(function (m) { return !m.encabezado; });
    var sect = '<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/>' +
      '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1300" w:right="1301" w:bottom="1300" w:left="1301" w:header="560" w:footer="560" w:gutter="0"/></w:sectPr>';
    var document = XMLH + '<w:document ' + NS + '><w:body>' + cuerpo + sect + '</w:body></w:document>';
    var rel = function (m) { return '<Relationship Id="' + m.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + m.archivo + '"/>'; };
    var docRels = XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdSet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      '<Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
      '<Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
      doc1.map(rel).join('') + '</Relationships>';
    var hdrRels = XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + enc1.map(rel).join('') + '</Relationships>';
    var header = XMLH + '<w:hdr ' + NS + '>' + (o.encabezado || '') + '</w:hdr>';
    var footer = XMLH + '<w:ftr ' + NS + '>' + (o.pie || '') + '</w:ftr>';
    var styles = XMLH + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="es-CO" w:eastAsia="es-CO" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Ttulo1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
      '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:caps/><w:color w:val="' + VERDE + '"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TablaNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '</w:styles>';
    var settings = XMLH + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/></w:settings>';
    var ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    var core = XMLH + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + x(o.titulo) + '</dc:title><dc:creator>' + x(o.autor) + '</dc:creator><cp:lastModifiedBy>' + x(o.autor) + '</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + ahora + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + ahora + '</dcterms:modified></cp:coreProperties>';
    var app = XMLH + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>' + x(o.aplicacion || 'Control de Acceso Avo Pak') + '</Application></Properties>';
    var types = XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
    var rels = XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    var files = [
      { name: '[Content_Types].xml', data: types }, { name: '_rels/.rels', data: rels },
      { name: 'docProps/core.xml', data: core }, { name: 'docProps/app.xml', data: app },
      { name: 'word/document.xml', data: document }, { name: 'word/_rels/document.xml.rels', data: docRels },
      { name: 'word/styles.xml', data: styles }, { name: 'word/settings.xml', data: settings },
      { name: 'word/header1.xml', data: header }, { name: 'word/_rels/header1.xml.rels', data: hdrRels },
      { name: 'word/footer1.xml', data: footer }
    ];
    this.media.forEach(function (m) { files.push({ name: 'word/' + m.archivo, data: m.bytes }); });
    return zip(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  };
  AP.Docx = { Doc: Doc, run: run, par: par, tabla: tabla, campo: campo, x: x, ANCHO: ANCHO, VERDE: VERDE, GRIS: GRIS };

  // ---------------- Informe de inspección de vehículo de carga ----------------
  function jsonDe(s) { try { var a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function cargoFirmante() { return (AP.Session.user.perfil && AP.Session.user.perfil.Cargo) || 'Director de Seguridad Integral'; }
  var CLASIFICACIONES = [
    'CONFIDENCIAL — Uso restringido (Ley 1581 de 2012)',
    'RESERVADO — Uso interno de Avo Pak S.A.S.',
    'Para autoridad competente — Información reservada (Ley 1581 de 2012)'
  ];

  AP.informeInspeccion = function (i) {
    var fecha = U.fDate(i.FechaHora);
    AP.modal({
      title: 'Informe en Word — ' + (i.Placa || ''), size: 'wide',
      body: function (close) {
        var para = AP.input('para', 'Gerencia General — ' + AP.CFG.empresa);
        var asunto = AP.input('asunto', 'Inspección de vehículo de carga placa ' + (i.Placa || '') + ' — ' + (i.Operacion || '') + ' (' + fecha + ')');
        var clas = AP.select('clas', CLASIFICACIONES, CLASIFICACIONES[0]);
        var cons = AP.textarea('consideraciones', '', { rows: 4, placeholder: 'Opcional. Su análisis, conclusiones o recomendaciones. Se presentan separadas de los hechos registrados por el inspector.' });
        var prob = AP.check('probatorio', 'Incluir advertencia de destinación a eventual actuación judicial, administrativa o disciplinaria', false);
        clas.addEventListener('change', function () { if (clas.value === CLASIFICACIONES[2]) prob.querySelector('input').checked = true; });
        var btn = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
          btn.disabled = true; btn.lastChild.textContent = 'Generando…';
          try {
            await generar(i, { para: para.value.trim(), asunto: asunto.value.trim(), clasificacion: clas.value, consideraciones: cons.value.trim(), probatorio: prob.querySelector('input').checked });
            close();
          } catch (e) {
            console.error(e);
            AP.toast('No se pudo generar el informe: ' + e.message, 'error', 8000);
            btn.disabled = false; btn.lastChild.textContent = 'Generar informe en Word';
          }
        } }, AP.icon('word', 18), 'Generar informe en Word');
        return h('div', { class: 'stack' },
          h('p', { class: 'muted small' }, 'Se genera un documento de Word (.docx) con la arquitectura del modelo de informe de la Dirección: encabezado, memorando, antecedentes, identificación, resultado, precintos, no conformidades, registro fotográfico, fuentes e integridad del registro y firma. Puede editarlo en Word antes de radicarlo.'),
          h('div', { class: 'form-grid' },
            AP.field('Para', para, 'Destinatario: Gerencia General, la autoridad y su dependencia, etc.', 'span2'),
            AP.field('Asunto', asunto, null, 'span2'),
            AP.field('Clasificación', clas, null, 'span2'),
            AP.field('Consideraciones de la Dirección de Seguridad Integral', cons, null, 'span2'),
            h('div', { class: 'field span2' }, prob)),
          h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), btn));
      }
    });
  };

  // Logo de los informes: Avo Pak sin el texto «Dirección de Seguridad» (img/logo-informe.png)
  async function logoRecortado() {
    var r = await fetch('img/logo-informe.png');
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  }

  async function generar(i, o) {
    var D = new Doc();
    var firmante = AP.Session.user.nombre, cargo = cargoFirmante();
    var chk = jsonDe(i.Checklist), pv = jsonDe(i.PrecintosVerificacion), fotos = jsonDe(i.Fotos);
    var conforme = i.Resultado === 'Conforme';
    var hoy = new Date();
    var numero = 0;
    function titulo(t) { numero++; D.add(par(numero + '. ' + t, { style: 'Ttulo1', keep: true })); }
    function texto(t, op) { D.add(par(t, Object.assign({ align: 'both' }, op || {}))); }

    // Encabezado: logo y dependencia
    var encabezado = '';
    try {
      var lb = await logoRecortado();
      if (lb) {
        var logo = await D.imagen(lb, 'image/png', 4.2, 1.5, true);
        encabezado = '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="' + ANCHO + '"/></w:tabs><w:spacing w:after="0"/></w:pPr>' + logo +
          '<w:r><w:tab/></w:r>' + run('Dirección de Seguridad Integral', { i: true, color: VERDE, size: 10 }) + '</w:p>';
      }
    } catch (e) { /* sin logo */ }
    if (!encabezado) encabezado = '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="' + ANCHO + '"/></w:tabs></w:pPr>' + run(AP.CFG.empresa.toUpperCase(), { b: true, color: VERDE }) + '<w:r><w:tab/></w:r>' + run('Dirección de Seguridad Integral', { i: true, color: VERDE }) + '</w:p>';
    encabezado += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="DFD57C"/></w:pBdr><w:spacing w:after="0"/></w:pPr></w:p>';

    // Cabecera del informe
    D.add(par(AP.CFG.empresa.toUpperCase(), { b: true, size: 12, after: 0, color: VERDE }));
    D.add(par('La Ceja (Antioquia), ' + U.fLong(hoy).replace(/,\s*\d{2}:\d{2}$/, ''), { after: 0 }));
    D.add(par(AP.CFG.sede || '', { size: 9, color: GRIS, after: 240 }));
    D.add(par('INFORME DE INSPECCIÓN DE VEHÍCULO DE CARGA', { b: true, size: 14, align: 'center', after: 40, color: VERDE }));
    D.add(par((i.Operacion || '') + ' — placa ' + (i.Placa || ''), { align: 'center', after: 240, i: true }));
    D.add(tabla([
      [{ t: 'PARA:', b: true }, o.para || '—'],
      [{ t: 'DE:', b: true }, firmante + ' — ' + cargo],
      [{ t: 'FECHA:', b: true }, U.fLong(hoy)],
      [{ t: 'ASUNTO:', b: true }, o.asunto || ''],
      [{ t: 'REFERENCIA:', b: true }, 'Registro de inspección ' + (i.IdLocal || i.id || '')],
      [{ t: 'CLASIFICACIÓN:', b: true }, { t: o.clasificacion, b: true, color: 'B3261E' }]
    ], { anchos: [2100, ANCHO - 2100], size: 10 }));

    // 1. Antecedentes
    titulo('Antecedentes');
    texto('El ' + U.fLong(i.FechaHora).replace(/, (\d{2}:\d{2})$/, ' a las $1') + ', en ' + (i.Porteria || AP.CFG.porteria) + ' de la planta de ' + AP.CFG.empresa +
      ', ' + (i.Vigilante || 'el inspector') + (i.VigilanteUsuario ? ' (usuario ' + i.VigilanteUsuario + ')' : '') + ' registró en la aplicación de control de acceso la inspección «' + (i.Operacion || '') +
      '» del vehículo de placa ' + (i.Placa || '—') + (i.Remolque ? ', remolque ' + i.Remolque : '') + (i.Contenedor ? ', contenedor ' + i.Contenedor : '') +
      ', conducido por ' + (i.Conductor || '—') + (i.DocConductor ? ' (documento ' + i.DocConductor + ')' : '') + (i.Transportadora ? ', de la empresa transportadora ' + i.Transportadora : '') +
      (i.Testigo ? ', en presencia de ' + i.Testigo + ' como testigo' : '') + '. ' +
      (i._created ? 'El servidor recibió el registro el ' + U.fDateTime(i._created) + (i._createdBy ? ', enviado por el usuario ' + i._createdBy : '') + '. ' : '') +
      (i.SinConexion ? 'El registro se hizo sin conexión y se envió al restablecerse la señal. ' : ''));

    // 2. Identificación
    titulo('Identificación del vehículo, la carga y el conductor');
    var filasId = [['Operación', i.Operacion], ['Placa del vehículo', i.Placa], ['Placa del remolque', i.Remolque], ['Contenedor', i.Contenedor],
      ['Empresa transportadora', i.Transportadora], ['Conductor', i.Conductor], ['Documento del conductor', i.DocConductor], ['Precintos', i.Precintos],
      ['Testigo de la inspección', i.Testigo], ['Inspector', (i.Vigilante || '') + (i.VigilanteUsuario ? ' (usuario ' + i.VigilanteUsuario + ')' : '')],
      ['Fecha y hora de la inspección', U.fDateTime(i.FechaHora)], ['Dispositivo', i.Dispositivo]]
      .filter(function (f) { return f[1]; }).map(function (f) { return [{ t: f[0], b: true, fill: 'F3F6F1' }, f[1]]; });
    D.add(tabla(filasId, { anchos: [3200, ANCHO - 3200] }));

    // 3. Resultado
    titulo('Resultado de la inspección');
    D.add(par([run('Resultado: ', { b: true }), run(conforme ? 'CONFORME' : 'NO CONFORME', { b: true, color: conforme ? '1E7A3C' : 'B3261E' }),
      run('. Puntos revisados: ' + chk.length + '; no conformes: ' + chk.filter(function (c) { return c.estado === 'NC'; }).length +
        '; no aplica: ' + chk.filter(function (c) { return c.estado === 'NA'; }).length + '.')], { after: 120 }));
    if (chk.length) {
      var filasChk = [['N.°', 'Punto de inspección', 'Resultado', 'Hallazgo']];
      chk.forEach(function (c, k) {
        var nc = c.estado === 'NC', fill = nc ? 'FBE5E3' : null;
        filasChk.push([{ t: String(k + 1), fill: fill, align: 'center' }, { t: c.punto, fill: fill },
          { t: c.estado === 'C' ? 'Conforme' : nc ? 'No conforme' : 'No aplica', b: nc, color: nc ? 'B3261E' : null, fill: fill }, { t: c.nota || '', fill: fill }]);
      });
      D.add(tabla(filasChk, { anchos: [600, 4300, 1500, ANCHO - 6400], cabecera: true, size: 9 }));
    }
    texto('La lista corresponde a la inspección de 17 puntos del tractocamión y el remolque o contenedor aplicada conforme a la práctica CTPAT, más la verificación de contaminación agrícola visible, según el procedimiento interno vigente.', { size: 9, color: GRIS });

    // 4. Precintos
    titulo('Verificación de precintos (ISO 17712 — VVTT)');
    if (pv.length) {
      var si = function (v) { return { t: v ? 'Sí' : 'No', align: 'center', color: v ? null : 'B3261E', b: !v }; };
      D.add(tabla([['Precinto', 'Ver', 'Verificar', 'Halar', 'Girar']].concat(pv.map(function (p) { return [p.numero, si(p.ver), si(p.verificar), si(p.halar), si(p.girar)]; })),
        { anchos: [ANCHO - 4800, 1200, 1200, 1200, 1200], cabecera: true }));
    } else texto('No se registraron precintos en esta inspección.');

    // 5. No conformidades
    titulo('No conformidades');
    if (i.NoConformidades) String(i.NoConformidades).split('\n').filter(Boolean).forEach(function (l) { D.add(par([run('• ', { b: true, color: 'B3261E' }), run(l)], { ind: 280, after: 60 })); });
    else texto('No se registraron no conformidades.');

    // 6. Observaciones del inspector
    titulo('Observaciones del inspector');
    texto(i.Observaciones || 'Sin observaciones.');

    // 7. Registro fotográfico
    titulo('Registro fotográfico');
    if (fotos.length) {
      var celdas = [];
      for (var k = 0; k < fotos.length; k++) {
        var f = fotos[k], cont = '';
        try {
          var dat = await AP.B.fileData(f.ruta);
          cont = dat ? par(await D.imagen(dat.bytes, dat.type, 7.6, 7.2), { align: 'center', after: 40 }) : par('(Fotografía no disponible)', { align: 'center', i: true });
        } catch (e) { cont = par('(Fotografía no disponible: ' + e.message + ')', { align: 'center', i: true }); }
        cont += par('Fotografía ' + (k + 1) + '. ' + (f.etiqueta || f.nombre || ''), { b: true, size: 9, align: 'center', after: 0 }) +
          par('SHA-256: ' + (f.sha256 || '—'), { size: 7, color: GRIS, align: 'center', after: 0 });
        celdas.push({ xml: cont });
      }
      var filasF = [];
      for (var j = 0; j < celdas.length; j += 2) filasF.push([celdas[j], celdas[j + 1] || { t: '' }]);
      D.add(tabla(filasF, { anchos: [ANCHO / 2, ANCHO / 2] }));
    } else texto('La inspección no tiene fotografías registradas.');

    // 8. Fuentes e integridad
    titulo('Fuentes e integridad del registro');
    texto('Fuente documental: registro electrónico de la inspección en la aplicación de control de acceso de ' + AP.CFG.empresa + ' (colección AP_Inspecciones), diligenciado en sitio por el inspector, con las fotografías tomadas en el mismo acto. ' +
      'Los numerales 2 a 7 transcriben lo consignado en ese registro y constituyen hechos registrados por el inspector; no contienen conclusiones de esta Dirección.');
    D.add(tabla([
      [{ t: 'Identificador del registro', b: true, fill: 'F3F6F1' }, i.IdLocal || i.id || ''],
      [{ t: 'Huella SHA-256 del registro', b: true, fill: 'F3F6F1' }, { t: i.Hash || '—', size: 8 }],
      [{ t: 'Usuario que lo envió (verificado por el servidor)', b: true, fill: 'F3F6F1' }, i._createdBy || '—'],
      [{ t: 'Recepción en el servidor', b: true, fill: 'F3F6F1' }, i._created ? U.fDateTime(i._created) : '—'],
      [{ t: 'Fotografías', b: true, fill: 'F3F6F1' }, fotos.length + ' (cada una con su huella SHA-256, verificable contra el archivo conservado en la plataforma)']
    ], { anchos: [3600, ANCHO - 3600], size: 9 }));

    // 9. Consideraciones del Director (opcional)
    if (o.consideraciones) {
      titulo('Consideraciones de la Dirección de Seguridad Integral');
      o.consideraciones.split(/\n{2,}/).forEach(function (pp) { texto(pp.trim()); });
    }
    if (o.probatorio) {
      D.add(par([run('Advertencia. ', { b: true }), run('El presente informe se expide para sustentar eventual actuación judicial, administrativa o disciplinaria. Su contenido y sus anexos se conservan en su forma original; cualquier alteración puede verificarse mediante las huellas SHA-256 indicadas.')],
        { align: 'both', before: 160, size: 9.5 }));
    }

    // Firma
    D.add(par('Atentamente,', { before: 360, after: 720 }));
    D.add(par(firmante.toUpperCase(), { b: true, after: 0 }));
    D.add(par(cargo, { after: 0 }));
    D.add(par(AP.CFG.empresa, { after: 0 }));

    var pie = '<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="BFC8BA"/></w:pBdr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr>' +
      run(o.clasificacion.split(' — ')[0] + ' | Página ', { size: 8, color: GRIS }) + campo('PAGE', '1') + run(' de ', { size: 8, color: GRIS }) + campo('NUMPAGES', '1') + '</w:p>' +
      par('Informe generado el ' + U.fDateTime(hoy) + ' desde la aplicación de control de acceso · registro ' + String(i.IdLocal || i.id || '').slice(0, 8), { size: 7, color: GRIS, align: 'center', after: 0 });

    var blob = D.blob({ encabezado: encabezado, pie: pie, titulo: 'Informe de inspección ' + (i.Placa || ''), autor: firmante + ' — ' + cargo });
    var nombre = 'Informe_inspeccion_' + U.safeName(i.Placa || 'vehiculo') + '_' + U.ymd(i.FechaHora) + '.docx';
    var hash = await U.sha256(blob);
    U.download(blob, nombre);
    await AP.Audit.log('Informe de inspección en Word', nombre, 'Inspección ' + (i.IdLocal || '') + ' · placa ' + (i.Placa || '') + ' · para: ' + (o.para || '') + ' · ' + o.clasificacion, hash);
    AP.toast('Informe descargado: ' + nombre + '. Su huella SHA-256 quedó en la bitácora.', 'info', 7000);
  }
})();
