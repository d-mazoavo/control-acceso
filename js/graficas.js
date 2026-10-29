/* Gráficas para los informes (Word y PDF) dibujadas en un lienzo: columnas, barras horizontales y líneas.
 * Se generan como imágenes PNG nítidas (doble resolución) para insertarlas en el documento y mostrarlas en pantalla.
 * Colores validados (paleta categórica de referencia, contraste y daltonismo): serie 1 azul, serie 2 naranja; el texto
 * nunca usa el color de la serie; cuadrícula y ejes discretos; leyenda cuando hay dos series. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});

  var C = {
    fondo: '#ffffff', tinta: '#1d1d1b', tinta2: '#52514e', tenue: '#7a7a74', rejilla: '#e4e5e0', eje: '#b9bbb3',
    s1: '#2a78d6', s2: '#eb6834', meta: '#52514e'
  };
  var FUENTE = 'Arial, Helvetica, sans-serif';
  var K = 2; // doble resolución

  function lienzo(w, hh) {
    var c = document.createElement('canvas');
    c.width = w * K; c.height = hh * K;
    c._w = w; c._h = hh;
    var ctx = c.getContext('2d');
    ctx.scale(K, K);
    ctx.fillStyle = C.fondo; ctx.fillRect(0, 0, w, hh);
    ctx.textBaseline = 'middle';
    return { c: c, ctx: ctx };
  }
  function fuente(ctx, px, peso) { ctx.font = (peso || '') + ' ' + px + 'px ' + FUENTE; }
  function num(n, dec) {
    var v = Number(n) || 0;
    return v.toLocaleString('es-CO', { maximumFractionDigits: dec == null ? (Math.abs(v) < 10 && v % 1 ? 1 : 0) : dec });
  }
  function recortar(ctx, t, max) {
    t = String(t == null ? '' : t);
    if (ctx.measureText(t).width <= max) return t;
    while (t.length > 2 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t + '…';
  }
  // Escala "redonda" para el eje
  function escala(max) {
    if (!(max > 0)) return { tope: 1, paso: 1 };
    var bruto = max / 4, mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    var paso = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).find(function (p) { return p >= bruto; }) || 10 * mag;
    if (paso < 1 && max >= 1) paso = 1;
    return { tope: Math.ceil(max / paso) * paso, paso: paso };
  }
  // Rectángulo con las esquinas del extremo de datos redondeadas (4 px), anclado a la línea base
  function barra(ctx, x, y, w, hh, extremo) {
    var r = Math.max(0, Math.min(4, w / 2, hh / 2));
    ctx.beginPath();
    if (extremo === 'arriba') {
      ctx.moveTo(x, y + hh); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + hh);
    } else {
      ctx.moveTo(x, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + hh - r); ctx.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh); ctx.lineTo(x, y + hh);
    }
    ctx.closePath(); ctx.fill();
  }
  function ejeY(ctx, x0, x1, y0, y1, esc, unidad) {
    fuente(ctx, 11);
    ctx.textAlign = 'right';
    for (var v = 0; v <= esc.tope + 1e-9; v += esc.paso) {
      var y = y1 - (v / esc.tope) * (y1 - y0);
      ctx.strokeStyle = v === 0 ? C.eje : C.rejilla; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke();
      ctx.fillStyle = C.tenue; ctx.fillText(num(v) + (unidad === '%' ? ' %' : ''), x0 - 6, y);
    }
  }

  var G = {
    colores: C,
    // Columnas verticales de una serie. items: [{ x: etiqueta corta, n }]; opt: { unidad, alto, ancho, etiquetaCada, color }
    columnas: function (items, opt) {
      opt = opt || {};
      var W = opt.ancho || 900, H = opt.alto || 300;
      var L = lienzo(W, H), ctx = L.ctx;
      var x0 = 46, x1 = W - 12, y0 = 16, y1 = H - 30;
      var max = Math.max.apply(null, items.map(function (i) { return Number(i.n) || 0; }).concat([0]));
      var esc = escala(max);
      ejeY(ctx, x0, x1, y0, y1, esc, opt.unidad);
      var n = items.length || 1, paso = (x1 - x0) / n, w = Math.max(2, paso - Math.max(2, paso * 0.28));
      var cada = opt.etiquetaCada || Math.ceil(n / 16);
      var maxI = -1; items.forEach(function (it, i) { if (maxI < 0 || (Number(it.n) || 0) > (Number(items[maxI].n) || 0)) maxI = i; });
      items.forEach(function (it, i) {
        var v = Number(it.n) || 0, x = x0 + i * paso + (paso - w) / 2, hh = esc.tope ? (v / esc.tope) * (y1 - y0) : 0;
        ctx.fillStyle = opt.color || C.s1;
        if (hh > 0) barra(ctx, x, y1 - hh, w, hh, 'arriba');
        fuente(ctx, 10.5); ctx.fillStyle = C.tenue; ctx.textAlign = 'center';
        if (i % cada === 0 || i === n - 1) ctx.fillText(String(it.x), x + w / 2, y1 + 14);
        // Rótulo selectivo: solo el valor máximo
        if (i === maxI && v > 0) { fuente(ctx, 11, 'bold'); ctx.fillStyle = C.tinta; ctx.fillText(num(v), x + w / 2, y1 - hh - 9); }
      });
      return L.c;
    },
    // Barras horizontales de una serie, ordenadas. items: [{ k, n }]; opt: { unidad, max (cuántas), ancho, color }
    barrasH: function (items, opt) {
      opt = opt || {};
      var l = items.slice(0, opt.max || 10);
      var W = opt.ancho || 900, fila = 30, H = Math.max(90, 18 + l.length * fila + 10);
      var L = lienzo(W, H), ctx = L.ctx;
      fuente(ctx, 12);
      var anchoEtq = Math.min(W * 0.4, Math.max.apply(null, l.map(function (i) { return ctx.measureText(String(i.k)).width; }).concat([60])) + 12);
      var x0 = anchoEtq + 8, x1 = W - 70, y = 14;
      var max = Math.max.apply(null, l.map(function (i) { return Number(i.n) || 0; }).concat([0])) || 1;
      ctx.strokeStyle = C.eje; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0 + 0.5, 8); ctx.lineTo(x0 + 0.5, H - 8); ctx.stroke();
      l.forEach(function (it) {
        var v = Number(it.n) || 0, w = (v / max) * (x1 - x0);
        fuente(ctx, 12); ctx.fillStyle = C.tinta2; ctx.textAlign = 'right';
        ctx.fillText(recortar(ctx, it.k, anchoEtq - 6), x0 - 8, y + fila / 2 - 2);
        ctx.fillStyle = opt.color || C.s1;
        if (w > 0) barra(ctx, x0 + 1, y + 4, Math.max(3, w), fila - 12, 'derecha');
        fuente(ctx, 12, 'bold'); ctx.fillStyle = C.tinta; ctx.textAlign = 'left';
        ctx.fillText(num(v) + (opt.unidad ? ' ' + opt.unidad : ''), x0 + Math.max(3, w) + 8, y + fila / 2 - 2);
        y += fila;
      });
      return L.c;
    },
    // Líneas (1 o 2 series). x: [etiquetas]; series: [{ nombre, valores: [n|null], color }]; opt: { unidad, meta: { valor, etiqueta }, tope, alto, ancho }
    lineas: function (x, series, opt) {
      opt = opt || {};
      var W = opt.ancho || 900, H = opt.alto || 300;
      var L = lienzo(W, H), ctx = L.ctx;
      var leyenda = series.length > 1;
      var x0 = 48, x1 = W - 90, y0 = leyenda ? 34 : 16, y1 = H - 30;
      var max = 0;
      series.forEach(function (s) { s.valores.forEach(function (v) { if (v != null && v > max) max = v; }); });
      if (opt.meta && opt.meta.valor > max) max = opt.meta.valor;
      var esc = opt.tope ? { tope: opt.tope, paso: opt.tope / 4 } : escala(max);
      ejeY(ctx, x0, x1, y0, y1, esc, opt.unidad);
      var n = x.length, px = function (i) { return n > 1 ? x0 + (i / (n - 1)) * (x1 - x0) : (x0 + x1) / 2; };
      var py = function (v) { return y1 - (Math.min(v, esc.tope) / esc.tope) * (y1 - y0); };
      fuente(ctx, 10.5); ctx.fillStyle = C.tenue; ctx.textAlign = 'center';
      var cada = Math.ceil(n / 16);
      x.forEach(function (t, i) { if (i % cada === 0 || i === n - 1) ctx.fillText(String(t), px(i), y1 + 14); });
      if (opt.meta) {
        var ym = py(opt.meta.valor);
        ctx.setLineDash([5, 4]); ctx.strokeStyle = C.meta; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, ym); ctx.lineTo(x1, ym); ctx.stroke(); ctx.setLineDash([]);
        fuente(ctx, 11); ctx.fillStyle = C.tinta2; ctx.textAlign = 'left'; ctx.fillText(opt.meta.etiqueta || '', x1 + 6, ym);
      }
      series.forEach(function (s, si) {
        var col = s.color || (si ? C.s2 : C.s1);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        var abierto = false, ultimo = -1;
        s.valores.forEach(function (v, i) {
          if (v == null) { abierto = false; return; }
          if (!abierto) { ctx.moveTo(px(i), py(v)); abierto = true; } else ctx.lineTo(px(i), py(v));
          ultimo = i;
        });
        ctx.stroke();
        // Marcador y rótulo directo al final de cada serie (anillo del color de fondo)
        if (ultimo >= 0) {
          var xv = px(ultimo), yv = py(s.valores[ultimo]);
          ctx.fillStyle = C.fondo; ctx.beginPath(); ctx.arc(xv, yv, 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(xv, yv, 4.5, 0, Math.PI * 2); ctx.fill();
          if (!opt.meta || series.length > 1) {
            fuente(ctx, 11, 'bold'); ctx.fillStyle = C.tinta; ctx.textAlign = 'left';
            ctx.fillText(num(s.valores[ultimo]) + (opt.unidad === '%' ? ' %' : ''), xv + 9, yv + (si ? 9 : -9) * (series.length > 1 ? 1 : 0));
          }
        }
      });
      if (leyenda) {
        var lx = x0;
        series.forEach(function (s, si) {
          var col = s.color || (si ? C.s2 : C.s1);
          ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx, 14); ctx.lineTo(lx + 22, 14); ctx.stroke();
          fuente(ctx, 12); ctx.fillStyle = C.tinta2; ctx.textAlign = 'left'; ctx.fillText(s.nombre, lx + 28, 14);
          lx += 40 + ctx.measureText(s.nombre).width + 18;
        });
      }
      return L.c;
    },
    // PNG del lienzo: { bytes, w, h } (w y h lógicos, para conservar la proporción en el documento)
    png: function (canvas) {
      return new Promise(function (res, rej) {
        canvas.toBlob(function (b) {
          if (!b) return rej(new Error('No fue posible dibujar la gráfica.'));
          b.arrayBuffer().then(function (ab) { res({ bytes: new Uint8Array(ab), w: canvas._w, h: canvas._h, url: URL.createObjectURL(b) }); }, rej);
        }, 'image/png');
      });
    }
  };
  AP.Graf = G;
})();
