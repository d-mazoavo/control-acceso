/* Gráficas sencillas en HTML (barras horizontales y columnas, simples o apiladas) con información al pasar el cursor.
 * Colores por función: una sola serie usa un solo tono; las series apiladas usan el orden fijo validado
 * (día = naranja, noche = azul, domingo/festivo = aguamarina). El texto nunca usa el color de la serie. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var h = AP.h;

  var tip = null;
  function asegurarTip() {
    if (!tip || !document.body.contains(tip)) { tip = h('div', { class: 'viz-tip', role: 'tooltip' }); document.body.appendChild(tip); }
    return tip;
  }
  // filas: [[valor, texto, claveColor]]
  function tooltip(el, filas) {
    function mostrar() {
      var t = asegurarTip();
      t.replaceChildren.apply(t, filas.map(function (f) { return h('div', { class: 'viz-tip-row' }, f[2] ? h('i', { class: 'viz-key viz-' + f[2] }) : null, h('strong', null, f[0]), h('span', null, f[1])); }));
      t.style.display = 'block';
    }
    function mover(e) {
      if (!tip) return;
      var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8), y = Math.max(8, e.clientY - tip.offsetHeight - 10);
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }
    function ocultar() { if (tip) tip.style.display = 'none'; }
    el.addEventListener('pointerenter', mostrar);
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerleave', ocultar);
    el.addEventListener('focus', function () { mostrar(); var r = el.getBoundingClientRect(); mover({ clientX: r.left + r.width / 2, clientY: r.top }); });
    el.addEventListener('blur', ocultar);
  }
  function limpiar() { if (tip) { tip.remove(); tip = null; } }

  function fmt(n, dec) {
    var d = dec == null ? (Math.abs(n) % 1 ? 1 : 0) : dec;
    return Number(n || 0).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function leyenda(series) {
    return h('div', { class: 'viz-legend' }, series.map(function (s) { return h('span', null, h('i', { class: 'viz-sw viz-' + s.k }), s.n); }));
  }
  function ticksDe(max) {
    if (max <= 5) { var a = []; for (var i = 0; i <= max; i++) a.push(i); return a; }
    var paso = Math.pow(10, Math.floor(Math.log10(max / 4)));
    [1, 2, 2.5, 5, 10].some(function (m) { if (max / (paso * m) <= 5) { paso = paso * m; return true; } return false; });
    var out = [];
    for (var t = 0; t <= max + 1e-9; t += paso) out.push(Math.round(t * 100) / 100);
    return out;
  }

  // Barras horizontales: datos = [{ label, valores: { k: n }, extra }], series = [{ k, n }]
  function hbars(datos, series, opt) {
    opt = opt || {};
    var max = Math.max.apply(null, datos.map(function (d) { return series.reduce(function (a, s) { return a + (d.valores[s.k] || 0); }, 0); }).concat([1]));
    var unidad = opt.unidad || '';
    return h('div', { class: 'viz-hbars' + (opt.alto ? ' alto' : '') }, datos.map(function (d) {
      var total = series.reduce(function (a, s) { return a + (d.valores[s.k] || 0); }, 0);
      var barra = h('div', { class: 'viz-track' });
      series.forEach(function (s) {
        var v = d.valores[s.k] || 0;
        if (!v) return;
        var seg = h('span', { class: 'viz-seg viz-' + s.k, style: { width: (v / max * 100) + '%' }, tabindex: '0', 'aria-label': d.label + ': ' + fmt(v) + ' ' + unidad + (series.length > 1 ? ' ' + s.n.toLowerCase() : '') });
        tooltip(seg, [[d.label, '']].concat(series.length > 1 ? series.filter(function (z) { return d.valores[z.k]; }).map(function (z) { return [fmt(d.valores[z.k]) + ' ' + unidad, z.n, z.k]; }) : [[fmt(v) + ' ' + unidad, opt.serie || '', s.k]]).concat(d.extra ? [[d.extra, '']] : []));
        barra.appendChild(seg);
      });
      return h('div', { class: 'viz-hrow' }, h('span', { class: 'viz-lab', title: d.label }, d.label), barra, h('span', { class: 'viz-val' }, fmt(total) + (unidad ? ' ' + unidad : '')));
    }));
  }

  // Columnas en el tiempo: datos = [{ x (etiqueta corta), titulo, valores: { k: n } }]
  function cols(datos, series, opt) {
    opt = opt || {};
    var n = datos.length || 1;
    var max = Math.max.apply(null, datos.map(function (d) { return series.reduce(function (a, s) { return a + (d.valores[s.k] || 0); }, 0); }).concat([1]));
    var ticks = ticksDe(max), top = ticks[ticks.length - 1] || max;
    var cada = n <= 16 ? 1 : n <= 40 ? 2 : Math.ceil(n / 16);
    return h('div', { class: 'viz-cols', style: { gridTemplateColumns: 'repeat(' + n + ', minmax(0, 1fr))' } },
      h('div', { class: 'viz-grid' }, ticks.map(function (tk) { return h('div', { class: 'viz-gl', style: { bottom: (tk / top * 100) + '%' } }, h('small', null, fmt(tk, tk % 1 ? 1 : 0))); })),
      datos.map(function (d, i) {
        var total = series.reduce(function (a, s) { return a + (d.valores[s.k] || 0); }, 0);
        var col = h('div', { class: 'viz-col', tabindex: '0', 'aria-label': (d.titulo || d.x) + ': ' + fmt(total) + ' ' + (opt.unidad || '') },
          h('div', { class: 'viz-stack' }, series.slice().reverse().map(function (s) {
            var v = d.valores[s.k] || 0;
            return v ? h('span', { class: 'viz-seg viz-' + s.k, style: { height: (v / top * 100) + '%' } }) : null;
          })),
          h('small', { class: 'viz-x' }, i % cada === 0 ? d.x : ''));
        tooltip(col, [[d.titulo || d.x, '']].concat(series.map(function (s) { return [fmt(d.valores[s.k] || 0) + ' ' + (opt.unidad || ''), series.length > 1 ? s.n : (opt.serie || ''), s.k]; })));
        return col;
      }));
  }

  // Tabla con los mismos datos de la gráfica (alternativa accesible)
  function tablaDe(titulo, cab, filas) {
    return h('details', { class: 'viz-tabla' }, h('summary', null, titulo || 'Ver la tabla de datos'),
      h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, cab.map(function (c) { return h('th', null, c); }))),
        h('tbody', null, filas.map(function (f) { return h('tr', null, f.map(function (v) { return h('td', null, v == null ? '' : String(v)); })); })))));
  }

  AP.Viz = { tooltip: tooltip, limpiar: limpiar, leyenda: leyenda, hbars: hbars, cols: cols, tablaDe: tablaDe, fmt: fmt };
})();
