/* Informes formales de la Dirección de Seguridad Integral en Word (.docx) y en PDF, en español o en inglés, a partir de un
 * mismo contenido: encabezado institucional, memorando, numerales, tablas, indicadores, gráficas, registro fotográfico,
 * fuentes e integridad y firma (escaneada, si el Director la cargó). El PDF se arma en el navegador con jsPDF, que se
 * descarga solo cuando se genera el primer PDF. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  var VERDE = '#3D5A37', GRIS = '#6F7A6B', ROJO = '#B3261E', LINEA = '#BFC8BA', CLARO = '#F3F6F1', CAB = '#E4EEDF', ORO = '#DFD57C';
  var TZ = 'America/Bogota';

  // ---------- Idioma del informe ----------
  function tr(idioma) { return function (es, en) { return idioma === 'en' ? en : es; }; }
  function fechaLarga(d, idioma, conHora) {
    d = U.toDate(d);
    if (!d || isNaN(d)) return '';
    var f = new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-CO', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    return f + (conHora ? (idioma === 'en' ? ' at ' : ', ') + U.fTime(d) : '');
  }
  function fechaHora(d, idioma) {
    d = U.toDate(d);
    if (!d || isNaN(d)) return '';
    if (idioma !== 'en') return U.fDateTime(d);
    return new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: '2-digit', day: '2-digit', year: 'numeric' }).format(d) + ' ' + U.fTime(d);
  }
  function nombreMes(ym, idioma) {
    var d = new Date(ym + '-15T12:00:00-05:00');
    var t = new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-CO', { timeZone: TZ, month: 'long', year: 'numeric' }).format(d);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // ---------- Recursos ----------
  var logoCache = null;
  async function logo() {
    if (logoCache) return logoCache;
    try {
      var r = await fetch('img/logo-informe.png');
      if (!r.ok) return null;
      logoCache = new Uint8Array(await r.arrayBuffer());
      return logoCache;
    } catch (e) { return null; }
  }
  async function dims(bytes, tipo) {
    try { var b = await createImageBitmap(new Blob([bytes], { type: tipo })); var r = { w: b.width, h: b.height }; if (b.close) b.close(); return r; }
    catch (e) { return { w: 4, h: 3 }; }
  }
  var cargaPdf = null;
  function jsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!cargaPdf) {
      cargaPdf = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = 'js/vendor/jspdf.umd.min.js?v=' + (AP.VERSION || '1');
        s.onload = function () { if (window.jspdf && window.jspdf.jsPDF) res(window.jspdf.jsPDF); else rej(new Error('No fue posible cargar el generador de PDF.')); };
        s.onerror = function () { cargaPdf = null; rej(new Error('No fue posible cargar el generador de PDF. Revise la conexión e intente de nuevo.')); };
        document.head.appendChild(s);
      });
    }
    return cargaPdf;
  }
  // Firma escaneada del usuario (bytes y tipo) o null
  async function firma() {
    try { return AP.B.miFirma ? await AP.B.miFirma() : null; } catch (e) { return null; }
  }
  function cargo() { return (AP.Session.user.perfil && AP.Session.user.perfil.Cargo) || 'Director de Seguridad Integral'; }
  function cargoEn(c) { return /director de seguridad integral/i.test(c) ? 'Director of Integral Security' : c; }

  // ================== WORD ==================
  async function aWord(m) {
    var X = AP.Docx, D = new X.Doc(), par = X.par, run = X.run, ANCHO = X.ANCHO;
    var vd = VERDE.slice(1), gr = GRIS.slice(1), rj = ROJO.slice(1);
    var T = tr(m.idioma), num = 0;
    function celda(c) {
      if (c && typeof c === 'object') return { t: c.t, b: c.b, fill: c.fill ? c.fill.replace('#', '') : null, color: c.color ? c.color.replace('#', '') : null, align: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : null, size: c.size };
      return { t: c == null ? '' : String(c) };
    }
    for (var i = 0; i < m.bloques.length; i++) {
      var b = m.bloques[i];
      if (!b) continue;
      if (b.t === 'cab') {
        D.add(par(AP.CFG.empresa.toUpperCase(), { b: true, size: 12, after: 0, color: vd }));
        D.add(par(b.lugarFecha, { after: 0 }));
        if (AP.CFG.sede) D.add(par(AP.CFG.sede, { size: 9, color: gr, after: 240 }));
        D.add(par(b.titulo, { b: true, size: 14, align: 'center', after: 40, color: vd }));
        if (b.subtitulo) D.add(par(b.subtitulo, { align: 'center', after: 240, i: true }));
      } else if (b.t === 'memo') {
        D.add(X.tabla(b.filas.map(function (f) { return [{ t: f[0], b: true }, f[2] ? { t: f[1], b: true, color: rj } : f[1]]; }), { anchos: [2100, ANCHO - 2100], size: 10 }));
      } else if (b.t === 'h') {
        num++;
        D.add(par(num + '. ' + b.texto, { style: 'Ttulo1', keep: true }));
      } else if (b.t === 'p') {
        if (b.etiqueta) D.add(par([run(b.etiqueta, { b: true }), run(b.texto)], { align: 'both', size: b.size }));
        else D.add(par(b.texto, { align: b.align === 'center' ? 'center' : 'both', size: b.size, i: b.i, b: b.b, color: b.color ? b.color.replace('#', '') : null, after: b.after }));
      } else if (b.t === 'lista') {
        b.items.forEach(function (it) { D.add(par([run('•  ', { b: true, color: vd }), run(it)], { ind: 280, after: 60 })); });
      } else if (b.t === 'tabla') {
        var tot = b.anchos.reduce(function (a, x) { return a + x; }, 0);
        var an = b.anchos.map(function (x) { return Math.round(x / tot * ANCHO); });
        D.add(X.tabla(b.filas.map(function (f) { return f.map(celda); }), { anchos: an, cabecera: b.cabecera, size: b.size || 9 }));
      } else if (b.t === 'kpis') {
        var cols = b.cols || 3, filas = [];
        for (var k = 0; k < b.items.length; k += cols) {
          var fila = [];
          for (var j = 0; j < cols; j++) {
            var it = b.items[k + j];
            fila.push(it ? { xml: par(String(it[0]), { b: true, size: 16, color: it[2] === 'mal' ? rj : vd, align: 'center', after: 0 }) + par(it[1], { size: 8.5, color: gr, align: 'center', after: 0 }) } : { t: '' });
          }
          filas.push(fila);
        }
        D.add(X.tabla(filas, { anchos: new Array(cols).fill(Math.floor(ANCHO / cols)) }));
      } else if (b.t === 'graf') {
        if (b.titulo) D.add(par(b.titulo, { b: true, size: 10, keep: true, after: 60 }));
        var ar = b.img.h / b.img.w;
        D.add(par(await D.imagen(b.img.bytes, 'image/png', 16.5, 16.5 * ar), { align: 'center', after: 40 }));
        if (b.nota) D.add(par(b.nota, { size: 8.5, color: gr, i: true }));
      } else if (b.t === 'fotos') {
        var celdas = [];
        for (var q = 0; q < b.items.length; q++) {
          var f = b.items[q], cont = '';
          cont = f.bytes ? par(await D.imagen(f.bytes, f.type || 'image/jpeg', 7.6, 7.2), { align: 'center', after: 40 }) : par(f.falta || T('(Fotografía no disponible)', '(Photograph not available)'), { align: 'center', i: true });
          cont += par(f.pie || '', { b: true, size: 9, align: 'center', after: 0 }) + (f.sub ? par(f.sub, { size: 7, color: gr, align: 'center', after: 0 }) : '');
          celdas.push({ xml: cont });
        }
        var ff = [];
        for (var z = 0; z < celdas.length; z += 2) ff.push([celdas[z], celdas[z + 1] || { t: '' }]);
        if (ff.length) D.add(X.tabla(ff, { anchos: [ANCHO / 2, ANCHO / 2] }));
      } else if (b.t === 'aviso') {
        D.add(par([run(b.titulo + ' ', { b: true }), run(b.texto)], { align: 'both', before: 160, size: 9.5 }));
      } else if (b.t === 'firma') {
        // El texto de cierre va con la firma: la firma nunca queda sola en una página
        if (b.texto) D.add(par(b.texto, { align: 'both', before: 240, keep: true }));
        D.add(par(b.cierre, { before: b.texto ? 120 : 360, after: b.img ? 60 : 720, keep: true }));
        if (b.img) D.add(par(await D.imagen(b.img.bytes, b.img.type, 5.5, 2.2), { after: 0, keep: true }));
        D.add(par(b.nombre.toUpperCase(), { b: true, after: 0, keep: true }));
        D.add(par(b.cargo, { after: 0, keep: true }));
        D.add(par(AP.CFG.empresa, { after: 0 }));
      } else if (b.t === 'salto') {
        D.add('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      }
    }
    var encabezado = '';
    var lb = await logo();
    if (lb) {
      var lg = await D.imagen(lb, 'image/png', 4.2, 1.5, true);
      encabezado = '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="' + ANCHO + '"/></w:tabs><w:spacing w:after="0"/></w:pPr>' + lg +
        '<w:r><w:tab/></w:r>' + run(T('Dirección de Seguridad Integral', 'Integral Security Department'), { i: true, color: vd, size: 10 }) + '</w:p>';
    } else encabezado = '<w:p>' + run(AP.CFG.empresa.toUpperCase(), { b: true, color: vd }) + '</w:p>';
    encabezado += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="' + ORO.slice(1) + '"/></w:pBdr><w:spacing w:after="0"/></w:pPr></w:p>';
    var pie = '<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="' + LINEA.slice(1) + '"/></w:pBdr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr>' +
      run(m.clasificacion.split(' — ')[0] + ' | ' + T('Página ', 'Page '), { size: 8, color: gr }) + X.campo('PAGE', '1') + run(T(' de ', ' of '), { size: 8, color: gr }) + X.campo('NUMPAGES', '1') + '</w:p>' +
      par(m.pieTexto, { size: 7, color: gr, align: 'center', after: 0 });
    return D.blob({ encabezado: encabezado, pie: pie, titulo: m.titulo, autor: m.autor });
  }

  // ================== PDF ==================
  async function aPdf(m) {
    var JsPDF = await jsPDF();
    var doc = new JsPDF({ unit: 'mm', format: 'letter', compress: true });
    var T = tr(m.idioma);
    var PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    var X0 = 22, X1 = PW - 22, ANCHO = X1 - X0, ARRIBA = 30, ABAJO = PH - 22;
    var PT = 0.3528; // mm por punto
    var y = ARRIBA, num = 0;
    var lb = await logo(), ld = lb ? await dims(lb, 'image/png') : null;
    doc.setProperties({ title: m.titulo, author: m.autor, creator: 'Control de Acceso Avo Pak' });

    function color(hex) { hex = hex.replace('#', ''); return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]; }
    function tinta(hex) { var c = color(hex || '#1d1d1b'); doc.setTextColor(c[0], c[1], c[2]); }
    function fuente(size, estilo) { doc.setFont('helvetica', estilo || 'normal'); doc.setFontSize(size); }
    // Solo caracteres que las fuentes estándar del PDF representan con certeza
    function limpio(t) {
      return String(t == null ? '' : t).replace(/[–—−]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
        .replace(/•/g, '-').replace(/…/g, '...').replace(/→/g, '->').replace(/≥/g, '>=').replace(/≤/g, '<=')
        .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, '');
    }
    function encabezado() {
      if (lb && ld) { var hh = 10, ww = Math.min(42, hh * ld.w / ld.h); doc.addImage(lb, 'PNG', X0, 10, ww, ww * ld.h / ld.w); }
      else { fuente(10, 'bold'); tinta(VERDE); doc.text(limpio(AP.CFG.empresa.toUpperCase()), X0, 16); }
      fuente(9.5, 'italic'); tinta(VERDE); doc.text(limpio(T('Dirección de Seguridad Integral', 'Integral Security Department')), X1, 16, { align: 'right' });
      var c = color(ORO); doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(0.6); doc.line(X0, 23, X1, 23);
    }
    function nuevaPagina() { doc.addPage(); encabezado(); y = ARRIBA; }
    function cabe(alto) { if (y + alto > ABAJO) { nuevaPagina(); return false; } return true; }
    // Ajuste de líneas con primera línea más corta (para una etiqueta en negrilla al inicio)
    function envolver(texto, ancho, primera) {
      var lineas = [];
      limpio(texto).split('\n').forEach(function (parr, pi) {
        var pal = parr.split(/ +/), act = '', disp = pi === 0 && primera != null ? primera : ancho;
        pal.forEach(function (w) {
          var prueba = act ? act + ' ' + w : w;
          if (doc.getTextWidth(prueba) <= disp || !act) {
            // Palabra más larga que la línea: se corta
            while (!act && doc.getTextWidth(prueba) > disp && prueba.length > 1) {
              var k = prueba.length;
              while (k > 1 && doc.getTextWidth(prueba.slice(0, k)) > disp) k--;
              lineas.push({ t: prueba.slice(0, k), fin: false, ancho: disp }); prueba = prueba.slice(k); disp = ancho;
            }
            act = prueba;
          } else { lineas.push({ t: act, fin: false, ancho: disp }); act = w; disp = ancho; }
        });
        lineas.push({ t: act, fin: true, ancho: disp });
      });
      return lineas;
    }
    function linea(l, x, yy, justificar) {
      var pal = l.t.split(' ');
      if (!justificar || l.fin || pal.length < 2) { doc.text(l.t, x, yy); return; }
      var libre = l.ancho - doc.getTextWidth(l.t.replace(/ /g, ''));
      var esp = libre / (pal.length - 1), xx = x;
      pal.forEach(function (w) { doc.text(w, xx, yy); xx += doc.getTextWidth(w) + esp; });
    }
    function parrafo(texto, o) {
      o = o || {};
      var size = o.size || 10.5, lh = size * PT * 1.38;
      var etq = o.etiqueta ? limpio(o.etiqueta) + ' ' : '';
      fuente(size, 'bold'); var we = etq ? doc.getTextWidth(etq) : 0;
      fuente(size, o.b ? 'bold' : o.i ? 'italic' : 'normal');
      var ls = envolver(texto, ANCHO, etq ? ANCHO - we : null);
      ls.forEach(function (l, i) {
        cabe(lh);
        var x = X0;
        if (i === 0 && etq) { fuente(size, 'bold'); tinta('#1d1d1b'); doc.text(etq, X0, y + size * PT); x = X0 + we; fuente(size, o.b ? 'bold' : o.i ? 'italic' : 'normal'); }
        tinta(o.color || '#1d1d1b');
        if (o.align === 'center') doc.text(l.t, X0 + ANCHO / 2, y + size * PT, { align: 'center' });
        else linea(l, x, y + size * PT, o.align !== 'left');
        y += lh;
      });
      y += o.after == null ? 2.2 : o.after;
    }
    // Tabla: filas de celdas (texto o { t, b, fill, color, align, size }); anchos relativos
    function tabla(filas, anchos, o) {
      o = o || {};
      var tot = anchos.reduce(function (a, x) { return a + x; }, 0);
      var an = anchos.map(function (x) { return x / tot * ANCHO; });
      var pad = 1.6, size0 = o.size || 9;
      var cab = o.cabecera ? filas[0] : null;
      function medir(f, esCab) {
        return f.map(function (c, ci) {
          var cc = c && typeof c === 'object' ? c : { t: c };
          var size = cc.size || size0;
          fuente(size, cc.b || esCab ? 'bold' : 'normal');
          var ls = envolver(cc.t == null ? '' : cc.t, an[ci] - pad * 2);
          return { cc: cc, ls: ls, size: size, alto: ls.length * size * PT * 1.3 + pad * 2 };
        });
      }
      function dibujar(f, esCab) {
        var cs = medir(f, esCab), alto = Math.max.apply(null, cs.map(function (c) { return c.alto; }));
        if (y + alto > ABAJO) { nuevaPagina(); if (cab && !esCab) dibujar(cab, true); }
        var x = X0;
        cs.forEach(function (c, ci) {
          var fill = c.cc.fill || (esCab ? CAB : null);
          if (fill) { var fc = color(fill); doc.setFillColor(fc[0], fc[1], fc[2]); doc.rect(x, y, an[ci], alto, 'F'); }
          var lc = color(LINEA); doc.setDrawColor(lc[0], lc[1], lc[2]); doc.setLineWidth(0.2); doc.rect(x, y, an[ci], alto);
          fuente(c.size, c.cc.b || esCab ? 'bold' : 'normal'); tinta(c.cc.color || (esCab ? VERDE : '#1d1d1b'));
          c.ls.forEach(function (l, li) {
            var yy = y + pad + c.size * PT * (1 + li * 1.3) - 0.3;
            if (c.cc.align === 'right') doc.text(l.t, x + an[ci] - pad, yy, { align: 'right' });
            else if (c.cc.align === 'center') doc.text(l.t, x + an[ci] / 2, yy, { align: 'center' });
            else doc.text(l.t, x + pad, yy);
          });
          x += an[ci];
        });
        y += alto;
      }
      filas.forEach(function (f, i) { dibujar(f, !!(cab && i === 0)); });
      y += 3;
    }
    function imagen(bytes, tipo, w, hh, x) { doc.addImage(bytes, /png/i.test(tipo) ? 'PNG' : 'JPEG', x == null ? X0 + (ANCHO - w) / 2 : x, y, w, hh); }

    encabezado();
    for (var i = 0; i < m.bloques.length; i++) {
      var b = m.bloques[i];
      if (!b) continue;
      if (b.t === 'cab') {
        fuente(12, 'bold'); tinta(VERDE); doc.text(limpio(AP.CFG.empresa.toUpperCase()), X0, y + 4); y += 6;
        fuente(10.5); tinta('#1d1d1b'); doc.text(limpio(b.lugarFecha), X0, y + 4); y += 5.5;
        if (AP.CFG.sede) { fuente(9); tinta(GRIS); doc.text(limpio(AP.CFG.sede), X0, y + 3.5); y += 5; }
        y += 6;
        fuente(14, 'bold'); tinta(VERDE);
        envolver(b.titulo, ANCHO).forEach(function (l) { doc.text(l.t, X0 + ANCHO / 2, y + 5, { align: 'center' }); y += 6.5; });
        if (b.subtitulo) { fuente(10.5, 'italic'); tinta('#1d1d1b'); envolver(b.subtitulo, ANCHO).forEach(function (l) { doc.text(l.t, X0 + ANCHO / 2, y + 4, { align: 'center' }); y += 5; }); }
        y += 5;
      } else if (b.t === 'memo') {
        tabla(b.filas.map(function (f) { return [{ t: f[0], b: true }, f[2] ? { t: f[1], b: true, color: ROJO } : f[1]]; }), [2100, 7538], { size: 9.5 });
      } else if (b.t === 'h') {
        num++;
        cabe(16);
        y += 3;
        fuente(11, 'bold'); tinta(VERDE); doc.text(limpio((num + '. ' + b.texto).toUpperCase()), X0, y + 4); y += 7.5;
      } else if (b.t === 'p') {
        parrafo(b.texto, { etiqueta: b.etiqueta, size: b.size, i: b.i, b: b.b, color: b.color, align: b.align, after: b.after == null ? null : b.after / 60 });
      } else if (b.t === 'lista') {
        b.items.forEach(function (it) {
          fuente(10.5); var ls = envolver(it, ANCHO - 6);
          ls.forEach(function (l, li) { cabe(5); tinta('#1d1d1b'); if (li === 0) { tinta(VERDE); doc.text('-', X0 + 1.5, y + 3.7); tinta('#1d1d1b'); } linea(l, X0 + 6, y + 3.7, true); y += 5; });
          y += 1;
        });
        y += 1.5;
      } else if (b.t === 'tabla') {
        tabla(b.filas, b.anchos, { cabecera: b.cabecera, size: b.size });
      } else if (b.t === 'kpis') {
        var cols = b.cols || 3, gap = 3, wk = (ANCHO - gap * (cols - 1)) / cols, hk = 19;
        for (var k = 0; k < b.items.length; k += cols) {
          cabe(hk + gap);
          for (var j = 0; j < cols && b.items[k + j]; j++) {
            var it = b.items[k + j], x = X0 + j * (wk + gap);
            var fc = color(CLARO), lc = color(LINEA);
            doc.setFillColor(fc[0], fc[1], fc[2]); doc.setDrawColor(lc[0], lc[1], lc[2]); doc.setLineWidth(0.2);
            doc.roundedRect(x, y, wk, hk, 2, 2, 'FD');
            fuente(15, 'bold'); tinta(it[2] === 'mal' ? ROJO : VERDE); doc.text(limpio(String(it[0])), x + wk / 2, y + 8.2, { align: 'center' });
            fuente(7.8); tinta(GRIS);
            envolver(it[1], wk - 4).slice(0, 2).forEach(function (l, li) { doc.text(l.t, x + wk / 2, y + 12.6 + li * 3.2, { align: 'center' }); });
          }
          y += hk + gap;
        }
        y += 1;
      } else if (b.t === 'graf') {
        var gw = ANCHO, gh = gw * b.img.h / b.img.w;
        cabe(gh + (b.titulo ? 7 : 0) + (b.nota ? 6 : 0));
        if (b.titulo) { fuente(10, 'bold'); tinta('#1d1d1b'); doc.text(limpio(b.titulo), X0, y + 3.6); y += 6; }
        imagen(b.img.bytes, 'image/png', gw, gh); y += gh + 1.5;
        if (b.nota) parrafo(b.nota, { size: 8.5, i: true, color: GRIS, align: 'left' });
        y += 2;
      } else if (b.t === 'fotos') {
        var fw = (ANCHO - 6) / 2, fmaxH = 68;
        for (var q = 0; q < b.items.length; q += 2) {
          var par2 = b.items.slice(q, q + 2), alturas = [];
          for (var z = 0; z < par2.length; z++) {
            var f = par2[z];
            if (f.bytes) { var dd = await dims(f.bytes, f.type || 'image/jpeg'); var kk = Math.min(fw / dd.w, fmaxH / dd.h); f._w = dd.w * kk; f._h = dd.h * kk; } else { f._w = fw; f._h = 12; }
            alturas.push(f._h);
          }
          var altoF = Math.max.apply(null, alturas) + 13;
          cabe(altoF);
          for (z = 0; z < par2.length; z++) {
            var ff = par2[z], fx = X0 + z * (fw + 6);
            if (ff.bytes) imagen(ff.bytes, ff.type || 'image/jpeg', ff._w, ff._h, fx + (fw - ff._w) / 2);
            else { fuente(9, 'italic'); tinta(GRIS); doc.text(limpio(ff.falta || T('(Fotografía no disponible)', '(Photograph not available)')), fx + fw / 2, y + 6, { align: 'center', maxWidth: fw }); }
            var yy = y + Math.max.apply(null, alturas) + 4;
            fuente(8.5, 'bold'); tinta('#1d1d1b'); doc.text(envolver(ff.pie || '', fw)[0].t, fx + fw / 2, yy, { align: 'center' });
            if (ff.sub) { fuente(6.2); tinta(GRIS); envolver(ff.sub, fw).slice(0, 2).forEach(function (l, li) { doc.text(l.t, fx + fw / 2, yy + 3.6 + li * 2.6, { align: 'center' }); }); }
          }
          y += altoF + 2;
        }
      } else if (b.t === 'aviso') {
        y += 2;
        parrafo(b.texto, { etiqueta: b.titulo, size: 9.5 });
      } else if (b.t === 'firma') {
        var fi = b.img ? await dims(b.img.bytes, b.img.type) : null;
        var fwd = fi ? Math.min(55, 22 * fi.w / fi.h) : 0, fhd = fi ? fwd * fi.h / fi.w : 0;
        // El texto de cierre va con la firma: la firma nunca queda sola en una página
        fuente(10.5); var lsC = b.texto ? envolver(b.texto, ANCHO) : [];
        cabe(lsC.length * 5.1 + 4 + 14 + (fi ? fhd + 3 : 16) + 16);
        if (lsC.length) { y += 3; tinta('#1d1d1b'); lsC.forEach(function (l) { linea(l, X0, y + 3.7, true); y += 5.1; }); }
        y += 4;
        fuente(10.5); tinta('#1d1d1b'); doc.text(limpio(b.cierre), X0, y + 3.7); y += 7;
        if (fi) { imagen(b.img.bytes, b.img.type, fwd, fhd, X0); y += fhd + 1; } else y += 14;
        var lc2 = color('#1d1d1b'); doc.setDrawColor(lc2[0], lc2[1], lc2[2]); doc.setLineWidth(0.25); doc.line(X0, y, X0 + 70, y); y += 1.5;
        fuente(10.5, 'bold'); doc.text(limpio(b.nombre.toUpperCase()), X0, y + 3.7); y += 5;
        fuente(10.5); doc.text(limpio(b.cargo), X0, y + 3.7); y += 5;
        doc.text(limpio(AP.CFG.empresa), X0, y + 3.7); y += 6;
      } else if (b.t === 'salto') {
        nuevaPagina();
      }
    }
    // Pie de página con el número de página
    var n = doc.getNumberOfPages();
    for (var p = 1; p <= n; p++) {
      doc.setPage(p);
      var lc3 = color(LINEA); doc.setDrawColor(lc3[0], lc3[1], lc3[2]); doc.setLineWidth(0.2); doc.line(X0, PH - 16, X1, PH - 16);
      fuente(8); tinta(GRIS);
      doc.text(limpio(m.clasificacion.split(' — ')[0] + ' | ' + T('Página ', 'Page ') + p + T(' de ', ' of ') + n), PW / 2, PH - 12, { align: 'center' });
      fuente(6.8); doc.text(limpio(m.pieTexto), PW / 2, PH - 8.5, { align: 'center', maxWidth: ANCHO });
    }
    return doc.output('blob');
  }

  // ---------- Descarga con huella en la bitácora ----------
  async function descargar(modelo, formato, nombreBase, bitacora) {
    var blob = formato === 'pdf' ? await aPdf(modelo) : await aWord(modelo);
    var nombre = nombreBase + (modelo.idioma === 'en' ? '_EN' : '') + (formato === 'pdf' ? '.pdf' : '.docx');
    var hash = await U.sha256(blob);
    U.download(blob, nombre);
    try { await AP.Audit.log(bitacora[0], nombre, bitacora[1] + ' · ' + (formato === 'pdf' ? 'PDF' : 'Word') + ' · ' + (modelo.idioma === 'en' ? 'inglés' : 'español'), hash); } catch (e) { /* la bitácora no impide la descarga */ }
    AP.toast((modelo.idioma === 'en' ? 'Informe descargado (inglés): ' : 'Informe descargado: ') + nombre + '. Su huella SHA-256 quedó en la bitácora.', 'info', 7000);
    return { nombre: nombre, hash: hash, blob: blob };
  }

  var CLASIFICACIONES = {
    es: ['CONFIDENCIAL — Uso restringido (Ley 1581 de 2012)', 'RESERVADO — Uso interno de Avo Pak S.A.S.', 'Para autoridad competente — Información reservada (Ley 1581 de 2012)'],
    en: ['CONFIDENTIAL — Restricted use (Colombian Law 1581 of 2012)', 'RESERVED — Internal use of Avo Pak S.A.S.', 'For the competent authority — Reserved information (Colombian Law 1581 of 2012)']
  };

  // ---------- Firma escaneada: carga y vista previa ----------
  // La imagen se recorta al contenido, se reduce y el fondo blanco se vuelve transparente para que no tape el texto
  async function procesarFirma(file) {
    var bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return null; });
    if (!bmp) throw new Error('No fue posible leer la imagen de la firma.');
    var k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    var w = Math.round(bmp.width * k), hh = Math.round(bmp.height * k);
    var c = document.createElement('canvas'); c.width = w; c.height = hh;
    var ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, w, hh);
    var img = ctx.getImageData(0, 0, w, hh), d = img.data;
    var minX = w, minY = hh, maxX = -1, maxY = -1;
    for (var yy = 0; yy < hh; yy++) for (var xx = 0; xx < w; xx++) {
      var p = (yy * w + xx) * 4, lum = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      if (lum > 200) d[p + 3] = 0;                                   // fondo claro → transparente
      else { d[p + 3] = Math.min(255, Math.round((235 - lum) * 2.2)); if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
    }
    if (maxX < 0) throw new Error('La imagen parece estar en blanco. Escanee la firma en tinta oscura sobre papel blanco.');
    ctx.putImageData(img, 0, 0);
    var m = 8; minX = Math.max(0, minX - m); minY = Math.max(0, minY - m); maxX = Math.min(w - 1, maxX + m); maxY = Math.min(hh - 1, maxY + m);
    var cw = maxX - minX + 1, ch = maxY - minY + 1, k2 = Math.min(1, 600 / cw, 240 / ch);
    var o = document.createElement('canvas'); o.width = Math.round(cw * k2); o.height = Math.round(ch * k2);
    o.getContext('2d').drawImage(c, minX, minY, cw, ch, 0, 0, o.width, o.height);
    return new Promise(function (res) { o.toBlob(res, 'image/png'); });
  }
  // Tarjeta para ver, cargar o cambiar la firma escaneada (solo el Director)
  function tarjetaFirma() {
    var box = h('section', { class: 'card stack sm' });
    async function pintar() {
      box.replaceChildren(h('h3', null, 'Firma escaneada para los informes'), AP.spinner('Consultando…'));
      var f = await firma(), url = f ? URL.createObjectURL(new Blob([f.bytes], { type: f.type })) : null;
      box.replaceChildren(
        h('h3', null, 'Firma escaneada para los informes'),
        url ? h('img', { class: 'firma-prev', src: url, alt: 'Firma escaneada' }) : h('p', { class: 'muted small' }, 'Aún no ha cargado su firma: los informes salen con el espacio para firmar a mano.'),
        h('p', { class: 'help' }, 'Firme con tinta oscura sobre papel blanco, escanéela o tómele una foto bien iluminada y cárguela (JPG o PNG). La aplicación recorta los bordes y quita el fondo blanco. La imagen solo la ven usted y quien tenga su usuario.'),
        h('div', { class: 'row gap wrap' }, h('button', { class: 'btn', type: 'button', onclick: cargar }, AP.icon('upload', 18), url ? 'Cambiar la firma' : 'Cargar la firma')));
    }
    async function cargar() {
      var inp = h('input', { type: 'file', accept: 'image/png,image/jpeg', style: { display: 'none' } });
      document.body.appendChild(inp);
      inp.addEventListener('change', async function () {
        var file = inp.files && inp.files[0]; inp.remove();
        if (!file) return;
        try {
          var png = await procesarFirma(file);
          await AP.B.guardarFirma(png);
          await AP.Audit.log('Firma escaneada para informes', AP.Session.user.nombre, 'Carga o cambio de la firma escaneada', await U.sha256(png));
          AP.toast('Firma guardada. Saldrá en los informes que genere desde ahora.');
          pintar();
        } catch (e) { AP.toast(e.message, 'error', 8000); }
      });
      inp.click();
    }
    pintar();
    return box;
  }

  AP.Informe = {
    tr: tr, fechaLarga: fechaLarga, fechaHora: fechaHora, nombreMes: nombreMes, word: aWord, pdf: aPdf, descargar: descargar, firma: firma,
    cargo: cargo, cargoEn: cargoEn, CLASIFICACIONES: CLASIFICACIONES, tarjetaFirma: tarjetaFirma, procesarFirma: procesarFirma, jsPDF: jsPDF
  };
})();
