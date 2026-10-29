/* Consola: visitas, historial, inspecciones, usuarios, bitácora, instalación y carga masiva */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function guard(perm) { if (!AP.Session.can(perm || 'consola')) { AP.go('/porteria'); return false; } return true; }
  function errBox(e) {
    if (e && e.missingList) return AP.empty('settings', 'Falta configurar la base de datos', e.message, AP.Session.can('admin') ? h('a', { class: 'btn primary', href: '#/consola/instalacion' }, 'Ir a instalación') : null);
    return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con el servidor' : 'No fue posible cargar la información', e && e.message);
  }
  function simpleTable(cols, rows, onRow) {
    return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', null, c[0]); }))),
      h('tbody', null, rows.length ? rows.map(function (r) {
        return h('tr', { onclick: onRow ? function (e) { if (!e.target.closest('button,a')) onRow(r); } : null }, cols.map(function (c) { var v = c[1](r); return h('td', { 'data-label': c[0] }, v == null ? '' : v); }));
      }) : h('tr', null, h('td', { colspan: cols.length, class: 'center muted' }, 'Sin registros')))));
  }

  // =================== VISITAS ===================
  // v2.2.0: los visitantes no anunciados que registra el vigilante llegan aquí "Por aprobar". El Director decide con
  // justificación; al aprobar fija la vigencia del QR y se lo envía al visitante por WhatsApp.
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  function finSugerido(desde) {
    var a = desde || new Date();
    var b = U.fromLocal(U.ymd(a), '18:00');
    if (b.getTime() - a.getTime() < 2 * 3600000) b = new Date(a.getTime() + 2 * 3600000);
    return b;
  }
  AP.route('/consola/visitas', function (qs) {
    if (!guard()) return;
    var tab = qs.t || 'pendientes';
    var content = h('div', { class: 'stack' });
    var ED = AP.Session.can('editar');
    AP.consolaShell('/consola/visitas', 'Visitas', content,
      ED ? h('button', { class: 'btn primary', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Nueva visita') : AP.pill('Solo consulta', 'muted'));
    var visitas = [];   // visitas recientes (desde ayer): por aprobar, hoy y próximas
    var rango = [];     // visitas del rango de fechas (pestaña "Todas")
    var desdeV = AP.input('desde', U.ymd(U.addDays(new Date(), -60)), { type: 'date' });
    var hastaV = AP.input('hasta', U.ymd(), { type: 'date' });
    var fEstado = AP.select('estado', [['', 'Todos los estados']].concat(AP.CAT.estadosVisita), '');
    var fOrigen = AP.select('origen', [['', 'Todos los orígenes'], ['Consola', 'Prerregistro'], ['Portería', 'No anunciado (portería)']], '');
    // Llegada (pestaña Hoy): por defecto solo las visitas que aún no llegan; al ingresar el visitante sale de esa lista
    var fLlegada = AP.select('llegada', [['porLlegar', 'Por llegar'], ['dentro', 'Dentro'], ['salio', 'Ya salieron'], ['', 'Todas las de hoy']], 'porLlegar');
    [fEstado, fOrigen, fLlegada].forEach(function (s0) { s0.addEventListener('change', function () { pintarTabla(); }); });
    function llegada(v) {
      if (v.Estado !== 'Aprobada') return v.Estado === 'Pendiente' ? 'porLlegar' : '';
      var e = AP.Access.estadoVisita(v);
      return e.clave === 'porLlegar' && new Date(v.FechaFin) < new Date() ? 'noIngreso' : e.clave;
    }
    async function consultar() { return AP.B.listRange('AP_Visitas', 'FechaFin', U.addDays(new Date(), -1), null, { exclude: ['Foto'] }); }
    function rangoValido(dIn, hIn) {
      var a0 = U.fromLocal(dIn.value, '00:00'), b0 = U.fromLocal(hIn.value, '23:59');
      if (!a0 || !b0 || isNaN(a0) || isNaN(b0) || b0 < a0) { AP.toast('Revise el rango de fechas.', 'warn'); return null; }
      if ((b0 - a0) / 86400000 > 400) { AP.toast('Consulte máximo 400 días por vez.', 'warn'); return null; }
      return [a0, new Date(b0.getTime() + 59999)];
    }
    // Visitas programadas en el rango (por la fecha de la visita)
    async function consultarRango() {
      var r = rangoValido(desdeV, hastaV);
      if (!r) return null;
      var l = await AP.B.listRange('AP_Visitas', 'FechaFin', r[0], U.addDays(new Date(), 400), { exclude: ['Foto'] });
      return l.filter(function (v) { return new Date(v.FechaInicio).getTime() <= r[1].getTime(); });
    }
    async function cargar() {
      content.replaceChildren(AP.spinner('Consultando…'));
      try {
        visitas = await consultar();
        if (tab === 'historial') rango = (await consultarRango()) || [];
        pintar();
      } catch (e) { content.replaceChildren(errBox(e)); }
    }
    // Las solicitudes nuevas de portería aparecen solas (cada 30 s, sin interrumpir si hay una ventana abierta)
    var t = setInterval(async function () {
      if (tab === 'historial' || tab === 'registro' || document.querySelector('.modal-wrap')) return;
      try {
        var n = await consultar();
        var firma = function (l) { return l.map(function (v) { return v.id + v.Estado + v._etag; }).sort().join('|'); };
        if (firma(n) !== firma(visitas) && !document.querySelector('.modal-wrap')) { visitas = n; pintar(); }
      } catch (e) { /* se reintenta */ }
    }, 30000);
    AP.onLeave(function () { clearInterval(t); });
    // Al registrarse un ingreso o una salida, la lista se actualiza (estado "Dentro" / "Salió")
    AP.onLeave(AP.Sync.on(U.debounce(function () { if (tab !== 'registro' && visitas.length && !document.querySelector('.modal-wrap') && location.hash.indexOf('#/consola/visitas') === 0) pintarTabla(); }, 800)));

    function dePorteria(v) { return v.Origen === 'Portería'; }
    // Búsqueda y descarga (se conservan al cambiar de pestaña o al actualizarse la lista)
    var qv = AP.buscador('Buscar visitante, documento, empresa, anfitrión, motivo o placa', function () { pintarTabla(); });
    var listaActual = [];
    var tablaBox = h('div');
    var COLS_VIS = [
      ['Visitante', function (v) { return v.Title; }, 30], ['Tipo doc.', function (v) { return v.TipoDoc; }, 8], ['N.° documento', function (v) { return v.NumDoc; }, 15],
      ['Empresa / entidad', function (v) { return v.Empresa; }, 26], ['Celular', function (v) { return v.Telefono; }, 14], ['Correo', function (v) { return v.Correo; }, 26],
      ['Vale desde', function (v) { return U.toDate(v.FechaInicio); }, 17], ['Vale hasta', function (v) { return U.toDate(v.FechaFin); }, 17],
      ['Anfitrión', function (v) { return v.Anfitrion; }, 26], ['Cargo anfitrión', function (v) { return v.AnfitrionCargo; }, 20], ['Área', function (v) { return v.Area; }, 18],
      ['Motivo', function (v) { return v.Motivo; }, 34], ['Placa', function (v) { return v.Placa; }, 10], ['Vehículo', function (v) { return v.VehiculoTipo; }, 12],
      ['Estado', function (v) { return v.Estado; }, 12], ['Origen', function (v) { return v.Origen === 'Portería' ? 'No anunciado (portería)' : 'Prerregistro'; }, 20],
      ['Registró / solicitó', function (v) { return v.SolicitadoPorNombre || v.SolicitadoPor; }, 22], ['Decidió', function (v) { return v.AprobadoPorNombre || v.AprobadoPor; }, 22],
      ['Fecha de decisión', function (v) { return v.FechaAprobacion ? U.toDate(v.FechaAprobacion) : ''; }, 17], ['Justificación', function (v) { return v.JustificacionDecision; }, 34],
      ['QR enviado', function (v) { return v.QREnviado ? U.toDate(v.QREnviado) : ''; }, 17], ['Observaciones', function (v) { return v.Observaciones; }, 34]
    ];
    var TABS = [['pendientes', 'Por aprobar'], ['hoy', 'Hoy'], ['proximas', 'Próximas'], ['historial', 'Todas (por fechas)'], ['registro', 'Registro de ingresos y salidas']];
    function nombreTab() { return tab === 'historial' ? 'Todas (' + desdeV.value + ' a ' + hastaV.value + ')' : (TABS.find(function (x) { return x[0] === tab; }) || ['', 'Visitas'])[1]; }
    function filtradas() {
      return listaActual.filter(function (v) {
        if (fEstado.value && v.Estado !== fEstado.value) return false;
        if (fOrigen.value === 'Portería' && !dePorteria(v)) return false;
        if (fOrigen.value === 'Consola' && dePorteria(v)) return false;
        if (tab === 'hoy' && fLlegada.value && llegada(v) !== fLlegada.value) return false;
        return AP.coincide(v, qv.value, ['Title', 'NumDoc', 'Empresa', 'Anfitrion', 'Area', 'Motivo', 'Placa', 'Telefono', 'Estado']);
      });
    }
    function grupos() {
      var hoy = U.ymd(), ahora = new Date();
      return {
        pendientes: visitas.filter(function (v) { return v.Estado === 'Pendiente' && new Date(v.FechaFin) >= ahora; }),
        hoy: visitas.filter(function (v) { return U.ymd(v.FechaInicio) <= hoy && U.ymd(v.FechaFin) >= hoy && v.Estado !== 'Cancelada'; }),
        proximas: visitas.filter(function (v) { return U.ymd(v.FechaInicio) > hoy && v.Estado !== 'Cancelada'; }),
        historial: rango.slice()
      };
    }
    function tabsEl(g) {
      return h('div', { class: 'tabs' }, TABS.map(function (x) {
        return h('a', { class: x[0] === tab ? 'on' : '', href: '#/consola/visitas?t=' + x[0] }, x[1] + (['pendientes', 'hoy', 'proximas'].indexOf(x[0]) >= 0 ? ' (' + g[x[0]].length + ')' : ''));
      }));
    }
    function pintar() {
      if (tab === 'registro') return pintarRegistro();
      var g = grupos();
      var lista = (g[tab] || []).sort(function (a, b) {
        var ka = dePorteria(a) ? (a.FechaSolicitud || a.FechaInicio) : a.FechaInicio, kb = dePorteria(b) ? (b.FechaSolicitud || b.FechaInicio) : b.FechaInicio;
        return ka < kb ? (tab === 'historial' ? 1 : -1) : (tab === 'historial' ? -1 : 1);
      });
      var avisoPort = tab === 'pendientes' && g.pendientes.some(dePorteria)
        ? h('p', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, 'Hay visitantes no anunciados esperando en portería. Apruebe o rechace con justificación; al aprobar, envíele el código QR por WhatsApp.'))
        : null;
      listaActual = lista;
      content.replaceChildren(tabsEl(g), avisoPort,
        tab === 'historial' ? h('div', { class: 'filters' }, AP.field('Desde', desdeV), AP.field('Hasta', hastaV),
          h('button', { class: 'btn primary', type: 'button', onclick: recargarRango }, AP.icon('search', 18), 'Consultar'),
          h('small', { class: 'muted' }, 'Visitas programadas en el rango, en cualquier estado.')) : null,
        h('div', { class: 'filters' }, tab === 'hoy' ? fLlegada : null, fEstado, fOrigen, qv, AP.btnExcel(function () {
          var rows = filtradas();
          if (!rows.length) return AP.toast('No hay visitas para descargar con el filtro actual.', 'warn');
          AP.exportar('Visitas_' + (tab === 'historial' ? 'todas' : nombreTab().replace(/\s+/g, '_')), COLS_VIS, rows, 'xlsx', [['Vista', nombreTab()],
            ['Filtros', [fEstado.value, fOrigen.value === 'Consola' ? 'Prerregistro' : fOrigen.value === 'Portería' ? 'No anunciado' : '', qv.value].filter(Boolean).join(' · ') || 'ninguno'],
            ['Generado por', AP.Session.user.nombre + ' (' + AP.Session.user.upn + ')'], ['Fecha', U.fDateTime(new Date())]]);
        })),
        tablaBox);
      pintarTabla();
    }
    async function recargarRango() {
      tablaBox.replaceChildren(AP.spinner('Consultando…'));
      try { var r = await consultarRango(); if (r) { rango = r; pintar(); } else pintarTabla(); }
      catch (e) { tablaBox.replaceChildren(errBox(e)); }
    }

    // ---------- Registro de ingresos y salidas de visitantes y autoridades ----------
    // Cada fila une el ingreso con su salida (por el registro de entrada o por la misma persona) y calcula la permanencia.
    var desdeR = AP.input('desdeR', U.ymd(U.addDays(new Date(), -30)), { type: 'date' });
    var hastaR = AP.input('hastaR', U.ymd(), { type: 'date' });
    var fTipoR = AP.select('tipoR', [['', 'Visitantes y autoridades'], ['vis', 'Solo visitantes'], ['aut', 'Solo autoridades']], '');
    var fEstR = AP.select('estR', [['', 'Todos los registros'], ['Dentro', 'Siguen dentro'], ['Salió', 'Ya salieron'], ['Sin salida registrada', 'Sin salida registrada'], ['Ingreso negado', 'Ingresos negados']], '');
    var qr = AP.buscador('Buscar visitante, documento, empresa, anfitrión, placa o vigilante', function () { pintarTablaR(); });
    [fTipoR, fEstR].forEach(function (s0) { s0.addEventListener('change', function () { pintarTablaR(); }); });
    var regBox = h('div');
    var registro = null;
    function esVisitaMov(m) { return m.RefLista === 'AP_Visitas' || m.Categoria === 'Visitante' || m.Categoria === 'Visitante no anunciado' || m.Categoria === 'Autoridad'; }
    function emparejar(movs) {
      var asc = movs.slice().sort(function (a, b) { return a.FechaHora < b.FechaHora ? -1 : 1; });
      var filas = [], abiertos = new Map(), porId = new Map();
      asc.forEach(function (m) {
        if (m.Resultado === 'Negado') { filas.push({ ing: m, sal: null, negado: true }); return; }
        var k = AP.Access.keyOf(m);
        if (m.Sentido === 'Ingreso') { var f = { ing: m, sal: null }; filas.push(f); abiertos.set(k, f); porId.set(m.IdLocal, f); return; }
        var f2 = (m.EntradaId && porId.get(m.EntradaId)) || abiertos.get(k);
        if (f2 && !f2.sal) { f2.sal = m; abiertos.delete(AP.Access.keyOf(f2.ing)); }
        else filas.push({ ing: null, sal: m });
      });
      var maxSin = (AP.Horario ? AP.Horario.cfg().horasMaxSinSalida : 14) * 3600000;
      filas.forEach(function (f) {
        f.d = f.ing || f.sal;
        f.estado = f.negado ? 'Ingreso negado' : f.ing && f.sal ? 'Salió' : !f.ing ? 'Salida (ingreso anterior al rango)'
          : Date.now() - new Date(f.ing.FechaHora).getTime() > maxSin ? 'Sin salida registrada' : 'Dentro';
      });
      return filas.sort(function (a, b) { return a.d.FechaHora < b.d.FechaHora ? 1 : -1; });
    }
    async function consultarRegistro() {
      var r = rangoValido(desdeR, hastaR);
      if (!r) return;
      regBox.replaceChildren(AP.spinner('Consultando ingresos y salidas…'));
      try {
        var movs = await AP.B.listRange('AP_Movimientos', 'FechaHora', r[0], r[1]);
        registro = emparejar(movs.filter(esVisitaMov));
        pintarTablaR();
      } catch (e) { regBox.replaceChildren(errBox(e)); }
    }
    function filtradosR() {
      return (registro || []).filter(function (f) {
        if (fTipoR.value === 'aut' && f.d.Categoria !== 'Autoridad') return false;
        if (fTipoR.value === 'vis' && f.d.Categoria === 'Autoridad') return false;
        if (fEstR.value && f.estado !== fEstR.value) return false;
        return AP.coincide(f.d, qr.value, ['Title', 'NumDoc', 'Empresa', 'Anfitrion', 'Area', 'Motivo', 'Placa', 'Categoria',
          function () { return [f.ing && f.ing.Vigilante, f.sal && f.sal.Vigilante].filter(Boolean).join(' '); }]);
      });
    }
    function horaMov(m) { return m ? U.fDateTime(m.FechaHora) : '—'; }
    function permanencia(f) { return f.ing && !f.negado ? U.duracion(f.ing.FechaHora, f.sal ? f.sal.FechaHora : new Date()) : ''; }
    var KIND_R = { 'Dentro': 'ok', 'Salió': 'muted', 'Ingreso negado': 'deny', 'Sin salida registrada': 'warn', 'Salida (ingreso anterior al rango)': 'muted' };
    var COLS_REG = [
      ['Ingreso', function (f) { return f.ing ? U.toDate(f.ing.FechaHora) : ''; }, 17], ['Salida', function (f) { return f.sal ? U.toDate(f.sal.FechaHora) : ''; }, 17],
      ['Permanencia', permanencia, 14], ['Estado', function (f) { return f.estado; }, 18], ['Categoría', function (f) { return f.d.Categoria; }, 20],
      ['Nombres y apellidos', function (f) { return f.d.Title; }, 30], ['Tipo doc.', function (f) { return f.d.TipoDoc; }, 8], ['N.° documento', function (f) { return f.d.NumDoc; }, 15],
      ['Celular', function (f) { return f.d.Telefono; }, 14], ['Empresa / entidad', function (f) { return f.d.Empresa; }, 26],
      ['Anfitrión', function (f) { return f.d.Anfitrion; }, 26], ['Doc. anfitrión', function (f) { return f.d.AnfitrionDoc; }, 14], ['Área', function (f) { return f.d.Area; }, 18],
      ['Motivo', function (f) { return f.d.Motivo; }, 34], ['Vehículo', function (f) { return f.d.VehiculoTipo; }, 12], ['Placa', function (f) { return f.d.Placa || (f.sal && f.sal.Placa); }, 10],
      ['Lectura del ingreso', function (f) { return f.ing ? f.ing.Origen : ''; }, 14],
      ['Autorización de datos confirmada', function (f) { return f.ing ? U.yesNo(f.ing.AutorizacionConfirmada) : ''; }, 12],
      ['Inducción confirmada', function (f) { return f.ing ? U.yesNo(f.ing.InduccionConfirmada) : ''; }, 12],
      ['Carné entregado', function (f) { return f.ing ? f.ing.CarneEntregado : ''; }, 10], ['Documento en custodia', function (f) { return f.ing ? U.yesNo(f.ing.DocumentoCustodia) : ''; }, 11],
      ['Carné devuelto', function (f) { return f.sal ? U.yesNo(f.sal.CarneDevuelto) : ''; }, 10],
      ['Registró el ingreso', function (f) { return f.ing ? f.ing.Vigilante : ''; }, 22], ['Registró la salida', function (f) { return f.sal ? f.sal.Vigilante : ''; }, 22],
      ['Novedad', function (f) { return [f.ing && f.ing.Novedad, f.sal && f.sal.Novedad].filter(Boolean).join(' | '); }, 30],
      ['Motivo de la negación', function (f) { return f.negado ? f.ing.MotivoNegacion : ''; }, 30],
      ['Observaciones', function (f) { return [f.ing && f.ing.Observaciones, f.sal && f.sal.Observaciones].filter(Boolean).join(' | '); }, 30],
      ['Id. ingreso', function (f) { return f.ing ? f.ing.IdLocal : ''; }, 38], ['Id. salida', function (f) { return f.sal ? f.sal.IdLocal : ''; }, 38]
    ];
    function pintarTablaR() {
      if (!registro) return;
      var l = filtradosR();
      var n = function (e) { return l.filter(function (f) { return f.estado === e; }).length; };
      var lim = l.slice(0, 300);
      regBox.replaceChildren(h('div', { class: 'stack sm' },
        h('div', { class: 'row gap wrap' }, AP.pill(l.length + ' registros', 'brand'), n('Dentro') ? AP.pill(n('Dentro') + ' dentro', 'ok') : null,
          AP.pill(n('Salió') + ' salieron', 'muted'), n('Sin salida registrada') ? AP.pill(n('Sin salida registrada') + ' sin salida registrada', 'warn') : null,
          n('Ingreso negado') ? AP.pill(n('Ingreso negado') + ' negados', 'deny') : null),
        simpleTable([
          ['Ingreso', function (f) { return f.negado ? h('div', null, horaMov(f.ing), h('small', { class: 'block txt-deny' }, 'Negado')) : horaMov(f.ing); }],
          ['Salida', function (f) { return f.negado ? '' : f.sal ? (f.ing && U.ymd(f.sal.FechaHora) === U.ymd(f.ing.FechaHora) ? U.fTime(f.sal.FechaHora) : horaMov(f.sal)) : '—'; }],
          ['Permanencia', permanencia],
          ['Visitante', function (f) { return h('div', null, h('strong', null, f.d.Title), h('small', { class: 'block muted' }, [(f.d.TipoDoc || '') + ' ' + (f.d.NumDoc || ''), f.d.Categoria].filter(function (z) { return String(z || '').trim(); }).join(' · '))); }],
          ['Empresa / anfitrión', function (f) { return h('div', null, f.d.Empresa || '', h('small', { class: 'block muted' }, [f.d.Anfitrion, f.d.Area].filter(Boolean).join(' · '))); }],
          ['Motivo', function (f) { return f.d.Motivo; }],
          ['Placa', function (f) { return f.d.Placa || (f.sal && f.sal.Placa) || ''; }],
          ['Registró', function (f) { return h('div', null, f.ing ? h('small', { class: 'block' }, 'Ingreso: ' + (f.ing.Vigilante || '—')) : null, f.sal ? h('small', { class: 'block' }, 'Salida: ' + (f.sal.Vigilante || '—')) : null); }],
          ['Estado', function (f) { return h('div', null, AP.pill(f.estado, KIND_R[f.estado] || 'muted'), (f.ing && f.ing.Novedad) || (f.sal && f.sal.Novedad) ? h('small', { class: 'block txt-warn' }, [f.ing && f.ing.Novedad, f.sal && f.sal.Novedad].filter(Boolean).join(' | ')) : null); }]
        ], lim),
        l.length > 300 ? h('p', { class: 'muted small' }, 'Se muestran 300 de ' + l.length + '. La descarga en Excel incluye todos.') : null));
    }
    function pintarRegistro() {
      content.replaceChildren(tabsEl(grupos()),
        h('div', { class: 'banner info' }, AP.icon('history', 18), h('span', null, 'Cada ingreso y salida de visitantes (con QR o por registro manual) y de autoridades, con la hora de entrada, la de salida y el tiempo de permanencia. Es el libro de visitas de portería.')),
        h('div', { class: 'filters' }, AP.field('Desde', desdeR), AP.field('Hasta', hastaR),
          h('button', { class: 'btn primary', type: 'button', onclick: consultarRegistro }, AP.icon('search', 18), 'Consultar')),
        h('div', { class: 'filters' }, fTipoR, fEstR, qr, AP.btnExcel(function () {
          var l = filtradosR();
          if (!l.length) return AP.toast('No hay registros para descargar con el filtro actual.', 'warn');
          AP.exportar('Registro_de_visitas', COLS_REG, l, 'xlsx', [['Documento', 'Registro de ingresos y salidas de visitantes — ' + AP.CFG.porteria],
            ['Periodo', desdeR.value + ' a ' + hastaR.value], ['Filtros', [AP.textoOpcion(fTipoR), fEstR.value, qr.value].filter(Boolean).join(' · ')],
            ['Generado por', AP.Session.user.nombre + ' (' + AP.Session.user.upn + ')'], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Base de datos Firebase — colección AP_Movimientos']]);
        })),
        regBox);
      if (registro) pintarTablaR(); else consultarRegistro();
    }
    function pintarTabla() {
      tablaBox.replaceChildren(simpleTable([
        ['Visitante', function (v) {
          return h('div', null, h('strong', null, v.Title), h('small', { class: 'block muted' }, (v.TipoDoc || '') + ' ' + (v.NumDoc || '') + (v.Empresa ? ' · ' + v.Empresa : '')),
            dePorteria(v) ? h('small', { class: 'block' }, AP.pill('No anunciado · portería', 'warn')) : null);
        }],
        ['Fecha y hora', function (v) {
          if (dePorteria(v) && v.Estado === 'Pendiente') return h('div', null, 'En portería desde ' + U.fTime(v.FechaSolicitud || v.FechaInicio), h('small', { class: 'block muted' }, 'Registró: ' + (v.SolicitadoPorNombre || v.SolicitadoPor || '—')));
          return U.fDateTime(v.FechaInicio) + ' – ' + U.fTime(v.FechaFin);
        }],
        ['Anfitrión', function (v) {
          return h('div', null, v.Anfitrion || '—', h('small', { class: 'block muted' }, [v.AnfitrionCargo, v.Area].filter(Boolean).join(' · ')),
            v.Anfitrion && !v.AnfitrionId ? h('small', { class: 'block txt-warn' }, 'Sin vincular') : null);
        }],
        ['Motivo', function (v) { return v.Motivo; }],
        ['Placa', function (v) { return v.Placa; }],
        ['Estado', function (v) {
          // Los movimientos de los últimos dos días están en el equipo: el estado se muestra solo para visitas recientes
          var m = v.Estado === 'Aprobada' && new Date(v.FechaFin) >= U.addDays(new Date(), -1) ? AP.Access.estadoVisita(v) : null;
          var txt = m ? (m.clave === 'porLlegar' && new Date(v.FechaFin) < new Date() ? 'No ingresó' : m.texto) : '';
          return h('div', null, AP.estadoPill(v.Estado), txt ? h('small', { class: 'block ' + (m.clave === 'dentro' ? 'txt-ok' : 'muted') }, txt) : null);
        }],
        ['', function (v) {
          if (!ED) return h('button', { class: 'btn small', type: 'button', onclick: function () { verVisita(v); } }, AP.icon('eye', 16), 'Ver');
          return h('div', { class: 'row gap nowrap' },
            v.Estado === 'Pendiente' ? h('button', { class: 'btn small primary', type: 'button', onclick: function () { decidir(v, true); } }, AP.icon('check', 16), 'Aprobar') : null,
            v.Estado === 'Pendiente' ? h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { decidir(v, false); } }, 'Rechazar') : null,
            v.Estado === 'Aprobada' ? h('button', { class: 'btn small', type: 'button', onclick: function () { pase(v); } }, AP.icon('qr', 16), 'Pase') : null,
            avisoAnfBtn(v),
            h('button', { class: 'btn small', type: 'button', title: 'Editar', onclick: function () { editar(v); } }, AP.icon('edit', 16)),
            AP.Session.can('admin') ? h('button', { class: 'btn small danger-outline', type: 'button', title: 'Borrar registro', onclick: function (e) { e.stopPropagation(); borrarVisita(v); } }, AP.icon('trash', 16)) : null);
        }]
      ], filtradas(), function (v) { if (!ED) verVisita(v); else if (v.Estado === 'Pendiente') decidir(v, true); else editar(v); }));
    }
    // Ficha de la visita en modo consulta (perfiles sin edición)
    function verVisita(v) {
      AP.modal({ title: 'Visita de ' + v.Title + ' (solo consulta)', size: 'wide', body: h('div', { class: 'kv-grid' }, COLS_VIS.map(function (c) {
        var x = c[1](v); if (x instanceof Date) x = U.fDateTime(x);
        return x ? h('div', { class: 'kv' }, h('span', null, c[0]), h('strong', null, String(x))) : null;
      })) });
    }
    // Visitante dentro: aviso al anfitrión por WhatsApp para que lo reciba y lo acompañe
    function avisoAnfBtn(v) {
      if (v.Estado !== 'Aprobada' || new Date(v.FechaFin) < U.addDays(new Date(), -1)) return null;
      var m = AP.Access.estadoVisita(v);
      if (m.clave !== 'dentro') return null;
      var av = AP.avisoAnfitrion(v, m.mov && m.mov.FechaHora);
      if (!av) return null;
      if (!av.num) return h('button', { class: 'btn small', type: 'button', title: 'Avisar al anfitrión', onclick: function () { AP.toast('El anfitrión ' + av.nombre + ' no tiene un celular válido registrado en Personas.', 'warn', 7000); } }, AP.icon('whatsapp', 16), 'Anfitrión');
      return h('a', { class: 'btn small', href: AP.waLink(av.num, av.texto), target: '_blank', rel: 'noopener', title: 'Avisar al anfitrión por WhatsApp', onclick: function () {
        AP.Audit.log('Aviso al anfitrión', v.Title + ' → ' + av.nombre, 'WhatsApp desde la consola');
      } }, AP.icon('whatsapp', 16), 'Anfitrión');
    }
    cargar();

    // ---------- Decisión: aprobar o rechazar, con justificación ----------
    function decidir(v, si) {
      var porteria = dePorteria(v);
      AP.modal({
        title: 'Visita de ' + v.Title, size: 'wide',
        body: function (close) {
          var I = AP.input;
          var kv = function (k, val) { return val ? h('div', { class: 'kv' }, h('span', null, k), h('strong', null, val)) : null; };
          var resumen = h('div', { class: 'card stack sm' },
            porteria ? h('p', { class: 'note' }, 'Visitante NO anunciado, registrado en ' + (v.Porteria || 'portería') + ' por ' + (v.SolicitadoPorNombre || v.SolicitadoPor || '—') + ' el ' + U.fDateTime(v.FechaSolicitud || v.FechaInicio) + '. Está esperando su decisión.') : null,
            kv('Documento', (v.TipoDoc ? v.TipoDoc + ' ' : '') + (v.NumDoc || '')),
            kv('Celular', v.Telefono), kv('Correo', v.Correo), kv('Empresa / entidad', v.Empresa),
            kv('Visita a', [v.Anfitrion, v.AnfitrionCargo, v.Area].filter(Boolean).join(' · ') + (v.Anfitrion ? (v.AnfitrionId ? ' (vinculado al colaborador)' : ' (sin vincular)') : '')),
            kv('Motivo', v.Motivo), kv('Vehículo', [v.VehiculoTipo, v.Placa].filter(Boolean).join(' · ')),
            porteria ? kv('Tratamiento de datos', v.AutorizaDatos ? 'Autorizado por el visitante ante el vigilante' : 'Sin constancia') : null,
            v.Observaciones ? kv('Observaciones', v.Observaciones) : null);
          var antecedentes = h('div', { class: 'stack sm' });
          resumen.appendChild(antecedentes);
          AP.Visitantes.historial(v.NumDoc, v.id).then(function (l) {
            var r = AP.Visitantes.resumen(l);
            antecedentes.replaceChildren(
              h('div', { class: 'kv' }, h('span', null, 'Visitas anteriores'), h('strong', null, r.n ? r.n + ' (la última el ' + U.fDate(r.ultima.FechaInicio) + ', ' + (r.ultima.Estado || '') + ')' : 'Ninguna: primera visita')),
              r.ultRechazo ? h('p', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, r.rechazadas.length + (r.rechazadas.length === 1 ? ' visita rechazada' : ' visitas rechazadas') + '. La última el ' + U.fDate(r.ultRechazo.FechaInicio) + (r.ultRechazo.JustificacionDecision ? ': ' + r.ultRechazo.JustificacionDecision : '') + '.')) : null);
          }).catch(function () { /* los antecedentes son informativos */ });
          var dec = AP.segmented('Decision', [
            { value: 'Aprobada', label: 'Aprobar', icon: 'check', cls: 'in' },
            { value: 'Rechazada', label: 'Rechazar', icon: 'x', cls: 'deny' }
          ], si ? 'Aprobada' : 'Rechazada', function () { pintarDec(); });
          var just = AP.textarea('JustificacionDecision', '', { rows: 3 });
          var justHelp = h('small', { class: 'help' });
          var a0 = porteria ? new Date(Math.floor(Date.now() / 60000) * 60000) : new Date(v.FechaInicio);
          var b0 = porteria ? finSugerido(a0) : new Date(v.FechaFin);
          var iniIn = I('ini', U.toLocalInput(a0), { type: 'datetime-local' }), finIn = I('fin', U.toLocalInput(b0), { type: 'datetime-local' });
          var vigRes = h('p', { class: 'help' });
          function resVig() {
            var a = U.fromLocalInput(iniIn.value), b = U.fromLocalInput(finIn.value);
            vigRes.textContent = a && b && b > a ? 'El QR servirá para ingresar entre el ' + U.fDateTime(a) + ' y el ' + U.fDateTime(b) + ' (' + U.duracion(a, b) + '). La salida siempre se registra.' : 'Revise las horas de vigencia del QR.';
          }
          iniIn.addEventListener('change', resVig); finIn.addEventListener('change', resVig); resVig();
          var vigBox = h('div', { class: 'stack sm' }, h('h3', null, 'Vigencia del código QR'),
            h('div', { class: 'form-grid' }, AP.field('Vale desde *', iniIn), AP.field('Vale hasta *', finIn)),
            h('div', { class: 'presets' }, [['1 hora', 60], ['2 horas', 120], ['4 horas', 240], ['Hasta las 18:00', 'dia']].map(function (pr) {
              return h('button', { class: 'btn small', type: 'button', onclick: function () {
                var a = U.fromLocalInput(iniIn.value); if (!a) return AP.toast('Indique primero la hora de inicio.', 'warn');
                var b = pr[1] === 'dia' ? U.fromLocal(U.ymd(a), '18:00') : new Date(a.getTime() + pr[1] * 60000);
                if (b <= a) return AP.toast('La hora de inicio es posterior a las 18:00.', 'warn');
                finIn.value = U.toLocalInput(b); resVig();
              } }, pr[0]);
            })), vigRes);
          var btn = h('button', { class: 'btn primary', type: 'button' });
          function aprobando() { return dec.dataset.value === 'Aprobada'; }
          function oblig() { return !aprobando() || porteria; }
          function pintarDec() {
            vigBox.style.display = aprobando() ? '' : 'none';
            just.placeholder = aprobando() ? 'Por qué se autoriza el ingreso sin prerregistro (quién lo solicita o confirma, necesidad, condiciones)' : 'Motivo del rechazo';
            justHelp.textContent = (oblig() ? 'Obligatoria. ' : 'Opcional. ') + (aprobando() ? 'Queda en la bitácora; no la ve el vigilante.' : 'El vigilante la ve en portería para informar al visitante.');
            btn.className = 'btn ' + (aprobando() ? 'primary' : 'danger');
            btn.replaceChildren(AP.icon(aprobando() ? 'qr' : 'x', 18), aprobando() ? 'Aprobar y generar el QR' : 'Rechazar visita');
          }
          pintarDec();
          var enviando = false;
          btn.onclick = async function () {
            if (enviando) return;
            var ap = aprobando(), j = just.value.trim();
            if (oblig() && j.length < 6) return AP.toast('Escriba la justificación de la decisión.', 'warn');
            var cambios = { Estado: ap ? 'Aprobada' : 'Rechazada', AprobadoPor: AP.Session.user.upn, AprobadoPorNombre: AP.Session.user.nombre, FechaAprobacion: new Date().toISOString(), JustificacionDecision: j };
            if (ap) {
              var a = U.fromLocalInput(iniIn.value), b = U.fromLocalInput(finIn.value);
              if (!a || !b || b <= a) return AP.toast('Revise la vigencia del QR.', 'warn');
              if (b <= new Date()) return AP.toast('La hora final de la vigencia ya pasó.', 'warn');
              cambios.FechaInicio = a.toISOString(); cambios.FechaFin = b.toISOString();
            } else {
              cambios.Observaciones = (v.Observaciones ? v.Observaciones + '\n' : '') + 'Rechazo: ' + j;
            }
            enviando = true; btn.disabled = true;
            try {
              await AP.B.update('AP_Visitas', v.id, cambios);
              Object.assign(v, cambios);
              await AP.Audit.log(ap ? 'Aprobación de visita' : 'Rechazo de visita', v.Title + ' — ' + (ap ? U.fDateTime(cambios.FechaInicio) + ' a ' + U.fTime(cambios.FechaFin) : U.fDateTime(new Date())),
                (porteria ? 'Visitante no anunciado (solicitud de portería). ' : '') + (j ? 'Justificación: ' + j : 'Sin justificación'));
              close();
              AP.toast(ap ? 'Visita aprobada. Envíe el código QR al visitante.' : 'Visita rechazada. El vigilante lo ve en portería.', 'info', 5000);
              AP.Sync.run();
              if (ap) pase(v); else pintar();
            } catch (e) { AP.toast('No se pudo guardar la decisión: ' + e.message, 'error', 8000); enviando = false; btn.disabled = false; }
          };
          return h('div', { class: 'stack' }, resumen, dec, vigBox, AP.field('Justificación', just), justHelp,
            h('div', { class: 'row gap wrap end' },
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); editar(v); } }, AP.icon('edit', 18), 'Corregir datos'),
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cerrar'), btn));
        }
      });
    }

    // ---------- Pase con el código QR ----------
    function textoWhatsApp(v) {
      var mismoDia = U.ymd(v.FechaFin) === U.ymd(v.FechaInicio);
      return 'Señor(a) ' + v.Title + ': la Dirección de Seguridad Integral de ' + AP.CFG.empresa + ' autorizó su visita del ' + U.fLong(v.FechaInicio) +
        ' hasta las ' + U.fTime(v.FechaFin) + (mismoDia ? '' : ' del ' + U.fDate(v.FechaFin)) +
        '. Le enviamos su código QR: preséntelo en portería, junto con su documento de identidad, para registrar su ingreso y su salida. El código es personal e intransferible.' +
        (AP.Induccion.texto() ? '\n\n' + AP.Induccion.texto() : '');
    }
    async function marcarEnviado(v, canal) {
      try {
        var upd = { QREnviado: new Date().toISOString() };
        await AP.B.update('AP_Visitas', v.id, upd);
        Object.assign(v, upd);
        await AP.Audit.log('Envío de pase', v.Title, canal);
      } catch (e) { /* el envío ya ocurrió; la marca es informativa */ }
    }
    function pase(v) {
      AP.modal({
        title: 'Pase de ' + v.Title,
        body: function (close) {
          var img = h('img', { class: 'pase-img', alt: 'Pase de visitante' });
          var blobListo = null;
          var blobP = AP.paseCanvas({ titulo: 'Pase de visitante', nombre: v.Title, linea2: v.Empresa || undefined, linea3: U.fLong(v.FechaInicio) + ' a ' + U.fTime(v.FechaFin), linea4: 'Visita a: ' + [v.Anfitrion, v.Area].filter(Boolean).join(' · '), linea5: AP.CFG.sede, token: v.Token, pie: 'Presente este código y su documento de identidad' })
            .then(function (c) { img.src = c.toDataURL('image/png'); return new Promise(function (r) { c.toBlob(r, 'image/png'); }); })
            .then(function (b) { blobListo = b; return b; });
          var nombreArchivo = 'Pase_' + U.safeName(v.Title) + '.png';
          var correo = AP.input('correo', v.Correo || '', { type: 'email', placeholder: 'correo@visitante.com' });
          var num = AP.waNum(v.Telefono);
          // WhatsApp: se abre el chat con el celular que registró el vigilante; en el computador la imagen queda copiada
          // para pegarla (Ctrl+V); en el celular se descarga para adjuntarla desde la galería.
          var waBtn = num ? h('a', { class: 'btn primary', href: AP.waLink(num, textoWhatsApp(v)), target: '_blank', rel: 'noopener', onclick: function () {
            // Siempre descarga la imagen para que quede lista para adjuntar en WhatsApp
            if (blobListo) U.download(blobListo, nombreArchivo);
            AP.toast('Se descargó la imagen del QR (' + nombreArchivo + ') y se abrió el chat de WhatsApp: adjúntela desde su galería/descargas y envíela.', 'info', 12000);
            marcarEnviado(v, 'WhatsApp ' + v.Telefono);
          } }, AP.icon('whatsapp', 18), 'Enviar por WhatsApp a ' + v.Telefono) : null;
          return h('div', { class: 'stack center' }, img,
            num ? waBtn : h('p', { class: 'note' }, 'No hay un celular válido registrado para enviar el QR por WhatsApp. Use Compartir, Descargar o el correo.'),
            AP.field('Correo del visitante', correo),
            h('div', { class: 'row gap wrap center' },
              h('button', { class: 'btn', type: 'button', onclick: async function () {
                var to = correo.value.trim();
                if (!EMAIL_RE.test(to)) return AP.toast('Escriba un correo válido.', 'warn');
                try {
                  await enviarPase(v, to, await blobP);
                  AP.toast('Pase preparado para ' + to);
                  close(); pintar();
                } catch (e) { AP.toast('No se pudo enviar: ' + e.message, 'error', 8000); }
              } }, AP.icon('mail', 18), 'Enviar por correo'),
              h('button', { class: 'btn', type: 'button', onclick: async function () { U.download(await blobP, nombreArchivo); } }, AP.icon('download', 18), 'Descargar'),
              navigator.canShare ? h('button', { class: 'btn', type: 'button', onclick: async function () {
                var file = new File([await blobP], nombreArchivo, { type: 'image/png' });
                if (navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: 'Pase de visitante', text: textoWhatsApp(v) }).then(function () { marcarEnviado(v, 'Compartido desde el dispositivo'); }).catch(function () {});
                else AP.toast('Este navegador no permite compartir imágenes.', 'warn');
              } }, AP.icon('share', 18), 'Compartir') : null,
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); AP.imprimirCarnes([v], 'visita'); } }, AP.icon('print', 18), 'Imprimir')),
            h('p', { class: 'muted small' }, 'El mensaje de WhatsApp y el correo incluyen el resumen de la inducción para visitantes y el enlace a la inducción completa. ',
              h('a', { href: AP.Induccion.url(), target: '_blank', rel: 'noopener' }, 'Ver la inducción')),
            h('p', { class: 'muted small' }, 'El pase contiene solo un código aleatorio; deja de funcionar si la visita se cancela o vence. Con él, el vigilante registra el ingreso y la salida.'));
        },
        onClose: function () { pintar(); }
      });
    }

    async function enviarPase(v, to, blob) {
      var b64 = await U.blobToBase64(blob);
      var e = AP.esc;
      var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:640px">' +
        '<p>Señor(a) ' + e(v.Title) + ':</p>' +
        '<p>La Dirección de Seguridad Integral de ' + e(AP.CFG.empresa) + ' confirma la autorización de su visita:</p>' +
        '<table style="border-collapse:collapse;font-size:14px">' +
        '<tr><td style="padding:2px 12px 2px 0;color:#666">Fecha y hora</td><td><b>' + e(U.fLong(v.FechaInicio)) + ' a ' + e(U.fTime(v.FechaFin)) + '</b></td></tr>' +
        '<tr><td style="padding:2px 12px 2px 0;color:#666">Visita a</td><td>' + e([v.Anfitrion, v.Area].filter(Boolean).join(' — ')) + '</td></tr>' +
        '<tr><td style="padding:2px 12px 2px 0;color:#666">Lugar</td><td>' + e(AP.CFG.sede) + '</td></tr></table>' +
        '<p>Presente en la portería el código QR adjunto (en su celular o impreso) junto con su documento de identidad original. ' +
        'Durante su permanencia deberá estar acompañado por su anfitrión y atender las instrucciones del personal de seguridad.</p>' +
        AP.Induccion.html() +
        '<p><img src="cid:pase" alt="Pase de visitante" width="320"></p>' +
        '<p style="font-size:11px;color:#666;border-top:1px solid #ddd;padding-top:8px"><b>Aviso de privacidad.</b> ' + e(AP.TX.avisoPrivacidad(AP.CFG)) + '</p></div>';
      await AP.B.sendMail({ to: [to], cc: v.AnfitrionCorreo ? [v.AnfitrionCorreo] : [], subject: 'Autorización de visita — ' + AP.CFG.empresa + ' — ' + U.fDate(v.FechaInicio), html: html, attachments: [{ name: 'pase-visitante.png', type: 'image/png', base64: b64, cid: 'pase' }] });
      var upd = { QREnviado: new Date().toISOString() };
      if (to !== v.Correo) upd.Correo = to;
      await AP.B.update('AP_Visitas', v.id, upd);
      Object.assign(v, upd);
      await AP.Audit.log('Envío de pase', v.Title, 'Correo: ' + to);
    }

    // ---------- Prerregistro y edición ----------
    function editar(v) {
      var nuevo = !v;
      var d0 = v || { TipoDoc: 'CC', Categoria: 'Visitante', Estado: 'Aprobada' };
      var pendPort = !!(v && dePorteria(v) && v.Estado === 'Pendiente');
      var ini = v ? new Date(v.FechaInicio) : U.fromLocal(U.ymd(U.addDays(new Date(), 1)), '08:00');
      var fin = v ? new Date(v.FechaFin) : U.fromLocal(U.ymd(ini), '17:00');
      AP.modal({
        title: nuevo ? 'Prerregistro de visita' : 'Visita de ' + v.Title, size: 'wide',
        body: function (close) {
          var I = AP.input;
          var iniIn = I('ini', U.toLocalInput(ini), { type: 'datetime-local' }), finIn = I('fin', U.toLocalInput(fin), { type: 'datetime-local' });
          var resumenEl = h('p', { class: 'note' });
          function resumen() {
            var a = U.fromLocalInput(iniIn.value), b = U.fromLocalInput(finIn.value);
            resumenEl.textContent = pendPort ? 'Vigencia provisional: la definitiva se fija al aprobar la visita.'
              : a && b && b > a ? 'El QR de este visitante solo servirá para ingresar entre el ' + U.fDateTime(a) + ' y el ' + U.fDateTime(b) + ' (' + U.duracion(a, b) + ').' : 'Revise las horas de vigencia del QR.';
          }
          iniIn.addEventListener('change', resumen); finIn.addEventListener('change', resumen); resumen();
          var areaIn = I('Area', d0.Area), correoAnf = I('AnfitrionCorreo', d0.AnfitrionCorreo, { type: 'email' });
          var anf = AP.anfitrionPicker({
            fuente: function () { return AP.B.listAll('AP_Personas', { exclude: ['Foto'] }); },
            valor: d0, libre: true,
            onSelect: function (p) { if (p.Correo) correoAnf.value = p.Correo; if (p.Area) areaIn.value = p.Area; }
          });
          var form = h('div', { class: 'form-grid' },
            AP.field('Nombres y apellidos *', I('Title', d0.Title)),
            AP.field('Empresa / entidad', I('Empresa', d0.Empresa)),
            AP.field('Tipo de documento', AP.select('TipoDoc', AP.CAT.tiposDoc, d0.TipoDoc)),
            AP.field('Número de documento *', I('NumDoc', d0.NumDoc)),
            AP.field('Celular (WhatsApp)', I('Telefono', d0.Telefono, { inputmode: 'tel' }), 'Para enviarle el pase con el código QR por WhatsApp.'),
            AP.field('Correo del visitante', I('Correo', d0.Correo, { type: 'email' }), 'Para enviarle el pase por correo.'),
            AP.field('Anfitrión (colaborador de ' + AP.CFG.empresa + ') *', anf, 'Busque en el personal propio habilitado: la visita queda vinculada al colaborador.', 'span2'),
            AP.field('Correo del anfitrión', correoAnf, 'Recibe copia del pase.'),
            AP.field('Área', areaIn),
            AP.field('El QR vale desde *', iniIn, 'Antes de esta hora exacta el QR no abre el ingreso.'),
            AP.field('El QR vale hasta *', finIn, 'Después de esta hora exacta el QR queda vencido para ingresar (la salida siempre se registra).'),
            h('div', { class: 'span2 stack sm' }, h('div', { class: 'presets' }, [['1 hora', 60], ['2 horas', 120], ['4 horas', 240], ['Hasta las 18:00', 'dia']].map(function (pr) {
              return h('button', { class: 'btn small', type: 'button', onclick: function () {
                var a = U.fromLocalInput(iniIn.value); if (!a) return AP.toast('Indique primero la hora de inicio.', 'warn');
                var b = pr[1] === 'dia' ? U.fromLocal(U.ymd(a), '18:00') : new Date(a.getTime() + pr[1] * 60000);
                if (b <= a) return AP.toast('La hora de inicio es posterior a las 18:00.', 'warn');
                finIn.value = U.toLocalInput(b); resumen();
              } }, pr[0]);
            })), resumenEl),
            pendPort ? AP.field('Estado', h('p', { class: 'muted' }, 'Pendiente: apruebe o rechace con los botones de la lista.'), null, 'span2') : AP.field('Estado', AP.select('Estado', AP.CAT.estadosVisita, d0.Estado), null, 'span2'),
            AP.field('Placa del vehículo', I('Placa', d0.Placa, { autocapitalize: 'characters' })),
            AP.field('Tipo de vehículo', AP.select('VehiculoTipo', AP.CAT.vehiculos, d0.VehiculoTipo)),
            AP.field('Motivo de la visita *', AP.textarea('Motivo', d0.Motivo), null, 'span2'),
            AP.field('Observaciones de seguridad', AP.textarea('Observaciones', d0.Observaciones), 'Por ejemplo: áreas restringidas autorizadas, elementos que ingresa.', 'span2'));
          // Visitante conocido: al escribir la cédula se llenan los datos de su última visita (o de Personas)
          var infoVis = h('div', { class: 'span2 stack sm' });
          var numDocIn = form.querySelector('input[name=NumDoc]');
          if (nuevo && numDocIn) {
            numDocIn.closest('.field').after(infoVis);
            var campo = function (n) { return form.querySelector('[name=' + n + ']'); };
            numDocIn.addEventListener('input', U.debounce(async function () {
              var doc = numDocIn.value, d = U.normDoc(doc);
              infoVis.replaceChildren();
              if (d.length < 5) return;
              var hist = await AP.Visitantes.historial(doc);
              if (U.normDoc(numDocIn.value) !== d) return;
              var per = null;
              try { per = (await AP.B.listAll('AP_Personas', { exclude: ['Foto'] })).find(function (p) { return U.normDoc(p.NumDoc) === d; }) || null; } catch (e) { per = null; }
              var r = AP.Visitantes.resumen(hist);
              var campos = { Title: campo('Title'), TipoDoc: campo('TipoDoc'), Empresa: campo('Empresa'), Telefono: campo('Telefono'), Correo: campo('Correo'), Placa: campo('Placa'), VehiculoTipo: campo('VehiculoTipo') };
              var llenos = AP.Visitantes.llenar(campos, r.ultima || per);
              if (per) infoVis.appendChild(h('p', { class: 'banner warn' }, AP.icon('badge', 18), h('span', null, per.Title + ' está registrado en Personas (' + (per.Tipo || '') + ', ' + (per.Estado || '') + '). Si está habilitado, ingresa con su propio QR y no necesita visita.')));
              if (r.ultima) infoVis.appendChild(h('p', { class: 'banner info' }, AP.icon('user', 18), h('span', null, 'Visitante conocido: ' + r.n + (r.n === 1 ? ' visita' : ' visitas') + ' registrada' + (r.n === 1 ? '' : 's') + '; la última el ' + U.fDate(r.ultima.FechaInicio) + ' (' + (r.ultima.Estado || '') + ').' + (llenos.length ? ' Se llenaron: ' + llenos.join(', ') + '. Verifique y corrija lo que haya cambiado.' : ''))));
              if (r.ultRechazo) infoVis.appendChild(h('p', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, 'Atención: ' + r.rechazadas.length + (r.rechazadas.length === 1 ? ' visita rechazada' : ' visitas rechazadas') + '. La última el ' + U.fDate(r.ultRechazo.FechaInicio) + (r.ultRechazo.JustificacionDecision ? ': ' + r.ultRechazo.JustificacionDecision : '') + '.')));
            }, 500));
          }
          var guardar = async function (enviar) {
            var d = AP.formData(form);
            var a = U.fromLocalInput(d.ini), b = U.fromLocalInput(d.fin);
            delete d.ini; delete d.fin;
            if (d.Title.length < 5 || !d.NumDoc || !d.Anfitrion || !d.Motivo) return AP.toast('Complete los campos obligatorios (*).', 'warn');
            if (!a || !b || b <= a) return AP.toast('Revise la fecha y hora de la visita.', 'warn');
            if (d.Correo && !EMAIL_RE.test(d.Correo)) return AP.toast('El correo del visitante no es válido.', 'warn');
            if (!d.AnfitrionId && !(await AP.confirm('Anfitrión sin vincular', 'El anfitrión «' + d.Anfitrion + '» no corresponde a un colaborador del personal propio registrado. ¿Guardar la visita sin vincularla?', 'Guardar sin vincular'))) return;
            // Persona registrada que ya tiene autorizado el ingreso ese día y a esa hora: no se registra la visita
            if ((nuevo || new Date(v.FechaInicio).getTime() !== a.getTime() || U.normDoc(v.NumDoc) !== U.normDoc(d.NumDoc)) && d.Estado !== 'Cancelada' && d.Estado !== 'Rechazada' && !(await verificarCobertura(d, a))) return;
            d.FechaInicio = a.toISOString(); d.FechaFin = b.toISOString();
            d.Placa = U.normPlaca(d.Placa);
            try {
              var rec;
              if (nuevo) {
                d.Token = U.newToken(); d.Categoria = 'Visitante'; d.SolicitadoPor = AP.Session.user.upn; d.Origen = 'Consola';
                if (d.Estado === 'Aprobada') { d.AprobadoPor = AP.Session.user.upn; d.AprobadoPorNombre = AP.Session.user.nombre; d.FechaAprobacion = new Date().toISOString(); }
                rec = await AP.B.create('AP_Visitas', d);
                visitas.push(rec);
                AP.Visitantes.olvidar(d.NumDoc);
                await AP.Audit.log('Prerregistro de visita', d.Title + ' — ' + U.fDateTime(d.FechaInicio), 'Estado: ' + d.Estado + '; anfitrión: ' + d.Anfitrion + (d.AnfitrionId ? ' (vinculado)' : ' (sin vincular)'));
              } else {
                if (d.Estado === 'Aprobada' && v.Estado !== 'Aprobada') { d.AprobadoPor = AP.Session.user.upn; d.AprobadoPorNombre = AP.Session.user.nombre; d.FechaAprobacion = new Date().toISOString(); }
                await AP.B.update('AP_Visitas', v.id, d);
                Object.assign(v, d); rec = v;
                await AP.Audit.log('Modificación de visita', d.Title, 'Estado: ' + (d.Estado || v.Estado) + '; anfitrión: ' + d.Anfitrion + (d.AnfitrionId ? ' (vinculado)' : ' (sin vincular)'));
              }
              close(); AP.toast('Visita guardada.');
              AP.Sync.run();
              if (enviar && rec.Estado === 'Aprobada') pase(rec); else pintar();
            } catch (e) { AP.toast(e.message, 'error'); }
          };
          return h('div', { class: 'stack' }, form,
            h('p', { class: 'help' }, 'Vigencia estricta: el QR del visitante funciona únicamente entre las horas que usted programe; el vigilante no puede levantarla por excepción. Conforme al procedimiento AP-SG-PD-002, el prerregistro debe hacerse con al menos 24 horas de antelación y queda sujeto a la validación de la Dirección de Seguridad Integral.'),
            h('div', { class: 'row gap wrap end' },
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
              h('button', { class: 'btn', type: 'button', onclick: function () { guardar(false); } }, AP.icon('check', 18), 'Guardar'),
              pendPort ? null : h('button', { class: 'btn primary', type: 'button', onclick: function () { guardar(true); } }, AP.icon('qr', 18), 'Guardar y generar pase')));
        }
      });
    }
    // Si el documento corresponde a una persona registrada, se verifica si ya tiene autorizado el ingreso con su
    // credencial en el día y la hora de la visita (ingreso libre, turno, permiso o acceso sin horario).
    async function verificarCobertura(d, ini) {
      var doc = U.normDoc(d.NumDoc);
      var lista = AP.Sync.personas && AP.Sync.personas.length ? AP.Sync.personas : await AP.B.listAll('AP_Personas', { exclude: ['Foto'] }).catch(function () { return []; });
      var p = lista.find(function (x) { return U.normDoc(x.NumDoc) === doc; });
      if (!p || !AP.Horario || !AP.Horario.cobertura) return true;
      var c = AP.Horario.cobertura(p, ini);
      if (c.cubre) {
        AP.modal({ title: 'No se registra la visita', body: h('div', { class: 'stack' },
          h('p', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, p.Title + ' (' + (p.Tipo || '') + (p.Empresa ? ', ' + p.Empresa : '') + ') ya tiene autorizado el ingreso el ' + U.fDateTime(ini) + ': ' + c.desc + '.')),
          h('p', null, 'Debe ingresar y salir leyendo su propia credencial QR. Si necesita cambiar su horario o darle un permiso, hágalo en «Horarios» o «Permisos».')),
          actions: [{ label: 'Entendido', kind: 'primary' }] });
        return false;
      }
      if (c.inhabilitado) return AP.confirm('Persona inhabilitada', p.Title + ' está registrada en Personas y figura INHABILITADA' + (p.MotivoEstado ? ' (' + p.MotivoEstado + ')' : '') + '. ¿Registrar la visita de todas formas?', 'Registrar visita', 'danger');
      if (c.ausencia) return AP.confirm('Ausencia registrada', p.Title + ' tiene una ausencia registrada por Talento Humano hasta el ' + U.fDate(c.ausencia.Hasta) + '. ¿Registrar la visita de todas formas?', 'Registrar visita');
      return true;
    }
    async function borrarVisita(v) {
      var ok = await new Promise(function (res) {
        AP.modal({
          title: 'Borrar visita',
          body: function (close) {
            return h('div', { class: 'stack' },
              h('p', null, '¿Confirma el borrado definitivo de la visita de ', h('strong', null, v.Title), ' (', U.fDateTime(v.FechaInicio), ')? Esta acción no se puede deshacer.'),
              h('div', { class: 'row gap' },
                h('button', { class: 'btn danger', type: 'button', onclick: function () { res(true); close(); } }, AP.icon('trash', 16), 'Borrar definitivamente'),
                h('button', { class: 'btn ghost', type: 'button', onclick: function () { res(false); close(); } }, 'Cancelar')));
          },
          onClose: function () { res(false); }
        });
      });
      if (!ok) return;
      try {
        await AP.B.borrarFisico('AP_Visitas', v.id);
        visitas = visitas.filter(function (x) { return x.id !== v.id; });
        pintar();
        AP.toast('Visita borrada.', 'ok');
      } catch (e) { AP.toast(e.message || 'No fue posible borrar la visita.', 'err'); }
    }
  });

  // =================== HISTORIAL ===================
  var COLS_MOV = [
    ['Fecha', function (m) { return U.fDate(m.FechaHora); }, 11], ['Hora', function (m) { return U.fTime(m.FechaHora); }, 7],
    ['Movimiento', function (m) { return m.Resultado === 'Negado' ? 'Ingreso negado' : m.Sentido; }, 14], ['Nombres y apellidos', function (m) { return m.Title; }, 32],
    ['Tipo doc.', function (m) { return m.TipoDoc; }, 8], ['N.° documento', function (m) { return m.NumDoc; }, 15], ['Teléfono', function (m) { return m.Telefono; }, 13],
    ['Categoría', function (m) { return m.Categoria; }, 20], ['Empresa / dependencia', function (m) { return m.Empresa; }, 26],
    ['Motivo', function (m) { return m.Motivo; }, 26], ['Anfitrión / área', function (m) { return [m.Anfitrion, m.Area].filter(Boolean).join(' · '); }, 24],
    ['Doc. anfitrión', function (m) { return m.AnfitrionDoc; }, 14],
    ['Vehículo', function (m) { return m.VehiculoTipo; }, 12], ['Placa', function (m) { return m.Placa; }, 10],
    ['Carné entregado', function (m) { return m.CarneEntregado; }, 10], ['Autorización confirmada', function (m) { return U.yesNo(m.AutorizacionConfirmada); }, 12],
    ['Inducción de visitantes confirmada', function (m) { return U.yesNo(m.InduccionConfirmada); }, 12],
    ['Documento en custodia', function (m) { return U.yesNo(m.DocumentoCustodia); }, 11], ['Carné devuelto', function (m) { return U.yesNo(m.CarneDevuelto); }, 10],
    ['Estado mostrado', function (m) { return m.EstadoMostrado; }, 20], ['Novedad', function (m) { return m.Novedad; }, 30], ['Turno programado', function (m) { return m.HorarioInfo; }, 24], ['Excepción', function (m) { return U.yesNo(m.Excepcion); }, 9],
    ['Autorizado por', function (m) { return m.AutorizadoPor; }, 22], ['Motivo excepción / negación', function (m) { return m.MotivoExcepcion || m.MotivoNegacion; }, 30],
    ['Solicitud de ingreso (Director)', function (m) { return m.SolicitudId; }, 22],
    ['Origen', function (m) { return m.Origen; }, 14], ['Vigilante', function (m) { return m.Vigilante; }, 22], ['Usuario vigilante', function (m) { return m.VigilanteUsuario; }, 14],
    ['Usuario que envió (verificado por el servidor)', function (m) { return m._createdBy || ''; }, 20], ['Dispositivo', function (m) { return m.Dispositivo; }, 12],
    ['Sin conexión', function (m) { return U.yesNo(m.SinConexion); }, 9], ['Observaciones', function (m) { return m.Observaciones; }, 30],
    ['Fecha de recepción en servidor', function (m) { return m._created ? U.fDateTime(m._created) : ''; }, 18], ['Id. registro', function (m) { return m.IdLocal; }, 38],
    ['Huella SHA-256', function (m) { return m.Hash; }, 66]
  ];
  AP.COLS_MOV = COLS_MOV;

  AP.route('/consola/historial', function () {
    if (!AP.Session.can('consola') && !AP.Session.can('historial')) { AP.go('/porteria'); return; }
    var content = h('div', { class: 'stack' });
    var desde = AP.input('desde', U.ymd(U.addDays(new Date(), -7)), { type: 'date' });
    var hasta = AP.input('hasta', U.ymd(), { type: 'date' });
    var cat = AP.select('cat', [['', 'Todas las categorías']].concat(AP.CAT.tiposPersona, ['Visitante'], AP.CAT.categoriasManual.filter(function (c) { return AP.CAT.tiposPersona.indexOf(c) < 0; })), '');
    var mov = AP.select('mov', [['', 'Todos los movimientos'], 'Ingreso', 'Salida', ['Negado', 'Ingresos negados'], ['Excepcion', 'Excepciones'], ['Offline', 'Registrados sin conexión']], '');
    var txt = AP.input('txt', '', { type: 'search', placeholder: 'Nombre, documento, placa o empresa' });
    var out = h('div');
    var datos = [];
    function filtrar() {
      var t = U.fold(txt.value), d = U.normDoc(txt.value);
      return datos.filter(function (m) {
        if (cat.value && m.Categoria !== cat.value) return false;
        if (mov.value === 'Ingreso' && !(m.Sentido === 'Ingreso' && m.Resultado === 'Permitido')) return false;
        if (mov.value === 'Salida' && m.Sentido !== 'Salida') return false;
        if (mov.value === 'Negado' && m.Resultado !== 'Negado') return false;
        if (mov.value === 'Excepcion' && !m.Excepcion) return false;
        if (mov.value === 'Offline' && !m.SinConexion) return false;
        if (!t) return true;
        return U.fold([m.Title, m.Empresa, m.Placa, m.Anfitrion, m.Vigilante, m.VigilanteUsuario].join(' ')).indexOf(t) >= 0 || (d.length >= 3 && (U.normDoc(m.NumDoc).indexOf(d) >= 0 || U.normPlaca(m.Placa).indexOf(d) >= 0));
      }).sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
    }
    var tblBox = h('div');
    function pintar() {
      var rows = filtrar();
      var ing = rows.filter(function (m) { return m.Sentido === 'Ingreso' && m.Resultado === 'Permitido'; }).length;
      var sal = rows.filter(function (m) { return m.Sentido === 'Salida'; }).length;
      var neg = rows.filter(function (m) { return m.Resultado === 'Negado'; }).length;
      tblBox.replaceChildren(
        h('div', { class: 'row gap wrap between' },
          h('div', { class: 'row gap wrap' }, AP.pill(rows.length + ' registros', 'brand'), AP.pill(ing + ' ingresos', 'ok'), AP.pill(sal + ' salidas', 'muted'), neg ? AP.pill(neg + ' negados', 'deny') : null),
          h('div', { class: 'row gap' },
            h('button', { class: 'btn', type: 'button', disabled: !rows.length, onclick: function () { exp('xlsx', rows); } }, AP.icon('download', 18), 'Excel'),
            h('button', { class: 'btn', type: 'button', disabled: !rows.length, onclick: function () { exp('csv', rows); } }, AP.icon('download', 18), 'CSV'))),
        simpleTableMov(rows));
    }
    function simpleTableMov(rows) {
      var lim = rows.slice(0, 300);
      return h('div', { class: 'stack sm' }, simpleTable([
        ['Fecha y hora', function (m) { return U.fDateTime(m.FechaHora); }],
        ['Movimiento', function (m) { return m.Resultado === 'Negado' ? AP.pill('Negado', 'deny') : AP.pill(m.Sentido, m.Sentido === 'Ingreso' ? 'ok' : 'muted'); }],
        ['Nombre', function (m) { return h('div', null, h('strong', null, m.Title), h('small', { class: 'block muted' }, (m.TipoDoc || '') + ' ' + (m.NumDoc || ''))); }],
        ['Categoría', function (m) { return m.Categoria; }],
        ['Empresa / anfitrión', function (m) { return [m.Empresa, m.Anfitrion].filter(Boolean).join(' · '); }],
        ['Placa', function (m) { return m.Placa; }],
        ['Vigilante', function (m) { return m.Vigilante; }],
        ['', function (m) { return h('div', { class: 'row gap nowrap' }, m.Excepcion ? AP.pill('Excepción', 'warn') : null, m.SinConexion ? AP.pill('Sin conexión', 'muted') : null,
          AP.Session.can('admin') ? h('button', { class: 'btn small danger-outline', type: 'button', title: 'Borrar registro', onclick: function (e) { e.stopPropagation(); borrarMovimiento(m); } }, AP.icon('trash', 16)) : null); }]
      ], lim, detalle), rows.length > 300 ? h('p', { class: 'muted small' }, 'Se muestran 300 de ' + rows.length + '. La exportación incluye todos.') : null);
    }
    async function borrarMovimiento(m) {
      var ok = await new Promise(function (res) {
        AP.modal({
          title: 'Borrar movimiento',
          body: function (close) {
            return h('div', { class: 'stack' },
              h('p', null, '¿Confirma el borrado definitivo del registro de ', h('strong', null, m.Sentido === 'Negado' ? 'ingreso negado' : m.Sentido), ' de ', h('strong', null, m.Title), ' (', U.fDateTime(m.FechaHora), ')? Esta acción no se puede deshacer.'),
              h('div', { class: 'row gap' },
                h('button', { class: 'btn danger', type: 'button', onclick: function () { res(true); close(); } }, AP.icon('trash', 16), 'Borrar definitivamente'),
                h('button', { class: 'btn ghost', type: 'button', onclick: function () { res(false); close(); } }, 'Cancelar')));
          },
          onClose: function () { res(false); }
        });
      });
      if (!ok) return;
      try {
        await AP.B.borrarFisico('AP_Movimientos', m.id);
        datos = datos.filter(function (x) { return x.id !== m.id; });
        pintar();
        AP.toast('Movimiento borrado.', 'ok');
      } catch (e) { AP.toast(e.message || 'No fue posible borrar el movimiento.', 'err'); }
    }
    function detalle(m) {
      AP.modal({
        title: (m.Resultado === 'Negado' ? 'Ingreso negado' : m.Sentido) + ' — ' + m.Title, size: 'wide',
        body: h('div', { class: 'kv-grid' }, COLS_MOV.map(function (c) { var v = c[1](m); return v ? h('div', { class: 'kv' }, h('span', null, c[0]), h('strong', { class: c[0].indexOf('SHA') >= 0 || c[0].indexOf('Id.') >= 0 ? 'mono' : '' }, String(v))) : null; }),
          m.DatosAdicionales ? h('div', { class: 'kv' }, h('span', null, 'Datos adicionales'), h('strong', null, m.DatosAdicionales)) : null)
      });
    }
    async function consultar() {
      var a = U.fromLocal(desde.value, '00:00'), b = U.fromLocal(hasta.value, '23:59');
      if (!a || !b || b < a) return AP.toast('Revise el rango de fechas.', 'warn');
      if ((b - a) / 86400000 > 400) return AP.toast('Consulte máximo 400 días por vez.', 'warn');
      tblBox.replaceChildren(AP.spinner('Consultando historial…'));
      try {
        datos = await AP.B.listRange('AP_Movimientos', 'FechaHora', a, new Date(b.getTime() + 59999));
        pintar();
      } catch (e) { tblBox.replaceChildren(errBox(e)); }
    }
    function exp(fmt, rows) {
      AP.exportar('Historial_ingresos_salidas', COLS_MOV, rows, fmt, [
        ['Documento', 'Historial de ingresos y salidas — ' + AP.CFG.porteria],
        ['Periodo', desde.value + ' a ' + hasta.value], ['Filtros', [cat.value, mov.value, txt.value].filter(Boolean).join(' · ') || 'ninguno'],
        ['Generado por', AP.Session.user.nombre + ' (' + AP.Session.user.upn + ')'], ['Fecha de generación', U.fDateTime(new Date())],
        ['Registros', rows.length], ['Fuente', 'Base de datos Firebase — colección AP_Movimientos']
      ]);
    }
    [cat, mov].forEach(function (s) { s.addEventListener('change', pintar); });
    txt.addEventListener('input', U.debounce(pintar, 200));
    AP.add(content, h('div', { class: 'filters' }, AP.field('Desde', desde), AP.field('Hasta', hasta), cat, mov, txt,
      h('button', { class: 'btn primary', type: 'button', onclick: consultar }, AP.icon('search', 18), 'Consultar')), tblBox);
    if (AP.Session.can('consola')) AP.consolaShell('/consola/historial', 'Historial de ingresos y salidas', content);
    else AP.porteriaShell('Historial', content, { back: '/porteria' });
    consultar();
  });

  // =================== INSPECCIONES ===================
  AP.route('/consola/inspecciones', function () {
    if (!guard()) return;
    var content = h('div', { class: 'stack' });
    var desde = AP.input('desde', U.ymd(U.addDays(new Date(), -30)), { type: 'date' });
    var hasta = AP.input('hasta', U.ymd(), { type: 'date' });
    var txt = AP.input('txt', '', { type: 'search', placeholder: 'Placa, contenedor, precinto, conductor o vigilante' });
    var res = AP.select('res', [['', 'Todos los resultados'], 'Conforme', 'No conforme'], '');
    var box = h('div');
    var datos = [];
    AP.consolaShell('/consola/inspecciones', 'Inspecciones de carga', content);
    function filtrar() {
      return datos.filter(function (i) {
        if (res.value && i.Resultado !== res.value) return false;
        return AP.coincide(i, txt.value, ['Placa', 'Remolque', 'Contenedor', 'Precintos', 'Conductor', 'DocConductor', 'Transportadora', 'Operacion', 'Vigilante']);
      }).sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
    }
    res.addEventListener('change', function () { pintar(); });
    var COLS = [
      ['Fecha', function (i) { return U.fDateTime(i.FechaHora); }, 16], ['Operación', function (i) { return i.Operacion; }, 24], ['Placa', function (i) { return i.Placa; }, 10],
      ['Remolque', function (i) { return i.Remolque; }, 10], ['Contenedor', function (i) { return i.Contenedor; }, 14], ['Transportadora', function (i) { return i.Transportadora; }, 24],
      ['Conductor', function (i) { return i.Conductor; }, 26], ['Doc. conductor', function (i) { return i.DocConductor; }, 14], ['Precintos', function (i) { return i.Precintos; }, 22],
      ['Resultado', function (i) { return i.Resultado; }, 12], ['No conformidades', function (i) { return i.NoConformidades; }, 40], ['Testigo', function (i) { return i.Testigo; }, 22],
      ['Vigilante', function (i) { return i.Vigilante; }, 22], ['Fotos', function (i) { return fotosDe(i).length; }, 6], ['Sin conexión', function (i) { return U.yesNo(i.SinConexion); }, 9],
      ['Observaciones', function (i) { return i.Observaciones; }, 30], ['Id. registro', function (i) { return i.IdLocal; }, 38], ['Huella SHA-256', function (i) { return i.Hash; }, 66]
    ];
    function fotosDe(i) { try { return JSON.parse(i.Fotos || '[]'); } catch (e) { return []; } }
    function pintar() {
      var rows = filtrar();
      box.replaceChildren(h('div', { class: 'row gap wrap between' },
        h('div', { class: 'row gap' }, AP.pill(rows.length + ' inspecciones', 'brand'), AP.pill(rows.filter(function (i) { return i.Resultado === 'No conforme'; }).length + ' no conformes', 'deny')),
        h('button', { class: 'btn', type: 'button', disabled: !rows.length, onclick: function () {
          AP.exportar('Inspecciones_carga', COLS, rows, 'xlsx', [['Periodo', desde.value + ' a ' + hasta.value], ['Filtro', [res.value, txt.value].filter(Boolean).join(' · ') || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
        } }, AP.icon('download', 18), 'Excel')),
        simpleTable([
          ['Fecha', function (i) { return U.fDateTime(i.FechaHora); }], ['Operación', function (i) { return i.Operacion; }],
          ['Vehículo', function (i) { return h('div', null, h('strong', null, i.Placa), h('small', { class: 'block muted' }, [i.Remolque, i.Contenedor].filter(Boolean).join(' · '))); }],
          ['Conductor', function (i) { return h('div', null, i.Conductor || '', h('small', { class: 'block muted' }, i.Transportadora || '')); }],
          ['Precintos', function (i) { return i.Precintos; }], ['Resultado', function (i) { return AP.estadoPill(i.Resultado); }],
          ['Fotos', function (i) { return String(fotosDe(i).length); }],
          ['', function (i) { return h('button', { class: 'btn small', type: 'button', title: 'Descargar informe en Word', onclick: function (e) { e.stopPropagation(); AP.informeInspeccion(i); } }, AP.icon('word', 16), 'Word'); }]
        ], rows, detalle));
    }
    function detalle(i) {
      var chk = []; try { chk = JSON.parse(i.Checklist || '[]'); } catch (e) { /* */ }
      var pv = []; try { pv = JSON.parse(i.PrecintosVerificacion || '[]'); } catch (e) { /* */ }
      var gal = h('div', { class: 'gallery' });
      fotosDe(i).forEach(function (f) {
        var fig = h('figure', null, h('div', { class: 'ph' }), h('figcaption', null, f.etiqueta || f.nombre));
        gal.appendChild(fig);
        AP.B.fileUrl(f.ruta).then(function (u) {
          if (!u) return;
          var a = h('a', { href: f.url && f.url.indexOf('demo://') !== 0 ? f.url : u, target: '_blank', rel: 'noopener' }, h('img', { src: u, alt: f.etiqueta || '' }));
          fig.replaceChild(a, fig.firstChild);
        }).catch(function () { fig.firstChild.textContent = 'No disponible'; });
      });
      AP.modal({
        title: i.Operacion + ' — ' + i.Placa, size: 'wide',
        body: h('div', { class: 'stack' },
          h('div', { class: 'kv-grid' }, COLS.filter(function (c) { return ['No conformidades', 'Fotos'].indexOf(c[0]) < 0; }).map(function (c) { var v = c[1](i); return v ? h('div', { class: 'kv' }, h('span', null, c[0]), h('strong', { class: /SHA|Id\./.test(c[0]) ? 'mono' : '' }, String(v))) : null; })),
          i.NoConformidades ? h('div', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, i.NoConformidades)) : null,
          h('h3', null, 'Puntos inspeccionados'),
          h('div', { class: 'chk-view' }, chk.map(function (c) { return h('div', { class: 'chk-v ' + (c.estado === 'NC' ? 'deny' : '') }, h('span', null, c.punto), h('strong', null, c.estado === 'C' ? 'Conforme' : c.estado === 'NC' ? 'No conforme' + (c.nota ? ': ' + c.nota : '') : 'N/A')); })),
          pv.length ? h('h3', null, 'Precintos — verificación VVTT') : null,
          pv.map(function (p) { return h('div', { class: 'kv' }, h('span', null, p.numero), h('strong', null, ['ver', 'verificar', 'halar', 'girar'].map(function (k) { return (p[k] ? '✓ ' : '✗ ') + k; }).join('  '))); }),
          h('h3', null, 'Fotografías'), gal,
          h('p', { class: 'muted small' }, 'Cada fotografía conserva su huella SHA-256 en el registro de la inspección.'),
          h('div', { class: 'row gap wrap' }, h('button', { class: 'btn primary', type: 'button', onclick: function () { AP.informeInspeccion(i); } }, AP.icon('word', 18), 'Descargar informe en Word')))
      });
    }
    async function consultar() {
      var a = U.fromLocal(desde.value, '00:00'), b = U.fromLocal(hasta.value, '23:59');
      box.replaceChildren(AP.spinner('Consultando…'));
      try { datos = await AP.B.listRange('AP_Inspecciones', 'FechaHora', a, new Date(b.getTime() + 59999)); pintar(); }
      catch (e) { box.replaceChildren(errBox(e)); }
    }
    txt.addEventListener('input', U.debounce(pintar, 200));
    AP.add(content, h('div', { class: 'filters' }, AP.field('Desde', desde), AP.field('Hasta', hasta), res, txt,
      h('button', { class: 'btn primary', type: 'button', onclick: consultar }, AP.icon('search', 18), 'Consultar')), box);
    consultar();
  });

  // =================== BITÁCORA ===================
  AP.route('/consola/bitacora', function () {
    if (!guard('ver')) return;
    var content = h('div', { class: 'stack' });
    AP.consolaShell('/consola/bitacora', 'Bitácora de actuaciones', content);
    content.appendChild(AP.spinner());
    AP.B.listRange('AP_Bitacora', 'FechaHora', U.addDays(new Date(), -90), null).then(function (rows) {
      rows.sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
      var COLS = [['Fecha', function (r) { return U.fDateTime(r.FechaHora); }, 16], ['Acción', function (r) { return r.Accion; }, 22], ['Referencia', function (r) { return r.Referencia; }, 30],
        ['Usuario (verificado por el servidor)', function (r) { return r._createdBy || ''; }, 18], ['Detalle del usuario', function (r) { return r.Usuario; }, 28], ['Detalle', function (r) { return r.Detalle; }, 50], ['Huella SHA-256', function (r) { return r.Hash; }, 66]];
      var acciones = Array.from(new Set(rows.map(function (r) { return r.Accion; }).filter(Boolean))).sort();
      var fAcc = AP.select('accion', [['', 'Todas las acciones']].concat(acciones), '');
      var tbox = h('div');
      var qb = AP.buscador('Buscar en acción, referencia, usuario o detalle', pintarB);
      fAcc.addEventListener('change', pintarB);
      function filtradas() { return rows.filter(function (r) { return (!fAcc.value || r.Accion === fAcc.value) && AP.coincide(r, qb.value, ['Accion', 'Referencia', 'Usuario', 'Detalle', '_createdBy']); }); }
      function pintarB() {
        var l = filtradas();
        tbox.replaceChildren(h('p', { class: 'muted small' }, l.length + ' de ' + rows.length + ' anotaciones'),
          simpleTable(COLS.map(function (c) { return [c[0], c[0] === 'Huella SHA-256' ? function (r) { return r.Hash ? h('code', { class: 'mono small' }, r.Hash.slice(0, 16) + '…') : ''; } : c[1]]; }), l.slice(0, 500)),
          l.length > 500 ? h('p', { class: 'muted small' }, 'Se muestran 500; la descarga incluye todas las filtradas.') : null);
      }
      content.replaceChildren(
        h('p', { class: 'muted' }, 'Últimos 90 días. Las anotaciones de la bitácora no pueden modificarse ni borrarse (las reglas del servidor lo impiden).'),
        h('div', { class: 'filters' }, fAcc, qb, AP.btnExcel(function () {
          var l = filtradas();
          if (!l.length) return AP.toast('No hay anotaciones con el filtro actual.', 'warn');
          AP.exportar('Bitacora', COLS, l, 'xlsx', [['Filtro', [fAcc.value, qb.value].filter(Boolean).join(' · ') || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
        })),
        tbox);
      pintarB();
    }).catch(function (e) { content.replaceChildren(errBox(e)); });
  });

  // =================== INSTALACIÓN ===================
  AP.route('/consola/instalacion', function () {
    if (!guard('admin')) return;
    var content = h('div', { class: 'stack' });
    AP.consolaShell('/consola/instalacion', 'Instalación y configuración', content);
    var estado = h('div', { class: 'stack sm' }, AP.spinner('Verificando…'));
    async function verificar() {
      estado.replaceChildren(AP.spinner('Verificando…'));
      try {
        await AP.B.status();
        var fc = AP.CFG.firebase || {};
        estado.replaceChildren(
          h('div', { class: 'kv' }, h('span', null, 'Proyecto de Firebase'), h('strong', null, fc.projectId || '—'), AP.pill('Conectado', 'ok')),
          h('div', { class: 'kv' }, h('span', null, 'Inicio de sesión'), h('strong', null, 'Usuario y contraseña o PIN (sin correo)')),
          h('div', { class: 'kv' }, h('span', null, 'Colecciones'), h('strong', null, Object.keys(AP.SCHEMA).join(', '))));
      } catch (e) {
        estado.replaceChildren(h('div', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, 'No fue posible conectarse a Firebase: ' + e.message)));
      }
    }
    var reglas = [
      'Las reglas de seguridad de Firestore (archivo firestore.rules de la entrega) deben estar publicadas en la consola de Firebase: Firestore Database → Reglas.',
      'Con esas reglas, el servidor exige un usuario activo para leer o escribir. Solo el Administrador (Director de Seguridad Integral) crea, modifica y borra en la consola; el Analista y Gobierno Corporativo solo consultan y descargan; el jefe con personal a cargo ve y programa solo al personal que lo tiene como jefe inmediato, y Talento Humano consulta el personal propio y registra permisos y ausencias, sin borrar nada.',
      'Los registros de ingresos, salidas, inspecciones, turnos, verificaciones y bitácora no pueden modificarse ni borrarse por nadie, y cada uno queda firmado por el servidor con el usuario que lo hizo y la hora del servidor.',
      'Cuando un usuario se da de baja o se le restablece el PIN, su sesión anterior deja de tener acceso de inmediato.',
      'Si vuelve a publicar las reglas, use siempre la última versión entregada.'
    ];
    // Desde el ajuste del 23-oct-2026 el jefe con personal a cargo y Talento Humano consultan solo con igualdades (sin índices
    // compuestos). Estos dos índices son opcionales: solo permiten que vean los ingresos y salidas registrados antes.
    var indicesBox = h('div', { class: 'stack sm' }, h('p', { class: 'muted small' }, 'Oprima «Verificar índices» para ver su estado.'));
    var ayer = new Date(Date.now() - 864e5);
    var INDICES = [
      ['Ingresos y salidas anteriores a la actualización (jefe con personal a cargo)', 'AP_Movimientos', 'JefeId + FechaHora', [['JefeId', '==', 'indice'], ['FechaHora', '>=', ayer]]],
      ['Ingresos y salidas anteriores a la actualización (Talento Humano)', 'AP_Movimientos', 'Categoria + FechaHora', [['Categoria', 'in', ['Personal propio', 'Personal propio sin carné']], ['FechaHora', '>=', ayer]]]
    ];
    async function verificarIndices() {
      indicesBox.replaceChildren(AP.spinner('Verificando…'));
      var filas = [];
      for (var i = 0; i < INDICES.length; i++) {
        var x = INDICES[i];
        try { await AP.B.consulta(x[1], x[3], { limite: 1, probar: true }); filas.push(h('div', { class: 'kv' }, h('span', null, x[0]), h('strong', null, x[1] + ' (' + x[2] + ')'), AP.pill('Listo', 'ok'))); }
        catch (e) {
          filas.push(h('div', { class: 'kv' }, h('span', null, x[0]), h('strong', null, x[1] + ' (' + x[2] + ')'),
            e.indiceUrl ? h('a', { class: 'btn small primary', href: e.indiceUrl, target: '_blank', rel: 'noopener' }, AP.icon('settings', 16), 'Crear índice') : AP.pill(e.message, 'deny')));
        }
      }
      indicesBox.replaceChildren.apply(indicesBox, filas.concat([h('p', { class: 'muted small' }, '«Crear índice» abre la consola de Firebase con el índice ya llenado: inicie sesión con la cuenta propietaria del proyecto y oprima «Crear» (o «Guardar»). Tarda unos minutos; luego vuelva a verificar.')]));
    }
    AP.add(content,
      h('section', { class: 'card stack' }, h('h3', null, '1. Conexión'), estado,
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn', type: 'button', onclick: verificar }, AP.icon('sync', 18), 'Verificar'))),
      h('section', { class: 'card stack' }, h('h3', null, '2. Seguridad en el servidor'),
        h('ol', { class: 'steps' }, reglas.map(function (p) { return h('li', null, p); }))),
      h('section', { class: 'card stack' }, h('h3', null, '2a. Índices de la base de datos'),
        h('p', { class: 'small' }, 'Opcional. El jefe con personal a cargo y Talento Humano ya no necesitan índices compuestos: sus consultas funcionan sin crearlos. Estos dos índices solo permiten que vean los ingresos y salidas registrados antes de la actualización de octubre de 2026; si no se crean, esas pantallas funcionan igual y muestran un aviso. Los índices creados en entregas anteriores pueden dejarse o borrarse.'),
        indicesBox, h('div', { class: 'row gap wrap' }, h('button', { class: 'btn', type: 'button', onclick: verificarIndices }, AP.icon('search', 18), 'Verificar índices'))),
      h('section', { class: 'card stack' }, h('h3', null, '3. Este dispositivo'),
        h('div', { class: 'kv' }, h('span', null, 'Identificador'), h('strong', null, U.deviceId())),
        h('div', { class: 'kv' }, h('span', null, 'Almacenamiento sin conexión'), h('strong', null, AP.Store.isMemory() ? 'Temporal (este navegador no permite guardar datos)' : 'Disponible')),
        h('div', { class: 'kv' }, h('span', null, 'Registros pendientes'), h('strong', null, String(AP.Sync.pendingCount()))),
        h('div', { class: 'kv' }, h('span', null, 'Última actualización'), h('strong', null, AP.Sync.state.lastPull ? U.fDateTime(AP.Sync.state.lastPull) : 'nunca')),
        h('div', { class: 'kv' }, h('span', null, 'Versión'), h('strong', null, AP.VERSION + ' · modo ' + AP.CFG.modo)),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn', type: 'button', onclick: function () { AP.Sync.run().then(function () { AP.toast('Sincronizado.'); AP.render(); }); } }, AP.icon('sync', 18), 'Sincronizar ahora'),
          h('button', { class: 'btn danger-outline', type: 'button', onclick: async function () {
            if (AP.Sync.pendingCount()) return AP.toast('Hay registros pendientes de envío; sincronice antes de borrar.', 'warn');
            if (!(await AP.confirm('Borrar datos locales', 'Se eliminan del dispositivo las copias de personas, visitas y movimientos. No afecta los datos guardados en el servidor.', 'Borrar', 'danger'))) return;
            await AP.Store.clearAll(); AP.toast('Datos locales eliminados.'); setTimeout(function () { location.reload(); }, 800);
          } }, AP.icon('trash', 18), 'Borrar datos locales'))));
    verificar();
  });

  // =================== CARGA MASIVA ===================
  var MAPA = {
    'nombre': 'Title', 'nombres y apellidos': 'Title', 'nombre completo': 'Title', 'tipo': 'Tipo', 'tipo de persona': 'Tipo',
    'tipo doc': 'TipoDoc', 'tipo documento': 'TipoDoc', 'tipo de documento': 'TipoDoc', 'documento': 'NumDoc', 'numero de documento': 'NumDoc', 'n documento': 'NumDoc', 'cedula': 'NumDoc',
    'telefono': 'Telefono', 'celular': 'Telefono', 'correo': 'Correo', 'email': 'Correo', 'empresa': 'Empresa', 'cargo': 'Cargo', 'area': 'Area',
    'estado': 'Estado', 'vigente hasta': 'VigenciaHasta', 'vigencia': 'VigenciaHasta', 'placa': 'Placa', 'tipo de vehiculo': 'VehiculoTipo', 'vehiculo': 'VehiculoTipo',
    'autoriza datos': 'AutorizaDatos', 'autoriza foto': 'AutorizaFoto', 'observaciones': 'Observaciones',
    'clase de personal': 'TipoPersonal', 'tipo de personal': 'TipoPersonal', 'clase': 'TipoPersonal',
    'nit': '_NIT', 'nit empresa': '_NIT', 'nit de la empresa': '_NIT',
    'documento jefe inmediato': '_JefeDoc', 'documento del jefe inmediato': '_JefeDoc', 'cedula jefe inmediato': '_JefeDoc', 'jefe inmediato documento': '_JefeDoc',
    'numero de uniforme': 'NumUniforme', 'uniforme': 'NumUniforme', 'no de uniforme': 'NumUniforme', 'n de uniforme': 'NumUniforme'
  };
  var PLANTILLA = ['Nombre completo', 'Tipo', 'Tipo de documento', 'Número de documento', 'Teléfono', 'Correo', 'Empresa', 'NIT empresa', 'Cargo', 'Área', 'Estado', 'Vigente hasta', 'Placa', 'Tipo de vehículo', 'Autoriza datos', 'Autoriza foto', 'Observaciones', 'Clase de personal', 'Documento jefe inmediato', 'Número de uniforme'];

  // =================== ELEMENTOS (exclusivo del Director de Seguridad Integral) ===================
  // El Director registra qué elementos ingresa o retira cada persona registrada. Si salen y deben volver (préstamo,
  // reparación), se crea además el registro de REGRESO enlazado a la salida. El vigilante verifica la salida y el ingreso
  // al leer el QR de la persona, y el regreso también desde "Elementos" en portería. La persona recibe aviso y recordatorios
  // por WhatsApp o correo.
  AP.route('/consola/elementos', function (qs) {
    if (!AP.Session.consulta()) { AP.go('/'); return; }
    var E = AP.Elem;
    var tab = qs.t || 'pendientes';
    var content = h('div', { class: 'stack' });
    var ED = AP.Session.can('editar');
    AP.consolaShell('/consola/elementos', 'Control de elementos', content,
      ED ? h('button', { class: 'btn primary', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Nuevo registro') : AP.pill('Solo consulta', 'muted'));
    var registros = [];
    var MAX_FOTOS = 4;
    var mapa = {};

    function clase(x) { return x.EsRegreso ? 'Regreso' : x.Sentido; }
    function estadoTxt(x) { return E.estado(x, mapa).t; }
    var COLS = [
      ['Persona', function (x) { return x.Title; }, 30], ['Documento', function (x) { return x.PersonaDoc; }, 16],
      ['Tipo', function (x) { return x.PersonaTipo; }, 18], ['Empresa', function (x) { return x.PersonaEmpresa; }, 22],
      ['Registro', clase, 10], ['Fecha prevista', function (x) { return U.toDate(x.FechaPrevista); }, 17],
      ['Elementos', function (x) { return E.resumen(E.items(x)); }, 60], ['Fotografías', function (x) { return E.fotos(x).length; }, 11],
      ['Autorizado por', function (x) { return x.AutorizadoPor; }, 28], ['Doc. de quien autoriza', function (x) { return x.AutorizadoPorDoc; }, 16],
      ['Estado', estadoTxt, 20], ['Debe regresar', function (x) { return x.EsRegreso ? '' : U.yesNo(!!x.DebeRegresar); }, 11],
      ['Regreso previsto', function (x) { return x.DebeRegresar && x.FechaRegresoPrevista ? U.toDate(x.FechaRegresoPrevista) : x.EsRegreso ? U.toDate(x.FechaPrevista) : ''; }, 17],
      ['Verificado por', function (x) { return x.Vigilante; }, 24], ['Fecha de verificación', function (x) { return x.FechaConfirmacion ? U.toDate(x.FechaConfirmacion) : ''; }, 17],
      ['Nota de portería', function (x) { return x.NotaPorteria; }, 40], ['Observaciones', function (x) { return x.Observaciones; }, 40],
      ['Aviso a la persona', function (x) { return x.AvisoPersona ? U.toDate(x.AvisoPersona) : ''; }, 17],
      ['Recordatorios', function (x) { return x.Recordatorios ? Number(x.Recordatorios) : ''; }, 12], ['Último recordatorio', function (x) { return x.UltimoRecordatorio ? U.toDate(x.UltimoRecordatorio) : ''; }, 17],
      ['Registrado por', function (x) { return x._createdBy || x.CreadoPor; }, 18], ['Fecha de registro', function (x) { return U.toDate(x.FechaCreacion); }, 17]
    ];

    // Registro completo: todos los registros (pendientes, verificados, con novedad y cancelados) por fecha prevista
    var desdeE = AP.input('desdeE', U.ymd(U.addDays(new Date(), -90)), { type: 'date' });
    var hastaE = AP.input('hastaE', U.ymd(U.addDays(new Date(), 30)), { type: 'date' });
    var fEstE = AP.select('estE', [['', 'Todos los estados']].concat(AP.CAT.estadosElemento), '');
    var fSentE = AP.select('sentE', [['', 'Salida, ingreso y regreso'], 'Salida', 'Ingreso', 'Regreso'], '');
    [fEstE, fSentE].forEach(function (s0) { s0.addEventListener('change', function () { pintarTabla(); }); });
    var rangoE = [];
    async function consultarRangoE() {
      var a0 = U.fromLocal(desdeE.value, '00:00'), b0 = U.fromLocal(hastaE.value, '23:59');
      if (!a0 || !b0 || isNaN(a0) || isNaN(b0) || b0 < a0) { AP.toast('Revise el rango de fechas.', 'warn'); return null; }
      if ((b0 - a0) / 86400000 > 400) { AP.toast('Consulte máximo 400 días por vez.', 'warn'); return null; }
      return AP.B.listRange('AP_Elementos', 'FechaPrevista', a0, new Date(b0.getTime() + 59999), {});
    }
    function rehacerMapa() { mapa = E.mapa(registros.concat(rangoE)); }
    async function cargar() {
      content.replaceChildren(AP.spinner('Consultando…'));
      try {
        registros = await AP.B.listRange('AP_Elementos', 'FechaCreacion', U.addDays(new Date(), -AP.DIAS_ELEMENTOS), null, {});
        if (tab === 'registro') rangoE = (await consultarRangoE()) || [];
        rehacerMapa();
        pintar();
      } catch (e) { content.replaceChildren(errBox(e)); }
    }
    async function recargarE() {
      tablaE.replaceChildren(AP.spinner('Consultando…'));
      try { var r = await consultarRangoE(); if (r) { rangoE = r; rehacerMapa(); pintar(); } else pintarTabla(); }
      catch (e) { tablaE.replaceChildren(errBox(e)); }
    }

    var qe = AP.buscador('Buscar persona, documento, elemento, serial o quien autoriza', function () { pintarTabla(); });
    var listaE = [], tablaE = h('div');
    function filtradosE() {
      return listaE.filter(function (x) {
        if (fEstE.value && x.Estado !== fEstE.value) return false;
        if (fSentE.value && clase(x) !== fSentE.value) return false;
        return AP.coincide(x, qe.value, ['Title', 'PersonaDoc', 'PersonaEmpresa', 'PersonaTipo', 'AutorizadoPor', estadoTxt, clase, 'Vigilante', 'NotaPorteria', function (r) { return E.resumen(E.items(r)); }]);
      });
    }
    var NOMBRES_E = { pendientes: 'Pendientes', regresar: 'Por regresar', hoy: 'Hoy', historial: 'Últimos 60 días', registro: 'Registro completo' };
    function porRegresar() {
      return registros.filter(function (x) { return x.EsRegreso && (E.regresoActivo(x, mapa) || (x.Estado === 'Rechazado' && x.FechaConfirmacion && new Date(x.FechaConfirmacion) >= U.addDays(new Date(), -30))); });
    }

    function pintar() {
      var hoy = U.ymd(), hace60 = U.addDays(new Date(), -60).toISOString();
      var grupos = {
        pendientes: registros.filter(function (x) { return x.Estado === 'Pendiente' && !x.EsRegreso; }),
        regresar: porRegresar(),
        hoy: registros.filter(function (x) { return U.ymd(x.FechaPrevista) === hoy && x.Estado !== 'Cancelado' && (!x.EsRegreso || E.regresoActivo(x, mapa) || x.Estado !== 'Pendiente'); }),
        historial: registros.filter(function (x) { return (x.FechaCreacion || '') >= hace60; }),
        registro: rangoE.slice()
      };
      var vencidos = grupos.regresar.filter(function (x) { return E.vencido(x); }).length;
      var lista = (grupos[tab] || []).slice().sort(function (a, b) {
        return tab === 'historial' || tab === 'registro' ? (a.FechaPrevista < b.FechaPrevista ? 1 : -1) : (a.FechaPrevista < b.FechaPrevista ? -1 : 1);
      });
      var tabs = h('div', { class: 'tabs' }, [['pendientes', 'Pendientes'], ['regresar', 'Por regresar'], ['hoy', 'Hoy'], ['historial', 'Últimos 60 días'], ['registro', 'Registro completo (por fechas)']].map(function (t) {
        return h('a', { class: t[0] === tab ? 'on' : '', href: '#/consola/elementos?t=' + t[0] }, t[1] + (t[0] !== 'registro' ? ' (' + grupos[t[0]].length + ')' : ''),
          t[0] === 'regresar' && vencidos ? h('b', { class: 'nav-badge', title: 'Regresos vencidos' }, String(vencidos)) : null);
      }));
      listaE = lista;
      var cuenta = {}; lista.forEach(function (x) { var e = estadoTxt(x); cuenta[e] = (cuenta[e] || 0) + 1; });
      var barra = h('div', { class: 'stack sm' },
        tab === 'regresar'
          ? h('p', { class: 'banner info' }, AP.icon('package', 18), h('span', null, 'Elementos que salieron y deben regresar. El vigilante los ve en "Elementos" (portería) y marca cuando vuelven. Envíe recordatorios por WhatsApp o correo; quedan anotados con su fecha. También se muestran los regresos con novedad de los últimos 30 días.'))
          : h('p', { class: 'muted small' }, 'Los registros pendientes aparecen al vigilante en "Elementos" (portería) y en la pantalla de verificación cuando lee el QR de la persona. Ningún registro se borra: los cancelados y los verificados quedan en el registro completo.'),
        tab === 'registro' ? h('div', { class: 'filters' }, AP.field('Fecha prevista desde', desdeE), AP.field('Hasta', hastaE),
          h('button', { class: 'btn primary', type: 'button', onclick: recargarE }, AP.icon('search', 18), 'Consultar'),
          h('div', { class: 'row gap wrap' }, Object.keys(cuenta).sort().map(function (e) { return AP.pill(e + ': ' + cuenta[e], /Regresó con|No coinc|vencido/.test(e) ? 'deny' : /^(Pendiente|Por regresar)/.test(e) ? 'warn' : /^(Salió|Ingresó|Regresó)$/.test(e) ? 'ok' : 'muted'); }))) : null,
        h('div', { class: 'filters' }, fSentE, fEstE, qe, AP.btnExcel(function () {
          var l = filtradosE();
          if (!l.length) return AP.toast('No hay registros con el filtro actual.', 'warn');
          AP.exportar(tab === 'regresar' ? 'Elementos_por_regresar' : 'Control_elementos', COLS, l, 'xlsx', [['Vista', NOMBRES_E[tab] + (tab === 'registro' ? ' (' + desdeE.value + ' a ' + hastaE.value + ')' : '')],
            ['Filtros', [fSentE.value, fEstE.value, qe.value].filter(Boolean).join(' · ') || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
        })));
      content.replaceChildren(tabs, barra, tablaE);
      pintarTabla();
    }
    function pintarTabla() {
      var cols = tab === 'regresar' ? [
        ['Persona', function (x) { return h('div', null, h('strong', null, x.Title), h('small', { class: 'block muted' }, [x.PersonaDoc, x.PersonaTipo, x.PersonaEmpresa].filter(Boolean).join(' · '))); }],
        ['Elementos', celdaElementos],
        ['Salió', function (x) { var s = mapa[x.SalidaId]; return s && s.FechaConfirmacion ? h('div', null, U.fDateTime(s.FechaConfirmacion), h('small', { class: 'block muted' }, s.Vigilante || '')) : '—'; }],
        ['Debe regresar', function (x) {
          var dias = Math.floor((Date.now() - new Date(x.FechaPrevista).getTime()) / 86400000);
          return h('div', null, U.fDateTime(x.FechaPrevista), E.vencido(x) ? h('small', { class: 'block txt-deny' }, 'Vencido' + (dias >= 1 ? ' hace ' + dias + ' día' + (dias > 1 ? 's' : '') : '')) : null);
        }],
        ['Recordatorios', function (x) { return x.Recordatorios ? h('div', null, String(x.Recordatorios), h('small', { class: 'block muted' }, 'Último: ' + U.fDateTime(x.UltimoRecordatorio))) : h('small', { class: 'muted' }, 'Ninguno'); }],
        ['Estado', function (x) { return h('div', null, E.pill(x, mapa), x.NotaPorteria ? h('small', { class: 'block muted' }, x.NotaPorteria) : null); }],
        ['', function (x) {
          return ED && E.regresoActivo(x, mapa) ? h('div', { class: 'row gap nowrap' },
            h('button', { class: 'btn small primary', type: 'button', onclick: function (e) { e.stopPropagation(); avisar(x, 'recordatorio'); } }, AP.icon('bell', 16), 'Recordar'),
            h('button', { class: 'btn small', type: 'button', title: 'Editar fecha de regreso', onclick: function (e) { e.stopPropagation(); editarRegreso(x); } }, AP.icon('edit', 16))) : null;
        }]
      ] : [
        ['Persona', function (x) { return h('div', null, h('strong', null, x.Title), h('small', { class: 'block muted' }, [x.PersonaDoc, x.PersonaTipo, x.PersonaEmpresa].filter(Boolean).join(' · '))); }],
        ['Registro', function (x) { return h('div', null, AP.pill(x.EsRegreso ? 'Regreso' : x.Sentido, x.Sentido === 'Ingreso' && !x.EsRegreso ? 'ok' : 'warn'), x.DebeRegresar && !x.EsRegreso ? h('small', { class: 'block muted' }, 'Debe regresar: ' + U.fDate(x.FechaRegresoPrevista)) : null); }],
        ['Fecha prevista', function (x) { return h('div', null, U.fDateTime(x.FechaPrevista), x.Estado === 'Pendiente' && U.ymd(x.FechaPrevista) < U.ymd() ? h('small', { class: 'block txt-deny' }, x.EsRegreso ? 'Regreso vencido' : 'Fecha vencida') : null); }],
        ['Elementos', celdaElementos],
        ['Autoriza', function (x) { return x.AutorizadoPor; }],
        ['Estado', function (x) {
          var reg = x.RegresoId ? mapa[x.RegresoId] : null;
          return h('div', null, E.pill(x, mapa), x.Vigilante ? h('small', { class: 'block muted' }, x.Vigilante + (x.FechaConfirmacion ? ' · ' + U.fDateTime(x.FechaConfirmacion) : '')) : null,
            reg && x.Estado === 'Confirmado' ? h('small', { class: 'block' }, 'Regreso: ', E.pill(reg, mapa)) : null);
        }],
        ['', function (x) {
          return !ED || x.Estado !== 'Pendiente' || (x.EsRegreso && !E.regresoActivo(x, mapa)) ? null : h('div', { class: 'row gap nowrap' },
            x.EsRegreso ? h('button', { class: 'btn small', type: 'button', title: 'Recordar el regreso', onclick: function (e) { e.stopPropagation(); avisar(x, 'recordatorio'); } }, AP.icon('bell', 16))
              : h('button', { class: 'btn small', type: 'button', title: 'Avisar a la persona', onclick: function (e) { e.stopPropagation(); avisar(x, 'aviso'); } }, AP.icon('whatsapp', 16)),
            h('button', { class: 'btn small', type: 'button', title: 'Editar', onclick: function (e) { e.stopPropagation(); editar(x); } }, AP.icon('edit', 16)),
            x.EsRegreso ? null : h('button', { class: 'btn small danger-outline', type: 'button', onclick: function (e) { e.stopPropagation(); cancelar(x); } }, 'Cancelar'));
        }]
      ];
      tablaE.replaceChildren(simpleTable(cols, filtradosE(), detalle));
    }
    function celdaElementos(x) {
      var it = E.items(x), nf = E.fotos(x).length;
      return h('div', null, it.slice(0, 2).map(function (i) { return h('div', null, (i.cant > 1 ? i.cant + ' × ' : '') + i.desc); }),
        it.length > 2 ? h('small', { class: 'muted' }, '+ ' + (it.length - 2) + ' más') : null,
        nf ? h('small', { class: 'block muted' }, AP.icon('camera', 13), ' ' + nf + ' foto' + (nf > 1 ? 's' : '')) : null);
    }
    cargar();

    // ---------- Aviso y recordatorio a la persona (WhatsApp o correo) ----------
    var contactos = null;
    async function contactoDe(x) {
      if (!contactos) {
        var ps = [], vs = [];
        try { ps = await AP.B.listAll('AP_Personas', { exclude: ['Foto'] }); } catch (e) { /* sin datos */ }
        try { vs = await AP.B.listRange('AP_Visitas', 'FechaFin', U.addDays(new Date(), -AP.DIAS_ELEMENTOS), null, { exclude: ['Foto'] }); } catch (e) { /* sin datos */ }
        contactos = ps.concat(vs);
      }
      var d = U.normDoc(x.PersonaDoc || '');
      var p = contactos.find(function (c) { return x.Token && c.Token === x.Token; }) || contactos.find(function (c) { return d && U.normDoc(c.NumDoc) === d; });
      return { nombre: (p && p.Title) || x.Title, tel: (p && p.Telefono) || '', correo: (p && p.Correo) || '' };
    }
    async function avisar(x, tipo, contacto) {
      var c = contacto || await contactoDe(x);
      var num = AP.waNum(c.tel);
      var rec = tipo === 'recordatorio';
      var texto = rec ? E.textoRecordatorio(x, mapa[x.SalidaId], c.nombre) : E.textoAviso(x, c.nombre);
      var asunto = rec ? 'Recordatorio: elementos pendientes por regresar — ' + AP.CFG.empresa : 'Registro de elementos a su nombre — ' + AP.CFG.empresa;
      async function marcar(canal) {
        var ahora = new Date().toISOString();
        var upd = rec ? { Recordatorios: (Number(x.Recordatorios) || 0) + 1, UltimoRecordatorio: ahora } : { AvisoPersona: ahora };
        try { await AP.B.update('AP_Elementos', x.id, upd); Object.assign(x, upd); registros.forEach(function (z) { if (z.id === x.id && z !== x) Object.assign(z, upd); }); } catch (e) { /* el envío ya ocurrió; la marca es informativa */ }
        AP.Audit.log(rec ? 'Recordatorio de regreso de elementos' : 'Aviso de registro de elementos', x.Title + ' (' + (x.PersonaDoc || '') + ')', canal + ' | ' + E.resumen(E.items(x)));
        if (location.hash.indexOf('#/consola/elementos') === 0) pintarTabla();
      }
      AP.modal({
        title: rec ? 'Recordar el regreso — ' + x.Title : 'Avisar a ' + x.Title,
        body: function (close) {
          var correo = AP.input('correo', c.correo, { type: 'email', placeholder: 'correo@ejemplo.com' });
          return h('div', { class: 'stack' },
            h('p', { class: 'muted small' }, rec ? 'Mensaje de recordatorio (puede revisarlo antes de enviarlo):' : 'Mensaje para la persona que registró los elementos:'),
            h('p', { class: 'note', style: { whiteSpace: 'pre-line' } }, texto),
            num ? h('a', { class: 'btn primary', href: AP.waLink(num, texto), target: '_blank', rel: 'noopener', onclick: function () { marcar('WhatsApp ' + c.tel); setTimeout(close, 300); } }, AP.icon('whatsapp', 18), 'Enviar por WhatsApp a ' + c.tel)
              : h('p', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, 'La persona no tiene un celular válido registrado (en Personas o en su visita). Actualícelo para enviarle el mensaje por WhatsApp, o use el correo.')),
            AP.field('Correo de la persona', correo),
            h('div', { class: 'row gap wrap end' },
              h('button', { class: 'btn', type: 'button', onclick: async function () {
                var to = correo.value.trim();
                if (!EMAIL_RE.test(to)) return AP.toast('Escriba un correo válido.', 'warn');
                try { await AP.B.sendMail({ to: [to], subject: asunto, html: AP.esc(texto).replace(/\n/g, '<br>') }); await marcar('Correo ' + to); close(); }
                catch (e) { AP.toast('No se pudo preparar el correo: ' + e.message, 'error'); }
              } }, AP.icon('mail', 18), 'Enviar por correo'),
              navigator.clipboard ? h('button', { class: 'btn', type: 'button', onclick: function () { navigator.clipboard.writeText(texto).then(function () { AP.toast('Mensaje copiado.'); }, function () { AP.toast('No fue posible copiar.', 'warn'); }); } }, AP.icon('file', 18), 'Copiar mensaje') : null,
              h('button', { class: 'btn ghost', type: 'button', onclick: function () { close(); } }, 'Ahora no')));
        }
      });
    }

    // ---------- Formulario ----------
    function filaItem(item) {
      item = item || {};
      var desc = AP.input('desc', item.desc || '', { placeholder: 'Ej.: taladro percutor DeWalt', maxlength: 120 });
      var cant = AP.input('cant', item.cant || 1, { type: 'number', min: 1, max: 999, inputmode: 'numeric' });
      var serial = AP.input('serial', item.serial || '', { placeholder: 'Opcional', maxlength: 60 });
      var fila = h('div', { class: 'elem-fila' });
      fila.append(AP.field('Elemento *', desc), AP.field('Cant.', cant), AP.field('Serial / código', serial),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Quitar elemento', title: 'Quitar elemento', onclick: function () { fila.remove(); } }, AP.icon('trash', 18)));
      fila._leer = function () {
        var d = desc.value.trim();
        if (!d) return null;
        var o = { desc: d, cant: Math.max(1, Math.min(999, parseInt(cant.value, 10) || 1)) };
        if (serial.value.trim()) o.serial = serial.value.trim();
        return o;
      };
      return fila;
    }

    // Regreso: solo se ajusta la fecha prevista y las indicaciones (los elementos son los de la salida)
    function editarRegreso(x) {
      AP.modal({ title: 'Regreso de elementos — ' + x.Title, body: function (close) {
        var f = AP.input('fecha', U.toLocalInput(x.FechaPrevista), { type: 'datetime-local' });
        var o = AP.textarea('obs', x.Observaciones || '', { rows: 2 });
        return h('div', { class: 'stack' }, E.tabla(E.items(x)),
          AP.field('Fecha prevista de regreso *', f), AP.field('Indicaciones para el vigilante', o),
          h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
            h('button', { class: 'btn primary', type: 'button', onclick: async function () {
              var d = U.fromLocalInput(f.value);
              if (!d || isNaN(d)) return AP.toast('Indique la fecha prevista de regreso.', 'warn');
              try {
                var upd = { FechaPrevista: d.toISOString(), Observaciones: o.value.trim() };
                await AP.B.update('AP_Elementos', x.id, upd); Object.assign(x, upd);
                var s = mapa[x.SalidaId];
                if (s) { await AP.B.update('AP_Elementos', s.id, { FechaRegresoPrevista: upd.FechaPrevista }); s.FechaRegresoPrevista = upd.FechaPrevista; }
                await AP.Audit.log('Modificación de fecha de regreso de elementos', x.Title + ' (' + (x.PersonaDoc || '') + ')', 'Nueva fecha: ' + U.fDateTime(d));
                close(); AP.toast('Fecha de regreso actualizada.'); pintar();
              } catch (e) { AP.toast(e.message, 'error'); }
            } }, AP.icon('check', 18), 'Guardar')));
      } });
    }

    function editar(x) {
      if (x && x.EsRegreso) { if (E.regresoActivo(x, mapa) || x.Estado === 'Pendiente') editarRegreso(x); else detalle(x); return; }
      if (x && x.Estado !== 'Pendiente') { detalle(x); return; }
      var nuevo = !x;
      var carpeta = x ? x.id : U.uuid().slice(0, 12);
      var sel = x ? { tipo: x.PersonaTipo || '', rec: { Title: x.Title, NumDoc: x.PersonaDoc, Empresa: x.PersonaEmpresa, Token: x.Token } } : null;
      var fotosPrevias = x ? E.fotos(x) : [];
      var fotosNuevas = [];
      var candidatos = null;

      AP.modal({
        title: nuevo ? 'Nuevo registro de elementos' : 'Editar registro de elementos',
        size: 'wide',
        persistent: true,
        body: function (close) {
          // --- Persona registrada ---
          var personaBox = h('div', { class: 'stack sm' });
          var buscar = AP.input('buscarPersona', '', { type: 'search', placeholder: 'Documento o nombre (mínimo 3 caracteres)' });
          var resultados = h('div', { class: 'list' });
          async function obtenerCandidatos() {
            if (candidatos) return candidatos;
            var ps = await AP.B.listAll('AP_Personas', { exclude: ['Foto'] });
            var vs = await AP.B.listRange('AP_Visitas', 'FechaFin', U.addDays(new Date(), -1), null, { exclude: ['Foto'] });
            candidatos = ps.filter(function (p) { return p.Token; }).map(function (p) { return { tipo: p.Tipo || 'Persona', rec: p, estado: p.Estado }; })
              .concat(vs.filter(function (v) { return v.Token && (v.Estado === 'Aprobada' || v.Estado === 'Pendiente'); })
                .map(function (v) { return { tipo: 'Visitante', rec: v, estado: v.Estado, visita: true }; }));
            return candidatos;
          }
          var filtrar = U.debounce(async function () {
            var t = U.fold(buscar.value), d = U.normDoc(buscar.value);
            if (t.length < 3) { resultados.replaceChildren(h('p', { class: 'muted small' }, 'Escriba al menos 3 caracteres del documento o del nombre.')); return; }
            resultados.replaceChildren(AP.spinner('Buscando…'));
            try {
              var lista = (await obtenerCandidatos()).filter(function (c) {
                return (d.length >= 3 && U.normDoc(c.rec.NumDoc).indexOf(d) >= 0) || U.fold(c.rec.Title).indexOf(t) >= 0;
              }).slice(0, 12);
              resultados.replaceChildren.apply(resultados, lista.length ? lista.map(function (c) {
                return h('button', { class: 'list-item', type: 'button', onclick: function () { sel = c; pintarPersona(); } },
                  h('div', null, h('strong', null, c.rec.Title),
                    h('small', null, [(c.rec.TipoDoc || '') + ' ' + (c.rec.NumDoc || ''), c.tipo, c.rec.Empresa].filter(function (s) { return String(s || '').trim(); }).join(' · ')),
                    c.visita ? h('small', null, 'Visita: ' + U.fDateTime(c.rec.FechaInicio) + ' a ' + U.fTime(c.rec.FechaFin)) : null),
                  c.estado ? AP.estadoPill(c.estado) : null);
              }) : [AP.empty('search', 'Sin resultados', 'La persona debe estar registrada en Personas (o tener una visita vigente) para asignarle elementos.')]);
            } catch (e) { resultados.replaceChildren(h('p', { class: 'note' }, e.message)); }
          }, 250);
          buscar.addEventListener('input', filtrar);
          function pintarPersona() {
            if (sel) {
              var r0 = sel.rec;
              personaBox.replaceChildren(h('div', { class: 'sel-persona' },
                AP.icon(sel.tipo === 'Visitante' ? 'user' : 'badge', 22),
                h('div', null, h('strong', null, r0.Title),
                  h('small', { class: 'block muted' }, [(r0.TipoDoc || '') + ' ' + (r0.NumDoc || ''), sel.tipo, r0.Empresa].filter(function (s) { return String(s || '').trim(); }).join(' · ')),
                  sel.estado && sel.estado !== 'Habilitado' && sel.estado !== 'Aprobada' ? h('small', { class: 'block', style: { color: 'var(--deny)' } }, 'Atención: estado ' + sel.estado + '.') : null),
                h('button', { class: 'btn small', type: 'button', onclick: function () { sel = null; pintarPersona(); setTimeout(function () { try { buscar.focus(); } catch (e) { /* */ } }, 30); } }, 'Cambiar')));
            } else {
              personaBox.replaceChildren(AP.field('Buscar persona registrada *', buscar, 'Personal propio, contratistas, conductores o visitantes con visita vigente.'), resultados);
            }
          }
          pintarPersona();

          // --- Datos del registro ---
          var sentidoSel = AP.select('Sentido', AP.CAT.sentidosElemento, x ? x.Sentido : 'Salida');
          var fechaIn = AP.input('FechaPrevista', U.toLocalInput(x ? x.FechaPrevista : new Date()), { type: 'datetime-local' });
          var autoriza = AP.autorizaPicker({ fuente: function () { return AP.B.listAll('AP_Personas', { exclude: ['Foto'] }); }, valor: x || {} });
          var obsIn = AP.textarea('Observaciones', x ? x.Observaciones : '', { placeholder: 'Instrucciones para el vigilante (opcional)', rows: 2 });
          // --- Regreso (solo para salidas) ---
          var debeReg = AP.check('DebeRegresar', 'Los elementos deben regresar (préstamo, reparación, trabajo fuera de la sede)', !!(x && x.DebeRegresar));
          var fechaReg = AP.input('FechaRegresoPrevista', x && x.FechaRegresoPrevista ? U.toLocalInput(x.FechaRegresoPrevista) : '', { type: 'datetime-local' });
          var regBox = h('div', { class: 'stack sm span2' }, debeReg, h('div', { class: 'reg-fecha' }, AP.field('Fecha prevista de regreso *', fechaReg, 'El vigilante verá los elementos como pendientes por regresar desde que salgan; después de esta fecha aparecen vencidos.')));
          function pintarReg() {
            var esSal = sentidoSel.value === 'Salida';
            regBox.style.display = esSal ? '' : 'none';
            regBox.querySelector('.reg-fecha').style.display = esSal && debeReg.querySelector('input').checked ? '' : 'none';
          }
          sentidoSel.addEventListener('change', pintarReg);
          debeReg.querySelector('input').addEventListener('change', function () {
            if (debeReg.querySelector('input').checked && !fechaReg.value) {
              var base = U.fromLocalInput(fechaIn.value) || new Date();
              fechaReg.value = U.toLocalInput(U.fromLocal(U.ymd(U.addDays(base, 1)), '17:00'));
            }
            pintarReg();
          });

          // --- Elementos ---
          var listaItems = h('div', { class: 'stack sm' });
          var previos = x ? E.items(x) : [];
          (previos.length ? previos : [{}]).forEach(function (i) { listaItems.appendChild(filaItem(i)); });
          var addBtn = h('button', { class: 'btn small', type: 'button', onclick: function () { var f = filaItem(); listaItems.appendChild(f); try { f.querySelector('input').focus(); } catch (e) { /* */ } } }, AP.icon('plus', 16), 'Agregar otro elemento');

          // --- Fotografías ---
          var galeria = h('div', { class: 'gallery' });
          var fotoBtn = h('button', { class: 'btn small', type: 'button', onclick: async function () {
            if (fotosPrevias.length + fotosNuevas.length >= MAX_FOTOS) return AP.toast('Máximo ' + MAX_FOTOS + ' fotografías por solicitud.', 'warn');
            var file = await AP.pickImage(U.isMobile() ? 'environment' : null);
            if (!file) return;
            try {
              var r1 = await U.fotoEvidencia(file);
              var sha = await U.sha256(r1.blob);
              fotosNuevas.push({ blob: r1.blob, url: URL.createObjectURL(r1.blob), sha256: sha });
              pintarFotos();
            } catch (e) { AP.toast('No fue posible procesar la imagen: ' + e.message, 'error'); }
          } }, AP.icon('camera', 16), 'Agregar fotografía');
          function pintarFotos() {
            galeria.replaceChildren();
            fotosPrevias.forEach(function (f, i) {
              var fig = h('figure', null, h('div', { class: 'ph' }, 'Cargando…'), h('figcaption', null, f.etiqueta || 'Fotografía'),
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Quitar fotografía', onclick: function () { fotosPrevias.splice(i, 1); pintarFotos(); } }, AP.icon('x', 16)));
              galeria.appendChild(fig);
              AP.B.fileUrl(f.ruta).then(function (u) { if (u) fig.replaceChild(h('img', { src: u, alt: 'Fotografía de los elementos' }), fig.firstChild); else fig.firstChild.textContent = 'No disponible'; })
                .catch(function () { fig.firstChild.textContent = 'No disponible'; });
            });
            fotosNuevas.forEach(function (f, i) {
              galeria.appendChild(h('figure', null, h('img', { src: f.url, alt: 'Fotografía nueva' }), h('figcaption', null, 'Nueva'),
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Quitar fotografía', onclick: function () { URL.revokeObjectURL(f.url); fotosNuevas.splice(i, 1); pintarFotos(); } }, AP.icon('x', 16))));
            });
          }
          pintarFotos();

          var guardarBtn = h('button', { class: 'btn primary', type: 'button', onclick: guardar }, AP.icon('check', 18), nuevo ? 'Crear registro' : 'Guardar cambios');
          async function guardar() {
            var elems = Array.prototype.map.call(listaItems.querySelectorAll('.elem-fila'), function (f) { return f._leer(); }).filter(Boolean);
            var fecha = U.fromLocalInput(fechaIn.value);
            var conRegreso = sentidoSel.value === 'Salida' && debeReg.querySelector('input').checked;
            var fReg = conRegreso ? U.fromLocalInput(fechaReg.value) : null;
            if (!sel) return AP.toast('Seleccione la persona registrada.', 'warn');
            if (!fecha || isNaN(fecha)) return AP.toast('Indique la fecha y hora prevista.', 'warn');
            if (!autoriza.elegido()) return AP.toast('Seleccione de la lista de personas quién autoriza.', 'warn');
            if (!elems.length) return AP.toast('Agregue al menos un elemento con su descripción.', 'warn');
            if (conRegreso && (!fReg || isNaN(fReg))) return AP.toast('Indique la fecha prevista de regreso.', 'warn');
            if (conRegreso && fReg <= fecha) return AP.toast('La fecha de regreso debe ser posterior a la de salida.', 'warn');
            guardarBtn.disabled = true; guardarBtn.lastChild.textContent = 'Guardando…';
            try {
              // Las fotografías se suben primero; su huella SHA-256 queda en el registro
              var p = U.partsCO(fecha);
              var fotos = fotosPrevias.slice();
              for (var i = 0; i < fotosNuevas.length; i++) {
                var nombre = Date.now().toString(36) + '_' + (fotos.length + 1) + '.jpg';
                var up = await AP.B.upload('AP_Elementos/' + p.year + '/' + p.month + '/' + carpeta + '/' + nombre, fotosNuevas[i].blob);
                fotos.push({ nombre: nombre, etiqueta: 'Fotografía ' + (fotos.length + 1), ruta: up.path, sha256: fotosNuevas[i].sha256 });
              }
              var r0 = sel.rec;
              var data = Object.assign({
                Title: r0.Title, Token: r0.Token || '', PersonaTipo: sel.tipo || '', PersonaDoc: r0.NumDoc || '', PersonaEmpresa: r0.Empresa || '',
                Sentido: sentidoSel.value, FechaPrevista: fecha.toISOString(),
                Items: JSON.stringify(elems), Fotos: fotos.length ? JSON.stringify(fotos) : '', Observaciones: obsIn.value.trim(),
                DebeRegresar: conRegreso, FechaRegresoPrevista: conRegreso ? fReg.toISOString() : ''
              }, autoriza.valor());
              var ref = data.Title + ' (' + data.PersonaDoc + ') — ' + data.Sentido + ' ' + U.fDateTime(fecha);
              var rec;
              if (nuevo) {
                Object.assign(data, { Estado: 'Pendiente', CreadoPor: AP.Session.user.nombre || AP.Session.user.usuario, FechaCreacion: new Date().toISOString() });
                rec = await AP.B.create('AP_Elementos', data);
                await AP.Audit.log('Registro de elementos', ref, E.resumen(elems) + ' | Autoriza: ' + data.AutorizadoPor + (conRegreso ? ' | Debe regresar: ' + U.fDateTime(fReg) : ''));
              } else {
                await AP.B.update('AP_Elementos', x.id, data);
                rec = Object.assign(x, data);
                await AP.Audit.log('Modificación de registro de elementos', ref, E.resumen(elems) + (conRegreso ? ' | Debe regresar: ' + U.fDateTime(fReg) : ''));
              }
              await sincronizarRegreso(rec, conRegreso);
              fotosNuevas.forEach(function (f) { URL.revokeObjectURL(f.url); });
              close();
              await cargar();
              if (nuevo) {
                AP.toast('Registro creado. El vigilante lo verá en portería y al leer el QR de ' + data.Title + '.', 'info', 5000);
                avisar(rec, 'aviso', { nombre: r0.Title, tel: r0.Telefono || '', correo: r0.Correo || '' });
              } else AP.toast('Registro actualizado.');
            } catch (e) {
              AP.toast('No se pudo guardar: ' + e.message, 'error', 8000);
              guardarBtn.disabled = false; guardarBtn.lastChild.textContent = nuevo ? 'Crear registro' : 'Guardar cambios';
            }
          }

          return h('div', { class: 'stack' },
            h('h3', null, '1. Persona'), personaBox,
            h('h3', null, '2. Registro'),
            h('div', { class: 'form-grid' },
              AP.field('Sentido *', sentidoSel),
              AP.field('Fecha y hora prevista *', fechaIn, 'Desde ese día el vigilante lo ve como pendiente hasta que la persona pase.'),
              regBox,
              AP.field('Autorizado por *', autoriza, 'Búsquelo en la lista de personas registradas (por ejemplo, el jefe del área).', 'span2'),
              AP.field('Observaciones para el vigilante', obsIn, null, 'span2')),
            h('h3', null, '3. Elementos'), listaItems, h('div', null, addBtn),
            h('h3', null, '4. Fotografías (opcional, máximo ' + MAX_FOTOS + ')'),
            h('p', { class: 'muted small' }, 'Le permiten al vigilante cotejar visualmente los elementos. Se guardan reducidas y con huella SHA-256.'),
            galeria, h('div', null, fotoBtn),
            h('div', { class: 'row gap wrap' }, guardarBtn,
              h('button', { class: 'btn', type: 'button', onclick: function () { fotosNuevas.forEach(function (f) { URL.revokeObjectURL(f.url); }); close(); } }, 'Cerrar sin guardar')),
            (function () { pintarReg(); return null; })());
        }
      });
    }

    // Crea, actualiza o cancela el registro de regreso enlazado a una salida
    async function sincronizarRegreso(s, conRegreso) {
      var reg = s.RegresoId ? (mapa[s.RegresoId] || (await AP.B.findBy('AP_Elementos', 'SalidaId', s.id))[0]) : null;
      if (conRegreso) {
        var datos = {
          Title: s.Title, Token: s.Token, PersonaTipo: s.PersonaTipo, PersonaDoc: s.PersonaDoc, PersonaEmpresa: s.PersonaEmpresa,
          Sentido: 'Ingreso', EsRegreso: true, SalidaId: s.id, FechaPrevista: s.FechaRegresoPrevista, Items: s.Items, Fotos: s.Fotos,
          AutorizadoPor: s.AutorizadoPor, AutorizadoPorId: s.AutorizadoPorId, AutorizadoPorDoc: s.AutorizadoPorDoc, AutorizadoPorCargo: s.AutorizadoPorCargo,
          Observaciones: 'Regreso de los elementos de la salida prevista el ' + U.fDateTime(s.FechaPrevista) + '.'
        };
        if (reg && reg.Estado === 'Pendiente') { await AP.B.update('AP_Elementos', reg.id, datos); return; }
        if (reg && reg.Estado !== 'Cancelado') return;
        var nuevo = await AP.B.create('AP_Elementos', Object.assign(datos, { Estado: 'Pendiente', CreadoPor: AP.Session.user.nombre || AP.Session.user.usuario, FechaCreacion: new Date().toISOString() }));
        await AP.B.update('AP_Elementos', s.id, { RegresoId: nuevo.id });
        s.RegresoId = nuevo.id;
      } else if (reg && reg.Estado === 'Pendiente') {
        await AP.B.update('AP_Elementos', reg.id, { Estado: 'Cancelado' });
      }
    }

    async function cancelar(x) {
      if (!(await AP.confirm('Cancelar registro', '¿Cancelar el registro de ' + x.Sentido.toLowerCase() + ' de elementos de ' + x.Title + '? El vigilante dejará de verlo.' + (x.RegresoId ? ' También se cancela el regreso programado.' : ''), 'Sí, cancelar', 'danger'))) return;
      try {
        await AP.B.update('AP_Elementos', x.id, { Estado: 'Cancelado' });
        if (x.RegresoId) { var reg = mapa[x.RegresoId]; if (!reg || reg.Estado === 'Pendiente') await AP.B.update('AP_Elementos', x.RegresoId, { Estado: 'Cancelado' }); }
        await AP.Audit.log('Cancelación de registro de elementos', x.Title + ' (' + (x.PersonaDoc || '') + ') — ' + x.Sentido + ' ' + U.fDateTime(x.FechaPrevista), E.resumen(E.items(x)));
        AP.toast('Registro cancelado.');
        cargar();
      } catch (e) { AP.toast(e.message, 'error'); }
    }

    function detalle(x) {
      var elems = E.items(x), fotos = E.fotos(x);
      var sal = x.EsRegreso ? mapa[x.SalidaId] : null, reg = x.RegresoId ? mapa[x.RegresoId] : null;
      var kv = function (k, v) { return v ? h('div', { class: 'kv' }, h('span', null, k), h('strong', null, v)) : null; };
      AP.modal({
        title: (x.EsRegreso ? 'Regreso' : x.Sentido) + ' de elementos — ' + x.Title,
        size: 'wide',
        body: function (close) {
          return h('div', { class: 'stack' },
            h('div', { class: 'row gap wrap' }, AP.pill(x.EsRegreso ? 'Regreso' : x.Sentido, x.Sentido === 'Ingreso' && !x.EsRegreso ? 'ok' : 'warn'), E.pill(x, mapa)),
            h('div', { class: 'kv-grid' },
              kv('Persona', x.Title), kv('Documento', x.PersonaDoc), kv('Tipo', x.PersonaTipo), kv('Empresa', x.PersonaEmpresa),
              kv(x.EsRegreso ? 'Debe regresar' : 'Fecha prevista', U.fDateTime(x.FechaPrevista)),
              !x.EsRegreso && x.DebeRegresar ? kv('Debe regresar', U.fDateTime(x.FechaRegresoPrevista) + (reg ? ' · ' + E.estado(reg, mapa).t : '')) : null,
              sal ? kv('Salió', sal.FechaConfirmacion ? U.fDateTime(sal.FechaConfirmacion) + (sal.Vigilante ? ' · verificó ' + sal.Vigilante : '') : E.estado(sal, mapa).t) : null,
              kv('Autorizado por', x.AutorizadoPor ? x.AutorizadoPor + (x.AutorizadoPorDoc ? ' (doc. ' + x.AutorizadoPorDoc + ')' : '') : ''),
              kv('Registrado por', (x._createdBy || x.CreadoPor || '') + (x.FechaCreacion ? ' · ' + U.fDateTime(x.FechaCreacion) : '')),
              kv('Verificado por', x.Vigilante ? x.Vigilante + (x.VigilanteUsuario ? ' (' + x.VigilanteUsuario + ')' : '') + (x.FechaConfirmacion ? ' · ' + U.fDateTime(x.FechaConfirmacion) : '') : ''),
              kv('Nota de portería', x.NotaPorteria), kv('Observaciones', x.Observaciones),
              kv('Aviso a la persona', x.AvisoPersona ? U.fDateTime(x.AvisoPersona) : ''),
              kv('Recordatorios', x.Recordatorios ? x.Recordatorios + ' (último: ' + U.fDateTime(x.UltimoRecordatorio) + ')' : '')),
            h('h3', null, 'Elementos (' + elems.length + ')'), E.tabla(elems),
            fotos.length ? h('h3', null, 'Fotografías') : null,
            fotos.length ? E.galeria(fotos) : null,
            !ED ? h('div', { class: 'row gap wrap' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cerrar')) : h('div', { class: 'row gap wrap' },
              x.Estado === 'Pendiente' && !x.EsRegreso ? h('button', { class: 'btn', type: 'button', onclick: function () { close(); avisar(x, 'aviso'); } }, AP.icon('whatsapp', 18), 'Avisar a la persona') : null,
              E.regresoActivo(x, mapa) ? h('button', { class: 'btn primary', type: 'button', onclick: function () { close(); avisar(x, 'recordatorio'); } }, AP.icon('bell', 18), 'Recordar el regreso') : null,
              E.regresoActivo(x, mapa) ? h('button', { class: 'btn', type: 'button', onclick: async function () {
                if (!(await AP.confirm('Registrar regreso', 'Use esta opción solo si los elementos le fueron devueltos a usted directamente y los revisó contra la lista. Si llegan por portería, los marca el vigilante.', 'Registrar regreso'))) return;
                try { Object.assign(x, await E.verificar(x, 'Confirmado', 'Regreso registrado por el Director de Seguridad Integral desde la consola')); close(); AP.toast('Regreso registrado.'); pintar(); }
                catch (e) { AP.toast(e.message, 'error'); }
              } }, AP.icon('check', 18), 'Registrar regreso') : null,
              x.Estado === 'Pendiente' ? h('button', { class: 'btn', type: 'button', onclick: function () { close(); editar(x); } }, AP.icon('edit', 18), 'Editar') : null,
              x.Estado === 'Pendiente' && !x.EsRegreso ? h('button', { class: 'btn danger-outline', type: 'button', onclick: function () { close(); cancelar(x); } }, 'Cancelar registro') : null,
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cerrar')));
        }
      });
    }
  });

  // =================== NOTIFICACIONES ===================
  AP.route('/consola/notificaciones', function () {
    if (!guard('admin')) return;
    var content = h('div', { class: 'stack' });
    AP.consolaShell('/consola/notificaciones', 'Notificaciones y alertas', content);

    /* Estado actual de permisos push */
    var pushStatus = !('Notification' in window)
      ? '❌ Este navegador no soporta notificaciones push.'
      : Notification.permission === 'granted'
        ? '✅ Notificaciones push activadas en este dispositivo.'
        : Notification.permission === 'denied'
          ? '⛔ Bloqueadas por el navegador. Vaya a Configuración del navegador → Permisos de este sitio → Notificaciones → Permitir.'
          : '⚠️ Permiso pendiente. Pulse "Activar notificaciones" abajo.';

    var estadoPush = h('div', { class: 'kv' }, h('span', null, 'Estado push'), h('strong', null, pushStatus));

    /* EmailJS */
    var cfgGuardada = AP.Notif ? AP.Notif.emailConfigurado() : false;
    var svcIn = AP.input('serviceId', '', { placeholder: 'service_xxxxxxx' });
    var tplIn = AP.input('templateId', '', { placeholder: 'template_xxxxxxx' });
    var keyIn = AP.input('publicKey', '', { placeholder: 'clave pública de EmailJS' });
    var destino = h('div', { class: 'kv' }, h('span', null, 'Destinatario'), h('strong', null, 'dmazo@avo-pak.com'));
    var cfgMsg = h('div', { class: 'banner ' + (cfgGuardada ? 'info' : 'warn') },
      AP.icon(cfgGuardada ? 'check' : 'alert', 16),
      h('span', null, cfgGuardada ? 'EmailJS configurado. Los correos de alerta están activos.' : 'EmailJS no configurado. Configure abajo para activar los correos de alerta.'));

    var instrucciones = [
      'Entre a emailjs.com y cree una cuenta gratuita (hasta 200 correos/mes, sin tarjeta).',
      'En "Email Services" conecte su cuenta Gmail o Outlook institucional.',
      'En "Email Templates" cree una plantilla nueva. En el cuerpo use las variables: {{asunto}}, {{tipo}}, {{hora}}, {{nombre}}, {{empresa}}, {{placa}}, {{vigilante}}, {{porteria}}, {{detalle}}, {{observaciones}}.',
      'En la plantilla configure: To Email = {{to_email}} (así los correos van a dmazo@avo-pak.com).',
      'Copie el Service ID, Template ID y Public Key de "Account → API Keys" y péguelos abajo.'
    ];

    AP.add(content,
      h('section', { class: 'card stack' },
        h('h3', null, 'Notificaciones push (en este dispositivo)'),
        h('p', { class: 'muted' }, 'Las notificaciones push aparecen en la pantalla de este celular/computador cada vez que un vigilante registra un ingreso, salida, novedad o inspección.'),
        estadoPush,
        Notification.permission !== 'granted'
          ? h('button', { class: 'btn primary', type: 'button', onclick: function () {
              Notification.requestPermission().then(function (p) {
                AP.toast(p === 'granted' ? '✅ Notificaciones activadas.' : '⛔ No se otorgó el permiso.', p === 'granted' ? 'ok' : 'err');
                AP.render();
              });
            } }, AP.icon('bell', 18), 'Activar notificaciones en este dispositivo')
          : h('button', { class: 'btn', type: 'button', onclick: function () {
              new Notification('✅ Prueba Avo Pak', { body: 'Las notificaciones push están funcionando correctamente.', icon: 'img/icon-192.png' });
            } }, AP.icon('bell', 18), 'Enviar notificación de prueba')),

      h('section', { class: 'card stack' },
        h('h3', null, 'Correo de alerta (EmailJS)'),
        h('p', { class: 'muted' }, 'Se envía un correo automático a ', h('strong', null, 'dmazo@avo-pak.com'), ' cuando se registra un ingreso negado, una novedad o una inspección no conforme.'),
        cfgMsg,
        destino,
        h('ol', { class: 'steps' }, instrucciones.map(function (s) { return h('li', null, s); })),
        AP.field('Service ID', svcIn),
        AP.field('Template ID', tplIn),
        AP.field('Public Key', keyIn),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn primary', type: 'button', onclick: function () {
            var svc = svcIn.querySelector('input').value.trim();
            var tpl = tplIn.querySelector('input').value.trim();
            var key = keyIn.querySelector('input').value.trim();
            if (!svc || !tpl || !key) return AP.toast('Complete los tres campos.', 'warn');
            if (AP.Notif) AP.Notif.configurar({ serviceId: svc, templateId: tpl, publicKey: key });
            AP.toast('✅ EmailJS configurado y guardado.', 'ok');
            AP.render();
          } }, AP.icon('check', 18), 'Guardar configuración'),
          cfgGuardada ? h('button', { class: 'btn danger-outline', type: 'button', onclick: async function () {
            if (!(await AP.confirm('Borrar configuración EmailJS', '¿Confirma borrar la configuración de correo? Los correos de alerta quedarán desactivados.', 'Borrar', 'danger'))) return;
            try { localStorage.removeItem('ap_emailjs'); } catch (e) {}
            AP.toast('Configuración de correo eliminada.', 'ok');
            AP.render();
          } }, AP.icon('trash', 18), 'Borrar configuración') : null)));
  });

  AP.plantillaPersonas = async function () {
    var ejemplo = ['Nombre Apellido Apellido', 'Contratista', 'CC', '1234567890', '3000000000', 'correo@empresa.com', 'Empresa contratista S.A.S.', '900123456-7', 'Técnico', 'Mantenimiento', 'Habilitado', '2026-12-31', 'ABC123', 'Camioneta', 'Sí', 'Sí', '', '', '', ''];
    var guia = [
      ['Tipo', AP.CAT.tiposPersona.join(' | ')], ['Tipo de documento', AP.CAT.tiposDoc.join(' | ')], ['Estado', 'Habilitado | Inhabilitado'],
      ['Vigente hasta', 'AAAA-MM-DD (opcional). Contratistas: fecha de la seguridad social verificada.'], ['Autoriza datos / Autoriza foto', 'Sí | No — debe existir el soporte firmado.'],
      ['Clase de personal', 'Solo personal propio: ' + AP.CAT.tiposPersonal.join(' | ') + '.'],
      ['Empresa / NIT empresa', 'Obligatorio: la empresa debe estar creada en «Empresas». Se busca por NIT (o por el nombre exacto). Personal propio sin empresa: se vincula a ' + AP.CFG.empresa + ' si está creada.'],
      ['Cargo', 'Opcional: debe existir en «Cargos» con el mismo nombre. Si está vacío, la persona queda sin cargo.'],
      ['Documento jefe inmediato', 'Opcional, para cualquier tipo de persona: número de documento del jefe inmediato, que debe estar registrado como persona. El jefe con personal a cargo ve y programa a quienes lo tienen como jefe inmediato.'],
      ['Número de uniforme', 'Opcional.'],
      ['Regla', 'Si el número de documento ya existe, la fila actualiza a esa persona; si no, se crea con una credencial QR nueva.']
    ];
    if (window.writeXlsxFile) {
      var blob = await window.writeXlsxFile([
        { sheet: 'Personas', data: [PLANTILLA.map(function (c) { return { value: c, fontWeight: 'bold', backgroundColor: '#E8ECDD' }; }), ejemplo.map(function (v) { return { value: v }; })], columns: PLANTILLA.map(function () { return { width: 20 }; }) },
        { sheet: 'Instrucciones', data: guia.map(function (g) { return [{ value: g[0], fontWeight: 'bold' }, { value: g[1] }]; }), columns: [{ width: 28 }, { width: 90 }] }
      ]).toBlob();
      U.download(blob, 'Plantilla_carga_personas.xlsx');
    } else {
      U.download(new Blob([U.csv([PLANTILLA, ejemplo])], { type: 'text/csv' }), 'Plantilla_carga_personas.csv');
    }
  };

  AP.cargaMasiva = function (done) {
    AP.modal({
      title: 'Carga masiva de personas', size: 'wide',
      body: function (close) {
        var inp = h('input', { type: 'file', accept: '.xlsx,.csv' });
        var prev = h('div', { class: 'stack' });
        var filas = [];
        inp.addEventListener('change', async function () {
          prev.replaceChildren(AP.spinner('Leyendo archivo…'));
          try {
            var f = inp.files[0];
            var rows;
            if (/\.csv$/i.test(f.name)) {
              var txt = (await f.text()).replace(/^﻿/, '');
              var sep = txt.split('\n')[0].indexOf(';') >= 0 ? ';' : ',';
              rows = txt.split(/\r?\n/).filter(Boolean).map(function (l) { return l.split(sep).map(function (c) { return c.replace(/^"|"$/g, '').trim(); }); });
            } else {
              var sheets = await window.readXlsxFile(f);
              rows = (Array.isArray(sheets) && sheets[0] && sheets[0].data) ? sheets[0].data : sheets;
            }
            var head = rows[0].map(function (c) { return MAPA[U.fold(c).replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()] || null; });
            if (head.indexOf('Title') < 0 || head.indexOf('NumDoc') < 0) throw new Error('El archivo debe tener las columnas "Nombre completo" y "Número de documento". Use la plantilla.');
            var todasP = await AP.B.listAll('AP_Personas', { exclude: ['Foto'] });
            var existentes = new Map(todasP.map(function (p) { return [U.normDoc(p.NumDoc), p]; }));
            var emps = await AP.Maestros.empresas(true), cars = await AP.Maestros.cargos(true);
            var propia = AP.Maestros.propia(emps);
            if (!emps.length) throw new Error('Primero registre las empresas (personas jurídicas) en «Empresas»: cada persona se vincula a una empresa ya creada.');
            // Documentos del archivo (para jefes inmediatos que vienen en el mismo archivo)
            var docsArchivo = {};
            rows.slice(1).forEach(function (r) { var j = head.indexOf('NumDoc'), t = head.indexOf('Title'); if (j >= 0 && r[j]) docsArchivo[U.normDoc(r[j])] = String(r[t] || ''); });
            var vistos = new Set();
            filas = rows.slice(1).map(function (r, i) {
              var o = {};
              head.forEach(function (k, j) { if (k) { var v = r[j]; if (v instanceof Date) v = U.ymd(v); o[k] = v == null ? '' : String(v).trim(); } });
              var err = [];
              if (!o.Title || o.Title.length < 5) err.push('nombre');
              var d = U.normDoc(o.NumDoc); if (!d) err.push('documento');
              if (vistos.has(d)) err.push('documento repetido en el archivo'); vistos.add(d);
              if (o.Tipo && AP.CAT.tiposPersona.indexOf(o.Tipo) < 0) {
                var t = AP.CAT.tiposPersona.find(function (x) { return U.fold(x).indexOf(U.fold(o.Tipo)) === 0; });
                if (t) o.Tipo = t; else err.push('tipo');
              }
              o.Tipo = o.Tipo || 'Personal propio';
              if (o.TipoPersonal) {
                var tp = AP.CAT.tiposPersonal.find(function (x) { return U.fold(x) === U.fold(o.TipoPersonal) || U.fold(x).indexOf(U.fold(o.TipoPersonal)) === 0; });
                if (tp && o.Tipo === 'Personal propio') o.TipoPersonal = tp; else if (o.Tipo !== 'Personal propio') delete o.TipoPersonal; else err.push('clase de personal');
              }
              o.TipoDoc = o.TipoDoc || 'CC';
              o.Estado = U.fold(o.Estado) === 'inhabilitado' ? 'Inhabilitado' : 'Habilitado';
              if (o.VigenciaHasta && !/^\d{4}-\d{2}-\d{2}$/.test(o.VigenciaHasta)) {
                var m = String(o.VigenciaHasta).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                if (m) o.VigenciaHasta = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); else err.push('fecha de vigencia');
              }
              if ('AutorizaDatos' in o) o.AutorizaDatos = U.parseBool(o.AutorizaDatos);
              if ('AutorizaFoto' in o) o.AutorizaFoto = U.parseBool(o.AutorizaFoto);
              if (o.Placa) o.Placa = o.Placa.split(',').map(U.normPlaca).filter(Boolean).join(', ');
              // Empresa (persona jurídica ya creada), cargo del catálogo y jefe inmediato (persona registrada)
              var emp = AP.Maestros.buscarEmpresa(emps, o._NIT) || AP.Maestros.buscarEmpresa(emps, o.Empresa) || (!o.Empresa && !o._NIT && o.Tipo === 'Personal propio' ? propia : null);
              if (emp) { o.EmpresaId = emp.id; o.Empresa = emp.Title; } else err.push('empresa no registrada en «Empresas»' + (o.Empresa || o._NIT ? ' (' + [o.Empresa, o._NIT].filter(Boolean).join(' · ') + ')' : ''));
              if (o.Cargo) { var car = AP.Maestros.buscarCargo(cars, o.Cargo); if (car) { o.CargoId = car.id; o.Cargo = car.Title; if (!o.Area && car.Area) o.Area = car.Area; if (!o.TipoPersonal && car.TipoPersonal && o.Tipo === 'Personal propio') o.TipoPersonal = car.TipoPersonal; } else err.push('cargo no registrado en «Cargos» (' + o.Cargo + ')'); }
              if (o._JefeDoc) {
                var jd = U.normDoc(o._JefeDoc), jefe = existentes.get(jd);
                if (jd === d) err.push('la persona no puede ser su propio jefe inmediato');
                else if (jefe) { o.JefeId = jefe.id; o.JefeNombre = jefe.Title; }
                else if (docsArchivo[jd]) o._jefePendiente = jd;
                else err.push('jefe inmediato no registrado (' + o._JefeDoc + ')');
              }
              delete o._NIT; delete o._JefeDoc;
              Object.keys(o).forEach(function (k) { if (o[k] === '') delete o[k]; });
              var ex = existentes.get(d);
              return { n: i + 2, data: o, err: err, existente: ex };
            }).filter(function (x) { return Object.keys(x.data).length; });
            var nuevos = filas.filter(function (x) { return !x.err.length && !x.existente; }).length;
            var act = filas.filter(function (x) { return !x.err.length && x.existente; }).length;
            var malos = filas.filter(function (x) { return x.err.length; });
            prev.replaceChildren(
              h('div', { class: 'row gap wrap' }, AP.pill(nuevos + ' nuevas', 'ok'), AP.pill(act + ' a actualizar', 'brand'), malos.length ? AP.pill(malos.length + ' con errores (se omiten)', 'deny') : null),
              malos.length ? h('div', { class: 'log' }, malos.slice(0, 50).map(function (x) { return h('div', { class: 'txt-deny' }, 'Fila ' + x.n + ': revisar ' + x.err.join(', ')); })) : null,
              simpleTable([['Fila', function (x) { return String(x.n); }], ['Nombre', function (x) { return x.data.Title; }], ['Documento', function (x) { return x.data.NumDoc; }],
                ['Tipo', function (x) { return x.data.Tipo + (x.data.TipoPersonal ? ' · ' + x.data.TipoPersonal : ''); }], ['Empresa', function (x) { return x.data.Empresa || ''; }], ['Cargo', function (x) { return x.data.Cargo || ''; }],
                ['Jefe inmediato', function (x) { return x.data.JefeNombre || (x.data._jefePendiente ? 'En este archivo' : ''); }], ['Estado', function (x) { return x.data.Estado; }], ['Acción', function (x) { return x.err.length ? AP.pill('Error', 'deny') : x.existente ? AP.pill('Actualizar', 'brand') : AP.pill('Crear', 'ok'); }]],
              filas.slice(0, 200)),
              h('button', { class: 'btn primary', type: 'button', disabled: !(nuevos + act), onclick: importar }, AP.icon('upload', 18), 'Importar ' + (nuevos + act) + ' personas'));
          } catch (e) { prev.replaceChildren(h('div', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, e.message))); }
        });
        async function importar() {
          var ok = filas.filter(function (x) { return !x.err.length; });
          var bar = h('progress', { max: ok.length, value: 0 });
          var info = h('p');
          prev.replaceChildren(bar, info);
          var c = 0, u = 0, fallos = [], idsPorDoc = {}, pendJefe = [];
          // Primero las filas sin jefe pendiente (así los jefes que vienen en el mismo archivo ya existen)
          ok.sort(function (a, b) { return (a.data._jefePendiente ? 1 : 0) - (b.data._jefePendiente ? 1 : 0); });
          for (var i = 0; i < ok.length; i++) {
            var x = ok[i];
            var dat = Object.assign({}, x.data), jp = dat._jefePendiente;
            delete dat._jefePendiente;
            if (jp) { var jid = idsPorDoc[jp]; if (jid) { dat.JefeId = jid.id; dat.JefeNombre = jid.Title; } else pendJefe.push('Fila ' + x.n); }
            // Ámbito de Talento Humano: personal propio o con jefe inmediato asignado
            var tipoF = dat.Tipo || (x.existente && x.existente.Tipo) || '', jefeF = dat.JefeId !== undefined ? dat.JefeId : (x.existente && x.existente.JefeId) || '';
            dat.AmbitoTH = tipoF === 'Personal propio' || !!jefeF;
            try {
              if (x.existente) { await AP.B.update('AP_Personas', x.existente.id, dat); u++; idsPorDoc[U.normDoc(dat.NumDoc)] = { id: x.existente.id, Title: dat.Title }; }
              else {
                var d = Object.assign({ Token: U.newToken() }, dat);
                if (d.AutorizaDatos) { d.FechaAutorizacion = U.ymd(); d.VersionAutorizacion = AP.CFG.versionAutorizacion; }
                var nr = await AP.B.create('AP_Personas', d); c++;
                idsPorDoc[U.normDoc(d.NumDoc)] = { id: nr.id, Title: d.Title };
              }
            } catch (e) { fallos.push('Fila ' + x.n + ': ' + e.message); }
            bar.value = i + 1; info.textContent = (i + 1) + ' de ' + ok.length;
          }
          if (pendJefe.length) fallos.push('Sin jefe inmediato (su jefe no se pudo crear): ' + pendJefe.join(', '));
          await AP.Audit.log('Carga masiva de personas', (inp.files[0] || {}).name || '', c + ' creadas, ' + u + ' actualizadas, ' + fallos.length + ' con error');
          prev.replaceChildren(h('div', { class: 'banner ' + (fallos.length ? 'warn' : 'info') }, AP.icon('check', 18), h('span', null, c + ' personas creadas y ' + u + ' actualizadas.' + (fallos.length ? ' ' + fallos.length + ' con error.' : ''))),
            fallos.length ? h('div', { class: 'log' }, fallos.map(function (f) { return h('div', null, f); })) : null,
            h('button', { class: 'btn primary', type: 'button', onclick: function () { close(); if (done) done(); } }, 'Terminar'));
          AP.Sync.run();
        }
        return h('div', { class: 'stack' },
          h('p', null, 'Cargue un archivo Excel (.xlsx) o CSV con las columnas de la plantilla. Si el documento ya existe, se actualizan sus datos; si no, se crea la persona con una credencial QR nueva. Las fotografías se cargan aparte.'),
          h('div', { class: 'row gap wrap' }, inp, h('button', { class: 'btn small', type: 'button', onclick: AP.plantillaPersonas }, AP.icon('file', 16), 'Descargar plantilla')),
          prev);
      }
    });
  };
})();
