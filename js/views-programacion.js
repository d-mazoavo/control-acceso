/* Programación mensual del servicio de vigilancia y rondas (día, noche, descanso), con gráficas y descarga en Excel.
 * Registra la programación que remite la empresa contratista para verificar el cubrimiento de los puestos:
 * la programación, las órdenes y la supervisión de su personal corresponden al contratista (art. 23 y 34 CST). */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  var NOMBRE = { D: 'Día', N: 'Noche', X: 'Descanso' };
  var LETRA_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // getUTCDay: 0 = domingo
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function diasMes(mes) { var p = mes.split('-'); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); }
  function dow(mes, d) { return new Date(mes + '-' + String(d).padStart(2, '0') + 'T12:00:00-05:00').getUTCDay(); }
  function nombreMes(mes) { var p = mes.split('-'); return MESES[+p[1] - 1] + ' de ' + p[0]; }
  function capital(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function mesMas(mes, n) { var p = mes.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1 + n, 1)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
  function horas(desde, hasta) {
    var a = AP.Horario.toMin(desde), b = AP.Horario.toMin(hasta);
    if (a == null || b == null) return 0;
    var m = b - a; if (m <= 0) m += 1440;
    return m / 60;
  }
  function errBox(e) { return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con el servidor' : 'No fue posible cargar la información', e && e.message); }

  AP.route('/consola/programacion', function (qs) {
    if (!AP.Session.can('ver')) { AP.go('/'); return; }
    var ED = AP.Session.can('editar');   // Gobierno Corporativo: solo consulta
    var mes = /^\d{4}-\d{2}$/.test(qs.m || '') ? qs.m : U.ymd().slice(0, 7);
    var N = diasMes(mes);
    var content = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    var sucio = false;
    var estadoGuardado = h('span', { class: 'muted small' });
    var guardarBtn = h('button', { class: 'btn primary', type: 'button', onclick: function () { guardar(); } }, AP.icon('check', 18), 'Guardar programación');
    AP.consolaShell('/consola/programacion', 'Programación de vigilantes y ronderos', content, ED ? [estadoGuardado, guardarBtn] : [AP.pill('Solo consulta', 'muted')]);
    AP.onLeave(function () { if (sucio) AP.toast('La programación de ' + nombreMes(mes) + ' tenía cambios sin guardar.', 'warn', 7000); });

    var doc = null;          // registro AP_Programacion del mes
    var filas = [];          // { id, nombre, usuario, rol, empresa, doc, baja, dias: [] }
    var cfg = { hDiaDesde: '06:00', hDiaHasta: '18:00', hNocheDesde: '18:00', hNocheHasta: '06:00', reqDia: 0, reqNoche: 0, soporte: '', obs: '' };
    var pincel = 'D';

    function marcarSucio(v) {
      sucio = v !== false;
      estadoGuardado.textContent = sucio ? 'Cambios sin guardar' : (doc && doc._modified ? 'Guardado ' + U.fDateTime(doc._modified) : '');
      estadoGuardado.className = sucio ? 'txt-warn small' : 'muted small';
    }

    async function cargar() {
      try {
        var r = await Promise.all([AP.B.listAll('AP_Vigilantes'), AP.B.findBy('AP_Programacion', 'Mes', mes)]);
        var usuarios = r[0];
        doc = r[1].filter(function (x) { return !x._borrado; })[0] || null;
        var guardado = { personas: [] };
        if (doc) {
          try { guardado = JSON.parse(doc.Datos || '{}') || {}; } catch (e) { guardado = {}; }
          var hd = String(doc.HorarioDia || '').split('-'), hn = String(doc.HorarioNoche || '').split('-');
          if (hd.length === 2) { cfg.hDiaDesde = hd[0]; cfg.hDiaHasta = hd[1]; }
          if (hn.length === 2) { cfg.hNocheDesde = hn[0]; cfg.hNocheHasta = hn[1]; }
          cfg.soporte = doc.Soporte || ''; cfg.obs = doc.Observaciones || '';
          cfg.reqDia = Number(guardado.requeridoDia) || 0; cfg.reqNoche = Number(guardado.requeridoNoche) || 0;
        }
        var porId = {};
        (guardado.personas || []).forEach(function (p) { porId[p.id] = p; });
        filas = usuarios.filter(function (v) { return AP.CAT.rolesProgramables.indexOf(v.Rol) >= 0 && (v.Activo !== false || porId[v.id]); })
          .map(function (v) {
            var g = porId[v.id], dias = [];
            for (var d = 0; d < N; d++) dias.push(g && g.dias && /[DNX]/.test(g.dias[d] || '') ? g.dias[d] : '');
            return { id: v.id, nombre: v.Title, usuario: v.Usuario, rol: v.Rol, empresa: v.Empresa, doc: v.NumDoc, baja: v.Activo === false, dias: dias };
          })
          .sort(function (a, b) { return (a.rol === 'Rondero') - (b.rol === 'Rondero') || String(a.nombre).localeCompare(String(b.nombre), 'es'); });
        pintar();
        marcarSucio(false);
      } catch (e) { content.replaceChildren(errBox(e)); }
    }

    // ---------- Cálculos ----------
    function hD() { return horas(cfg.hDiaDesde, cfg.hDiaHasta); }
    function hN() { return horas(cfg.hNocheDesde, cfg.hNocheHasta); }
    function totales(f) {
      var t = { D: 0, N: 0, X: 0 };
      f.dias.forEach(function (c) { if (t[c] != null) t[c]++; });
      t.horas = t.D * hD() + t.N * hN();
      // Máximo de horas en una semana (lunes a domingo) dentro del mes
      var sem = {}, max = 0;
      f.dias.forEach(function (c, i) {
        var d = i + 1, w = dow(mes, d), lunes = d - ((w + 6) % 7);
        sem[lunes] = (sem[lunes] || 0) + (c === 'D' ? hD() : c === 'N' ? hN() : 0);
      });
      Object.keys(sem).forEach(function (k) { if (sem[k] > max) max = sem[k]; });
      t.maxSemana = max;
      return t;
    }
    function cobertura() {
      var out = [];
      for (var i = 0; i < N; i++) {
        var c = { dia: i + 1, D: 0, N: 0, X: 0 };
        filas.forEach(function (f) { if (c[f.dias[i]] != null) c[f.dias[i]]++; });
        c.faltaD = cfg.reqDia > 0 && c.D < cfg.reqDia; c.faltaN = cfg.reqNoche > 0 && c.N < cfg.reqNoche;
        out.push(c);
      }
      return out;
    }
    function fmtH(x) { return (Math.round(x * 10) / 10).toLocaleString('es-CO'); }

    // ---------- Pantalla ----------
    var gridBox = h('div'), resumenBox = h('div', { class: 'stack' });
    function pintar() {
      var mesIn = AP.input('mes', mes, { type: 'month', 'aria-label': 'Mes' });
      mesIn.addEventListener('change', function () { if (/^\d{4}-\d{2}$/.test(mesIn.value)) ir(mesIn.value); });
      var seg = AP.segmented('pincel', [
        { value: 'D', label: 'Día', cls: 'pg-seg-D' }, { value: 'N', label: 'Noche', cls: 'pg-seg-N' },
        { value: 'X', label: 'Descanso', cls: 'pg-seg-X' }, { value: '', label: 'Borrar' }
      ], pincel, function (v) { pincel = v; });
      function ti(k) {
        var i = AP.input(k, cfg[k], { type: 'time' });
        i.addEventListener('change', function () { cfg[k] = i.value; marcarSucio(); pintarGrid(); pintarResumen(); });
        return i;
      }
      function num(k) {
        var i = AP.input(k, cfg[k] || '', { type: 'number', min: 0, max: 99, inputmode: 'numeric', placeholder: '0' });
        i.addEventListener('input', function () { cfg[k] = Math.max(0, parseInt(i.value, 10) || 0); marcarSucio(); pintarGrid(); pintarResumen(); });
        return i;
      }
      var soporte = AP.input('soporte', cfg.soporte, { placeholder: 'Ej.: correo del supervisor de la empresa de vigilancia del 25/10/2026' });
      soporte.addEventListener('input', function () { cfg.soporte = soporte.value; marcarSucio(); });
      var obs = AP.textarea('obs', cfg.obs, { rows: 2, placeholder: 'Observaciones (novedades de la programación, reemplazos informados por el contratista…)' });
      obs.addEventListener('input', function () { cfg.obs = obs.value; marcarSucio(); });
      content.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('shield', 18), h('span', null,
          'Registre aquí la programación que remite la empresa contratista (vigilantes y ronderos) para verificar el cubrimiento de los puestos día y noche. ' +
          'La programación, las órdenes y la supervisión de ese personal corresponden al contratista y a su supervisor; las modificaciones se tramitan por su conducto y se anotan como soporte.')),
        h('div', { class: 'filters' },
          h('button', { class: 'btn', type: 'button', 'aria-label': 'Mes anterior', onclick: function () { ir(mesMas(mes, -1)); } }, AP.icon('back', 18)),
          mesIn,
          h('button', { class: 'btn', type: 'button', 'aria-label': 'Mes siguiente', onclick: function () { ir(mesMas(mes, 1)); } }, h('span', { style: { display: 'inline-block', transform: 'scaleX(-1)' } }, AP.icon('back', 18))),
          h('strong', { class: 'pg-mes' }, capital(nombreMes(mes))),
          h('span', { class: 'grow' }),
          ED ? h('button', { class: 'btn', type: 'button', onclick: function () { patron(null); } }, AP.icon('calendar', 18), 'Aplicar patrón') : null,
          AP.btnExcel(exportarExcel, 'Excel del mes')),
        h('section', { class: 'card stack sm' },
          h('div', { class: 'pg-cfg' },
            AP.field('Turno de día', h('div', { class: 'row gap nowrap' }, ti('hDiaDesde'), h('span', null, 'a'), ti('hDiaHasta'))),
            AP.field('Turno de noche', h('div', { class: 'row gap nowrap' }, ti('hNocheDesde'), h('span', null, 'a'), ti('hNocheHasta'))),
            AP.field('Personas requeridas de día', num('reqDia'), 'Para alertar días sin cubrimiento.'),
            AP.field('Personas requeridas de noche', num('reqNoche')),
            AP.field('Soporte de la programación', soporte, null, 'span2'),
            AP.field('Observaciones', obs, null, 'span2'))),
        h('section', { class: 'card stack sm' },
          h('div', { class: 'row between wrap gap' },
            ED ? h('div', { class: 'row gap wrap' }, h('strong', null, 'Pincel:'), seg) : h('span'),
            h('small', { class: 'muted' }, 'Elija el turno y haga clic (o arrastre) sobre los días. Clic en el nombre para aplicar un patrón a esa persona.')),
          gridBox),
        resumenBox);
      pintarGrid();
      pintarResumen();
      if (!ED) content.querySelectorAll('.pg-cfg input, .pg-cfg textarea, .pg-cfg select').forEach(function (el) { el.disabled = true; });
    }
    async function ir(m) {
      if (sucio && !(await AP.confirm('Cambios sin guardar', 'Hay cambios sin guardar en la programación de ' + nombreMes(mes) + '. ¿Cambiar de mes sin guardarlos?', 'Cambiar sin guardar', 'danger'))) return;
      sucio = false;
      AP.go('/consola/programacion?m=' + m);
    }

    // ---------- Cuadrícula ----------
    var pintando = false;
    var soltar = function () { pintando = false; };
    document.addEventListener('pointerup', soltar);
    AP.onLeave(function () { document.removeEventListener('pointerup', soltar); });
    function pintarCelda(btn) {
      if (!ED) return;
      var f = filas[+btn.dataset.r], i = +btn.dataset.d;
      if (!f || f.dias[i] === pincel) return;
      f.dias[i] = pincel;
      btn.textContent = pincel || '·';
      btn.className = 'pg-c' + (pincel ? ' pg-' + pincel : '') + (btn.dataset.fds ? ' fds' : '');
      btn.setAttribute('aria-label', f.nombre + ', día ' + (i + 1) + ': ' + (NOMBRE[pincel] || 'sin programar'));
      marcarSucio();
      actualizarTotales(+btn.dataset.r);
      programarResumen();
    }
    var tResumen = null;
    function programarResumen() { clearTimeout(tResumen); tResumen = setTimeout(function () { pintarResumen(); pintarCobertura(); }, 250); }
    function actualizarTotales(r) {
      var t = totales(filas[r]);
      var tr = gridBox.querySelector('tr[data-r="' + r + '"]');
      if (!tr) return;
      tr.querySelector('.pg-tD').textContent = t.D; tr.querySelector('.pg-tN').textContent = t.N; tr.querySelector('.pg-tX').textContent = t.X;
      tr.querySelector('.pg-th').textContent = fmtH(t.horas); tr.querySelector('.pg-tm').textContent = fmtH(t.maxSemana);
    }
    function pintarCobertura() {
      var cob = cobertura();
      cob.forEach(function (c, i) {
        var a = gridBox.querySelector('[data-cd="' + i + '"]'), b = gridBox.querySelector('[data-cn="' + i + '"]');
        if (a) { a.textContent = c.D; a.className = 'pg-cob' + (c.faltaD ? ' falta' : ''); }
        if (b) { b.textContent = c.N; b.className = 'pg-cob' + (c.faltaN ? ' falta' : ''); }
      });
    }
    function pintarGrid() {
      if (!filas.length) {
        gridBox.replaceChildren(AP.empty('users', 'No hay vigilantes, supervisores ni ronderos activos', 'Créelos en Usuarios con el rol correspondiente para programarlos.', h('a', { class: 'btn', href: '#/consola/vigilantes' }, 'Ir a Usuarios')));
        return;
      }
      var cab = [h('th', { class: 'pg-nom' }, 'Persona')];
      for (var d = 1; d <= N; d++) {
        var w = dow(mes, d);
        cab.push(h('th', { class: 'pg-d' + (w === 0 || w === 6 ? ' fds' : '') }, h('small', null, LETRA_DIA[w]), String(d)));
      }
      cab.push(h('th', null, 'D'), h('th', null, 'N'), h('th', null, 'X'), h('th', { title: 'Horas programadas en el mes' }, 'Horas'), h('th', { title: 'Máximo de horas programadas en una semana (lunes a domingo)' }, 'Máx. h/sem'));
      var cob = cobertura();
      var cuerpo = filas.map(function (f, r) {
        var t = totales(f);
        var tds = [h('th', { class: 'pg-nom', scope: 'row' },
          h('button', { class: 'linkish', type: 'button', title: 'Aplicar un patrón a ' + f.nombre, onclick: function () { patron(r); } }, f.nombre),
          h('small', { class: 'block muted' }, f.rol + (f.baja ? ' · de baja' : '')))];
        f.dias.forEach(function (c, i) {
          var w = dow(mes, i + 1), fds = w === 0 || w === 6;
          tds.push(h('td', { class: 'pg-td' }, h('button', {
            type: 'button', class: 'pg-c' + (c ? ' pg-' + c : '') + (fds ? ' fds' : ''), dataset: Object.assign({ r: String(r), d: String(i) }, fds ? { fds: '1' } : {}),
            'aria-label': f.nombre + ', día ' + (i + 1) + ': ' + (NOMBRE[c] || 'sin programar')
          }, c || '·')));
        });
        tds.push(h('td', { class: 'pg-tot pg-tD' }, String(t.D)), h('td', { class: 'pg-tot pg-tN' }, String(t.N)), h('td', { class: 'pg-tot pg-tX' }, String(t.X)),
          h('td', { class: 'pg-tot pg-th' }, fmtH(t.horas)), h('td', { class: 'pg-tot pg-tm' }, fmtH(t.maxSemana)));
        return h('tr', { dataset: { r: String(r) } }, tds);
      });
      var pieD = [h('th', { class: 'pg-nom', scope: 'row' }, 'Personas de día')], pieN = [h('th', { class: 'pg-nom', scope: 'row' }, 'Personas de noche')];
      cob.forEach(function (c, i) {
        pieD.push(h('td', { class: 'pg-cob' + (c.faltaD ? ' falta' : ''), dataset: { cd: String(i) } }, String(c.D)));
        pieN.push(h('td', { class: 'pg-cob' + (c.faltaN ? ' falta' : ''), dataset: { cn: String(i) } }, String(c.N)));
      });
      [pieD, pieN].forEach(function (p) { p.push(h('td', { colspan: 5 })); });
      var tabla = h('table', { class: 'pg-grid' }, h('thead', null, h('tr', null, cab)), h('tbody', null, cuerpo), h('tfoot', null, h('tr', null, pieD), h('tr', null, pieN)));
      tabla.addEventListener('pointerdown', function (e) {
        var b = e.target.closest('.pg-c'); if (!b) return;
        e.preventDefault(); pintando = true; pintarCelda(b);
      });
      tabla.addEventListener('pointerover', function (e) { if (!pintando) return; var b = e.target.closest('.pg-c'); if (b) pintarCelda(b); });
      tabla.addEventListener('click', function (e) { var b = e.target.closest('.pg-c'); if (b && e.detail === 0) pintarCelda(b); }); // teclado
      gridBox.replaceChildren(h('div', { class: 'pg-scroll' }, tabla),
        h('div', { class: 'row gap wrap pg-ley' }, ['D', 'N', 'X'].map(function (k) { return h('span', null, h('i', { class: 'pg-c pg-' + k }, k), ' ' + NOMBRE[k]); }),
          h('span', { class: 'muted small' }, 'Turno de día: ' + cfg.hDiaDesde + ' a ' + cfg.hDiaHasta + ' (' + fmtH(hD()) + ' h) · noche: ' + cfg.hNocheDesde + ' a ' + cfg.hNocheHasta + ' (' + fmtH(hN()) + ' h)')));
    }

    // ---------- Gráficas ----------
    var tip = null;
    function tooltip(el, filasTxt) {
      el.addEventListener('pointerenter', function () {
        if (!tip) { tip = h('div', { class: 'viz-tip', role: 'tooltip' }); document.body.appendChild(tip); }
        tip.replaceChildren.apply(tip, filasTxt.map(function (f) { return h('div', { class: 'viz-tip-row' }, f[2] ? h('i', { class: 'viz-key viz-' + f[2] }) : null, h('strong', null, f[0]), h('span', null, f[1])); }));
        tip.style.display = 'block';
      });
      el.addEventListener('pointermove', function (e) {
        if (!tip) return;
        var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8), y = Math.max(8, e.clientY - tip.offsetHeight - 10);
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
      });
      el.addEventListener('pointerleave', function () { if (tip) tip.style.display = 'none'; });
    }
    AP.onLeave(function () { if (tip) { tip.remove(); tip = null; } });
    function leyenda() {
      return h('div', { class: 'viz-legend' }, [['D', 'Día'], ['N', 'Noche'], ['X', 'Descanso']].map(function (k) { return h('span', null, h('i', { class: 'viz-sw viz-' + k[0] }), k[1]); }));
    }
    function pintarResumen() {
      if (!filas.length) { resumenBox.replaceChildren(); return; }
      // 1) Turnos por persona: barras apiladas día / noche / descanso
      var porPersona = h('div', { class: 'viz-hbars' }, filas.map(function (f) {
        var t = totales(f);
        var barra = h('div', { class: 'viz-track' });
        [['D', t.D], ['N', t.N], ['X', t.X]].forEach(function (s) {
          if (!s[1]) return;
          var seg = h('span', { class: 'viz-seg viz-' + s[0], style: { width: (s[1] / N * 100) + '%' }, tabindex: '0', 'aria-label': f.nombre + ': ' + s[1] + ' ' + NOMBRE[s[0]].toLowerCase() });
          tooltip(seg, [[String(s[1]) + ' ' + (s[1] === 1 ? 'turno' : 'turnos'), NOMBRE[s[0]], s[0]], [fmtH(t.horas) + ' h', 'programadas en el mes']]);
          barra.appendChild(seg);
        });
        return h('div', { class: 'viz-hrow' }, h('span', { class: 'viz-lab' }, f.nombre), barra,
          h('span', { class: 'viz-val' }, (t.D + t.N) + ' turnos · ' + fmtH(t.horas) + ' h'));
      }));
      // 2) Cubrimiento por día: columnas apiladas día + noche
      var cob = cobertura();
      var maxC = Math.max.apply(null, cob.map(function (c) { return c.D + c.N; }).concat([cfg.reqDia + cfg.reqNoche, 1]));
      var ticks = []; var paso = maxC <= 5 ? 1 : Math.ceil(maxC / 5);
      for (var tk = 0; tk <= maxC; tk += paso) ticks.push(tk);
      var cols = h('div', { class: 'viz-cols', style: { gridTemplateColumns: 'repeat(' + N + ', minmax(0, 1fr))' } },
        h('div', { class: 'viz-grid' }, ticks.map(function (tk) { return h('div', { class: 'viz-gl', style: { bottom: (tk / maxC * 100) + '%' } }, h('small', null, String(tk))); })),
        cob.map(function (c) {
          var col = h('div', { class: 'viz-col' + (c.faltaD || c.faltaN ? ' falta' : ''), tabindex: '0', 'aria-label': 'Día ' + c.dia + ': ' + c.D + ' de día, ' + c.N + ' de noche' },
            h('div', { class: 'viz-stack' },
              c.N ? h('span', { class: 'viz-seg viz-N', style: { height: (c.N / maxC * 100) + '%' } }) : null,
              c.D ? h('span', { class: 'viz-seg viz-D', style: { height: (c.D / maxC * 100) + '%' } }) : null),
            h('small', { class: 'viz-x' }, c.dia % 2 === 1 || N <= 16 ? String(c.dia) : ''));
          var fecha = U.fDate(U.fromLocal(mes + '-' + String(c.dia).padStart(2, '0'), '12:00'));
          tooltip(col, [[fecha, ''], [String(c.D), 'de día' + (c.faltaD ? ' (requeridas ' + cfg.reqDia + ')' : ''), 'D'], [String(c.N), 'de noche' + (c.faltaN ? ' (requeridas ' + cfg.reqNoche + ')' : ''), 'N']]);
          return col;
        }));
      var faltas = cob.filter(function (c) { return c.faltaD || c.faltaN; });
      var totalD = filas.reduce(function (a, f) { return a + totales(f).D; }, 0), totalN = filas.reduce(function (a, f) { return a + totales(f).N; }, 0);
      var tablaCob = h('details', null, h('summary', null, 'Ver la tabla de cubrimiento por día'),
        h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Día', 'De día', 'De noche', 'Descanso'].map(function (x) { return h('th', null, x); }))),
          h('tbody', null, cob.map(function (c) { return h('tr', null, h('td', null, LETRA_DIA[dow(mes, c.dia)] + ' ' + c.dia), h('td', { class: c.faltaD ? 'txt-deny' : '' }, String(c.D)), h('td', { class: c.faltaN ? 'txt-deny' : '' }, String(c.N)), h('td', null, String(c.X))); })))));
      resumenBox.replaceChildren(
        h('div', { class: 'kpis' },
          h('div', { class: 'kpi' }, AP.icon('users', 22), h('strong', null, String(filas.length)), h('span', null, 'Personas programables')),
          h('div', { class: 'kpi' }, AP.icon('calendar', 22), h('strong', null, String(totalD)), h('span', null, 'Turnos de día en el mes')),
          h('div', { class: 'kpi' }, AP.icon('clock', 22), h('strong', null, String(totalN)), h('span', null, 'Turnos de noche en el mes')),
          h('div', { class: 'kpi ' + (faltas.length ? 'deny' : '') }, AP.icon('alert', 22), h('strong', null, cfg.reqDia || cfg.reqNoche ? String(faltas.length) : '—'), h('span', null, 'Días sin cubrimiento suficiente'))),
        h('div', { class: 'grid-2' },
          h('section', { class: 'card stack sm' }, h('h3', null, 'Turnos por persona — ' + nombreMes(mes)), leyenda(), porPersona),
          h('section', { class: 'card stack sm' }, h('h3', null, 'Personas en servicio por día'),
            h('div', { class: 'viz-legend' }, h('span', null, h('i', { class: 'viz-sw viz-D' }), 'Día'), h('span', null, h('i', { class: 'viz-sw viz-N' }), 'Noche')),
            cols, faltas.length ? h('p', { class: 'txt-deny small' }, 'Sin cubrimiento suficiente: ' + faltas.map(function (c) { return c.dia + (c.faltaD && c.faltaN ? ' (día y noche)' : c.faltaD ? ' (día)' : ' (noche)'); }).join(', ') + '.') : null,
            tablaCob)));
    }

    // ---------- Patrones de rotación ----------
    function patron(r) {
      if (!ED) return;
      AP.modal({
        title: 'Aplicar patrón de turnos', size: 'wide',
        body: function (close) {
          var elegidos = new Set(r == null ? [] : [r]);
          var lista = h('div', { class: 'pick-list' }, filas.map(function (f, i) {
            var cb = h('input', { type: 'checkbox', checked: elegidos.has(i) });
            cb.addEventListener('change', function () { if (cb.checked) elegidos.add(i); else elegidos.delete(i); });
            return h('label', null, cb, h('span', null, f.nombre + ' — ' + f.rol));
          }));
          var pre = AP.select('preset', [['DDNNXX', '2 días, 2 noches, 2 descansos (DDNNXX)'], ['DDDDXX', '4 días y 2 descansos (DDDDXX)'], ['NNNNXX', '4 noches y 2 descansos (NNNNXX)'],
            ['DDDDDDX', '6 días y 1 descanso (DDDDDDX)'], ['NNNNNNX', '6 noches y 1 descanso (NNNNNNX)'], ['DNX', 'Día, noche, descanso (DNX)'], ['', 'Otro (escríbalo)']], 'DDNNXX');
          var txt = AP.input('patron', 'DDNNXX', { autocapitalize: 'characters', placeholder: 'Letras D, N y X. Ej.: DDNNXX', maxlength: 31 });
          pre.addEventListener('change', function () { if (pre.value) txt.value = pre.value; else txt.focus(); });
          var desde = AP.input('desde', 1, { type: 'number', min: 1, max: N, inputmode: 'numeric' });
          var hasta = AP.input('hasta', N, { type: 'number', min: 1, max: N, inputmode: 'numeric' });
          var esc = AP.input('esc', 0, { type: 'number', min: 0, max: 30, inputmode: 'numeric' });
          var reemplazar = AP.check('reemplazar', 'Reemplazar los días ya programados en ese rango', true);
          return h('div', { class: 'stack' },
            h('div', { class: 'row gap wrap' }, h('strong', null, 'Personas'),
              h('button', { class: 'btn small', type: 'button', onclick: function () { lista.querySelectorAll('input').forEach(function (c, i) { c.checked = true; elegidos.add(i); }); } }, 'Todas'),
              h('button', { class: 'btn small ghost', type: 'button', onclick: function () { lista.querySelectorAll('input').forEach(function (c) { c.checked = false; }); elegidos.clear(); } }, 'Ninguna')),
            lista,
            h('div', { class: 'form-grid' },
              AP.field('Patrón', pre, null, 'span2'), AP.field('Secuencia (D = día, N = noche, X = descanso)', txt, null, 'span2'),
              AP.field('Desde el día', desde), AP.field('Hasta el día', hasta),
              AP.field('Escalonar entre personas (días)', esc, 'Cada persona seleccionada inicia el patrón tantos días después de la anterior, para que no descansen todas el mismo día.', 'span2'),
              h('div', { class: 'field span2' }, reemplazar)),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
              h('button', { class: 'btn primary', type: 'button', onclick: function () {
                var p = String(txt.value || '').toUpperCase().replace(/[^DNX]/g, '');
                var a = Math.max(1, parseInt(desde.value, 10) || 1), b = Math.min(N, parseInt(hasta.value, 10) || N), s = Math.max(0, parseInt(esc.value, 10) || 0);
                if (!p) return AP.toast('Escriba la secuencia con las letras D, N y X.', 'warn');
                if (!elegidos.size) return AP.toast('Seleccione al menos una persona.', 'warn');
                if (b < a) return AP.toast('Revise el rango de días.', 'warn');
                var rep = reemplazar.querySelector('input').checked;
                Array.from(elegidos).sort(function (x, y) { return x - y; }).forEach(function (fi, k) {
                  var f = filas[fi];
                  for (var d = a; d <= b; d++) {
                    var pos = ((d - a - k * s) % p.length + p.length) % p.length;
                    if (rep || !f.dias[d - 1]) f.dias[d - 1] = p[pos];
                  }
                });
                close(); marcarSucio(); pintarGrid(); pintarResumen();
                AP.toast('Patrón aplicado a ' + elegidos.size + ' persona(s). Revise y guarde.', 'info');
              } }, AP.icon('check', 18), 'Aplicar')));
        }
      });
    }

    // ---------- Guardar ----------
    async function guardar() {
      if (!filas.length) return;
      var datos = {
        requeridoDia: cfg.reqDia, requeridoNoche: cfg.reqNoche,
        personas: filas.filter(function (f) { return f.dias.some(Boolean); }).map(function (f) {
          return { id: f.id, nombre: f.nombre, usuario: f.usuario, rol: f.rol, empresa: f.empresa, doc: f.doc, dias: f.dias.map(function (c) { return c || '-'; }).join('') };
        })
      };
      var reg = { Title: 'Programación ' + mes, Mes: mes, Datos: JSON.stringify(datos), HorarioDia: cfg.hDiaDesde + '-' + cfg.hDiaHasta, HorarioNoche: cfg.hNocheDesde + '-' + cfg.hNocheHasta, Soporte: cfg.soporte.trim(), Observaciones: cfg.obs.trim() };
      guardarBtn.disabled = true;
      try {
        if (doc) { doc = await AP.B.update('AP_Programacion', doc.id, reg); }
        else { doc = await AP.B.create('AP_Programacion', reg); }
        var td = datos.personas.reduce(function (a, p) { return a + (p.dias.match(/D/g) || []).length; }, 0), tn = datos.personas.reduce(function (a, p) { return a + (p.dias.match(/N/g) || []).length; }, 0);
        await AP.Audit.log('Programación del servicio', nombreMes(mes), datos.personas.length + ' persona(s); ' + td + ' turnos de día y ' + tn + ' de noche' + (reg.Soporte ? '; soporte: ' + reg.Soporte : ''));
        marcarSucio(false);
        AP.toast('Programación de ' + nombreMes(mes) + ' guardada.');
      } catch (e) { AP.toast('No se pudo guardar: ' + e.message, 'error', 8000); }
      finally { guardarBtn.disabled = false; }
    }

    // ---------- Excel ----------
    async function exportarExcel() {
      if (!filas.length) return AP.toast('No hay personas para descargar.', 'warn');
      if (!window.writeXlsxFile) return AP.toast('La librería de Excel no está disponible.', 'error');
      var FILL = { D: '#FCE1D3', N: '#D6E6F8', X: '#E6E9E3' };
      var B = function (v, o) { var c = { value: v }; Object.keys(o || {}).forEach(function (k) { if (o[k] !== undefined) c[k] = o[k]; }); return c; };
      var cab = [B('Nombre', { fontWeight: 'bold', backgroundColor: '#E4EEDF' }), B('Rol', { fontWeight: 'bold', backgroundColor: '#E4EEDF' }), B('Documento', { fontWeight: 'bold', backgroundColor: '#E4EEDF' })];
      for (var d = 1; d <= N; d++) cab.push(B(LETRA_DIA[dow(mes, d)] + ' ' + d, { fontWeight: 'bold', align: 'center', backgroundColor: dow(mes, d) % 6 === 0 ? '#D9E2D3' : '#E4EEDF' }));
      ['Días', 'Noches', 'Descansos', 'Horas', 'Máx. h/semana'].forEach(function (t) { cab.push(B(t, { fontWeight: 'bold', align: 'center', backgroundColor: '#E4EEDF' })); });
      var total = 3 + N + 5;
      var titulo = [B('Programación del servicio de vigilancia y rondas — ' + nombreMes(mes), { fontWeight: 'bold', fontSize: 13, columnSpan: total })];
      var sub = [B('Turno de día: ' + cfg.hDiaDesde + ' a ' + cfg.hDiaHasta + ' · Turno de noche: ' + cfg.hNocheDesde + ' a ' + cfg.hNocheHasta + (cfg.soporte ? ' · Soporte: ' + cfg.soporte : ''), { columnSpan: total })];
      var rows = [titulo, sub, [B('')], cab];
      filas.forEach(function (f) {
        var t = totales(f);
        var r = [B(f.nombre + (f.baja ? ' (de baja)' : '')), B(f.rol), B(f.doc || '')];
        f.dias.forEach(function (c) { r.push(B(c || '', c ? { align: 'center', backgroundColor: FILL[c] } : { align: 'center' })); });
        r.push(B(t.D, { type: Number, align: 'center' }), B(t.N, { type: Number, align: 'center' }), B(t.X, { type: Number, align: 'center' }), B(t.horas, { type: Number, align: 'center' }), B(t.maxSemana, { type: Number, align: 'center' }));
        rows.push(r);
      });
      var cob = cobertura();
      var fD = [B('Personas de día', { fontWeight: 'bold', columnSpan: 3 }), null, null], fN = [B('Personas de noche', { fontWeight: 'bold', columnSpan: 3 }), null, null];
      cob.forEach(function (c) { fD.push(B(c.D, { type: Number, align: 'center', backgroundColor: c.faltaD ? '#FBE5E3' : undefined })); fN.push(B(c.N, { type: Number, align: 'center', backgroundColor: c.faltaN ? '#FBE5E3' : undefined })); });
      for (var k = 0; k < 5; k++) { fD.push(null); fN.push(null); }
      rows.push([B('')], fD, fN, [B('')], [B('Convenciones: D = día · N = noche · X = descanso. Horas calculadas con la duración de cada turno.', { columnSpan: total })]);
      var cobRows = [['Fecha', 'Día de la semana', 'Personas de día', 'Personas de noche', 'Requeridas de día', 'Requeridas de noche', 'Cubrimiento'].map(function (t) { return B(t, { fontWeight: 'bold', backgroundColor: '#E4EEDF' }); })]
        .concat(cob.map(function (c) {
          var fecha = U.fromLocal(mes + '-' + String(c.dia).padStart(2, '0'), '12:00');
          return [B(U.fDate(fecha)), B(['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][dow(mes, c.dia)]), B(c.D, { type: Number }), B(c.N, { type: Number }),
            B(cfg.reqDia || '', cfg.reqDia ? { type: Number } : {}), B(cfg.reqNoche || '', cfg.reqNoche ? { type: Number } : {}),
            B(cfg.reqDia || cfg.reqNoche ? (c.faltaD || c.faltaN ? 'Insuficiente' + (c.faltaD && c.faltaN ? ' (día y noche)' : c.faltaD ? ' (día)' : ' (noche)') : 'Suficiente') : 'Sin requerimiento definido', c.faltaD || c.faltaN ? { backgroundColor: '#FBE5E3' } : {})];
        }));
      var info = [['Documento', 'Programación del servicio de vigilancia y rondas — ' + nombreMes(mes)], ['Soporte', cfg.soporte || '—'], ['Observaciones', cfg.obs || '—'],
        ['Generado por', AP.Session.user.nombre + ' (' + AP.Session.user.upn + ')'], ['Fecha de generación', U.fDateTime(new Date())],
        ['Nota', 'Programación reportada por la empresa contratista, registrada por la Dirección de Seguridad Integral para verificar el cubrimiento de los puestos. La programación, las órdenes y la supervisión del personal corresponden al contratista.'],
        ['Reserva', AP.TX.pieExportacion]].map(function (x) { return [B(x[0], { fontWeight: 'bold' }), B(x[1], { wrap: true })]; });
      var colsW = [{ width: 30 }, { width: 11 }, { width: 13 }];
      for (var j = 0; j < N; j++) colsW.push({ width: 5 });
      colsW.push({ width: 7 }, { width: 8 }, { width: 10 }, { width: 8 }, { width: 13 });
      try {
        var blob = await window.writeXlsxFile([
          { sheet: 'Programación', data: rows, columns: colsW, stickyRowsCount: 4, stickyColumnsCount: 1 },
          { sheet: 'Cubrimiento diario', data: cobRows, columns: [{ width: 13 }, { width: 14 }, { width: 15 }, { width: 17 }, { width: 17 }, { width: 19 }, { width: 30 }] },
          { sheet: 'Información', data: info, columns: [{ width: 22 }, { width: 90 }] }
        ]).toBlob();
        var nombre = 'Programacion_' + mes + '.xlsx';
        var hash = await U.sha256(blob);
        U.download(blob, nombre);
        await AP.Audit.log('Exportación', nombre, 'Programación de ' + nombreMes(mes) + ' (' + filas.length + ' personas)', hash);
        AP.toast('Se descargó ' + nombre + (sucio ? '. Ojo: tiene cambios sin guardar en la aplicación.' : '.'), sucio ? 'warn' : 'info', 6000);
      } catch (e) { AP.toast('No se pudo generar el Excel: ' + e.message, 'error', 8000); }
    }

    cargar();
  });
})();
