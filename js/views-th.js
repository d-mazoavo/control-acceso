/* Talento Humano: ausencias del personal propio (vacaciones, permisos de día completo, licencias), estado del personal en
 * planta y compendio de horas entre la entrada y la salida registradas en portería (diurnas, nocturnas y en domingo o
 * festivo). Talento Humano registra y anula ausencias; no las borra. El Director está por encima; Gobierno Corporativo
 * consulta. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h, J = function () { return AP.Jornada; };

  var CATS = ['Personal propio', 'Personal propio sin carné'];
  var RE_SALUD = /(diagn[oó]stic|enfermedad|c[aá]ncer|embaraz|psiqui|psicol|terapia|cirug|v\.?i\.?h|medicament|tratamiento|m[eé]dic[oa]|\beps\b|\bips\b|hospital|cl[ií]nica|urgencias|odontol|maternidad|paternidad|parto)/i;
  function errBox(e) {
    var link = e && e.indiceUrl ? h('a', { class: 'btn', href: e.indiceUrl, target: '_blank', rel: 'noopener' }, AP.icon('settings', 18), 'Crear el índice en Firebase (Director)') : null;
    return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con el servidor' : 'No fue posible cargar la información', e && e.message, link);
  }
  function tabla(cols, rows, onRow) {
    return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { class: c[2] || '' }, c[0]); }))),
      h('tbody', null, rows.length ? rows.map(function (r) {
        return h('tr', { onclick: onRow ? function (e) { if (!e.target.closest('button,a,input,select')) onRow(r); } : null }, cols.map(function (c) { var v = c[1](r); return h('td', { 'data-label': c[0], class: c[2] || '' }, v == null ? '' : v); }));
      }) : h('tr', null, h('td', { colspan: cols.length, class: 'center muted' }, 'Sin registros')))));
  }
  function completo() { return AP.Session.lectura(); }
  function puedeRegistrar() { return AP.Session.can('th'); }   // Talento Humano y Director
  function fh(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

  // ---------- Datos según el perfil (Talento Humano solo lee al personal propio) ----------
  var D = {
    personal: async function () {
      var l = completo() ? (await AP.B.listAll('AP_Personas', { exclude: ['Foto', 'Observaciones'] })).filter(function (p) { return p.Tipo === 'Personal propio'; })
        : await AP.B.consulta('AP_Personas', [['Tipo', '==', 'Personal propio']], { exclude: ['Observaciones'] });
      return l.sort(function (a, b) { return U.fold(a.Title) < U.fold(b.Title) ? -1 : 1; });
    },
    // Movimientos del personal propio por día. Los días ya cerrados se guardan en este equipo para no volver a
    // consultarlos (protege la cuota diaria gratuita de Firebase); hoy y ayer siempre se consultan de nuevo.
    movimientos: async function (desdeYmd, hastaYmd, progreso) {
      if (completo()) {
        var l = await AP.B.listRange('AP_Movimientos', 'FechaHora', U.fromLocal(desdeYmd, '00:00'), new Date(U.fromLocal(hastaYmd, '23:59').getTime() + 59999));
        return l.filter(function (m) { return CATS.indexOf(m.Categoria) >= 0; });
      }
      var cache = (await AP.Store.get('th:movs')) || {}, out = [], limite = J().addYmd(U.ymd(), -1), y = desdeYmd, dias = [];
      while (y <= hastaYmd) { dias.push(y); y = J().addYmd(y, 1); }
      for (var i = 0; i < dias.length; i++) {
        var d = dias[i];
        if (cache[d] && d < limite) { out = out.concat(cache[d]); continue; }
        if (progreso) progreso(i + 1, dias.length);
        var r = await AP.B.consulta('AP_Movimientos', [['Categoria', 'in', CATS], ['FechaHora', '>=', U.fromLocal(d, '00:00')], ['FechaHora', '<=', new Date(U.fromLocal(d, '23:59').getTime() + 59999)]]);
        if (d < limite) cache[d] = r;
        out = out.concat(r);
      }
      // Solo se conservan los últimos 70 días
      var corte = J().addYmd(U.ymd(), -70);
      Object.keys(cache).forEach(function (k) { if (k < corte) delete cache[k]; });
      await AP.Store.set('th:movs', cache);
      return out;
    },
    semanas: async function (desdeYmd) { return AP.B.listRange('AP_ProgPlanta', 'Desde', U.fromLocal(J().addYmd(desdeYmd, -7), '00:00'), null); },
    horarios: async function () { return AP.B.listAll('AP_Horarios'); },
    ausencias: async function (dias) { return AP.B.listRange('AP_Ausencias', 'Hasta', U.addDays(new Date(), -(dias || 120)), null); }
  };
  AP.TH = { D: D };

  // Excel con varias hojas de datos, huella SHA-256 y anotación en la bitácora
  AP.exportarHojas = async function (nombre, hojas, info) {
    if (!window.writeXlsxFile) return AP.toast('La descarga en Excel no está disponible en este equipo.', 'warn');
    var stamp = U.ymd() + '_' + U.partsCO().hour + U.partsCO().minute;
    var file = U.safeName(nombre) + '_' + stamp + '.xlsx';
    var celda = function (v) {
      if (v instanceof Date) return { value: v, type: Date, format: 'dd/mm/yyyy hh:mm' };
      if (typeof v === 'number') return { value: v, type: Number };
      return { value: v == null ? '' : String(v), type: String };
    };
    var sheets = hojas.map(function (hj) {
      return { sheet: hj.sheet, stickyRowsCount: 1, columns: hj.cols.map(function (c) { return { width: c[2] || 16 }; }),
        data: [hj.cols.map(function (c) { return { value: c[0], fontWeight: 'bold', backgroundColor: '#E8ECDD', wrap: true }; })].concat(hj.rows.map(function (r) { return hj.cols.map(function (c) { return celda(c[1](r)); }); })) };
    });
    sheets.push({ sheet: 'Información', columns: [{ width: 30 }, { width: 100 }],
      data: [[{ value: 'Información de la exportación', fontWeight: 'bold' }]].concat((info || []).map(function (x) { return [{ value: x[0], fontWeight: 'bold' }, { value: String(x[1]), wrap: true }]; }),
        [[{ value: '' }], [{ value: AP.TX.pieExportacion || '', wrap: true }]]) });
    var blob = await window.writeXlsxFile(sheets).toBlob();
    var hash = await U.sha256(blob);
    U.download(blob, file);
    var total = hojas.reduce(function (a, x) { return a + x.rows.length; }, 0);
    await AP.Audit.log('Exportación', file, total + ' filas. ' + (info || []).map(function (x) { return x[0] + ': ' + x[1]; }).join(' | ').slice(0, 900), hash);
    AP.modal({ title: 'Archivo generado', body: h('div', { class: 'stack' }, h('p', null, 'Se descargó ', h('strong', null, file), '.'),
      h('p', { class: 'muted small' }, 'Huella SHA-256 (registrada en la bitácora; permite demostrar que el archivo no ha sido alterado):'), h('code', { class: 'hash' }, hash)),
      actions: [{ label: 'Cerrar', kind: 'primary' }] });
  };

  // =================== PANTALLA DE TALENTO HUMANO ===================
  AP.route('/consola/th', function (qs) {
    if (!puedeRegistrar() && !AP.Session.can('ver')) { AP.go('/'); return; }
    var ED = puedeRegistrar();
    var tab = qs.t || 'estado';
    var content = h('div', { class: 'stack' });
    var tabs = h('div', { class: 'tabs' }, [['estado', 'Estado del personal'], ['ausencias', 'Ausencias'], ['horas', 'Horas en planta']].map(function (t) {
      return h('a', { class: t[0] === tab ? 'on' : '', href: '#/consola/th?t=' + t[0] }, t[1]);
    }));
    var box = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    var acciones = h('div', { class: 'row gap wrap' });
    AP.consolaShell('/consola/th', 'Talento Humano — personal', content, ED ? acciones : AP.pill('Solo consulta', 'muted'));
    content.append(tabs, box);
    if (tab === 'ausencias') ausencias(); else if (tab === 'horas') horas(); else estado();

    // ---------- Estado del personal ----------
    async function estado() {
      try {
        var hoy = U.ymd(), ayer = J().addYmd(hoy, -1);
        var r = await Promise.all([D.personal(), D.semanas(hoy), D.horarios().catch(function () { return []; }), D.ausencias(10), D.movimientos(ayer, hoy)]);
        AP.Planta.tablero(box, r[0], { semanas: J().indexarSemanas(r[1]), horarios: r[2] }, r[4], r[3], { clases: true, claseDef: 'Operario' });
      } catch (e) { box.replaceChildren(errBox(e)); }
    }

    // ---------- Ausencias ----------
    async function ausencias() {
      if (ED) acciones.replaceChildren(h('button', { class: 'btn primary', type: 'button', onclick: registrar }, AP.icon('plus', 18), 'Registrar ausencia'));
      var datos = [], personal = null;
      var fEst = AP.select('est', [['vigentes', 'Vigentes y próximas'], ['todas', 'Últimos 120 días'], ['anuladas', 'Anuladas']], 'vigentes');
      var fTipo = AP.select('tipo', [['', 'Todos los tipos']].concat(AP.CAT.tiposAusencia), '');
      var q = AP.buscador('Buscar persona, documento, área o detalle', pintar);
      var out = h('div');
      [fEst, fTipo].forEach(function (s) { s.addEventListener('change', pintar); });
      function estadoDe(a) { var ahora = Date.now(); return a.Estado === 'Anulada' ? 'Anulada' : new Date(a.Hasta).getTime() < ahora ? 'Terminada' : new Date(a.Desde).getTime() > ahora ? 'Próxima' : 'Vigente'; }
      var KIND = { Anulada: 'deny', Terminada: 'muted', 'Próxima': 'warn', Vigente: 'ok' };
      function filtradas() {
        return datos.filter(function (a) {
          var e = estadoDe(a);
          if (fEst.value === 'vigentes' && !(e === 'Vigente' || e === 'Próxima')) return false;
          if (fEst.value === 'anuladas' && e !== 'Anulada') return false;
          if (fTipo.value && a.Tipo !== fTipo.value) return false;
          return AP.coincide(a, q.value, ['Title', 'NumDoc', 'Area', 'Cargo', 'Tipo', 'Detalle', 'TipoPersonal']);
        });
      }
      function dias(a) { return Math.round((U.fromLocal(U.ymd(a.Hasta), '12:00') - U.fromLocal(U.ymd(a.Desde), '12:00')) / 864e5) + 1; }
      function pintar() {
        out.replaceChildren(tabla([
          ['Persona', function (a) { return h('div', null, h('strong', null, a.Title), h('small', { class: 'block muted' }, [a.NumDoc, a.TipoPersonal, a.Area].filter(Boolean).join(' · '))); }],
          ['Tipo', function (a) { return a.Tipo; }],
          ['Fechas', function (a) { return U.fDate(a.Desde) + (U.ymd(a.Desde) !== U.ymd(a.Hasta) ? ' a ' + U.fDate(a.Hasta) : '') + ' (' + dias(a) + ' día' + (dias(a) > 1 ? 's' : '') + ')'; }],
          ['Detalle', function (a) { return a.Detalle || ''; }],
          ['Registró', function (a) { return h('small', { class: 'muted' }, (a.RegistradoPorNombre || a._createdBy || '') + (a._created ? ' · ' + U.fDateTime(a._created) : '')); }],
          ['Estado', function (a) { var e = estadoDe(a); return h('div', null, AP.pill(e, KIND[e]), a.MotivoAnulacion ? h('small', { class: 'block muted' }, a.MotivoAnulacion) : null); }],
          ['', function (a) { return ED && a.Estado !== 'Anulada' && new Date(a.Hasta).getTime() >= Date.now() ? h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { anular(a); } }, 'Anular') : null; }]
        ], filtradas().sort(function (x, y) { return x.Desde < y.Desde ? 1 : -1; })));
      }
      async function cargar() {
        out.replaceChildren(AP.spinner('Consultando…'));
        try { datos = await D.ausencias(120); pintar(); } catch (e) { out.replaceChildren(errBox(e)); }
      }
      async function registrar() {
        try { if (!personal) personal = (await D.personal()).filter(function (p) { return p.Estado === 'Habilitado'; }); }
        catch (e) { return AP.toast(e.message, 'error'); }
        AP.modal({ title: 'Registrar ausencia', size: 'wide', body: function (close) {
          var sel = null;
          var buscar = h('input', { type: 'search', placeholder: 'Nombre, documento, cargo o área', autocomplete: 'off' });
          var res = h('div', { class: 'list anf-res' }), vista = h('div', { class: 'stack sm' });
          function pintarSel() {
            if (sel) vista.replaceChildren(h('div', { class: 'sel-persona' }, AP.icon('user', 22), h('div', null, h('strong', null, sel.Title), h('small', { class: 'block muted' }, [sel.NumDoc, sel.TipoPersonal, sel.Cargo, sel.Area].filter(Boolean).join(' · '))),
              h('button', { class: 'btn small', type: 'button', onclick: function () { sel = null; buscar.value = ''; res.replaceChildren(); pintarSel(); } }, 'Cambiar')));
            else vista.replaceChildren(buscar, res);
          }
          buscar.addEventListener('input', U.debounce(function () {
            var t = U.fold(buscar.value), d = U.normDoc(buscar.value);
            if (t.length < 2) { res.replaceChildren(); return; }
            var l = personal.filter(function (p) { return U.fold([p.Title, p.Cargo, p.Area].join(' ')).indexOf(t) >= 0 || (d.length >= 3 && U.normDoc(p.NumDoc).indexOf(d) >= 0); }).slice(0, 8);
            res.replaceChildren.apply(res, l.length ? l.map(function (p) {
              return h('button', { class: 'list-item', type: 'button', onclick: function () { sel = p; pintarSel(); } }, AP.icon('user', 20),
                h('div', null, h('strong', null, p.Title), h('small', null, [p.NumDoc, p.TipoPersonal, p.Cargo, p.Area].filter(Boolean).join(' · '))));
            }) : [h('p', { class: 'muted small' }, 'No aparece en el personal propio habilitado.')]);
          }, 200));
          pintarSel();
          var tipo = AP.select('Tipo', AP.CAT.tiposAusencia, 'Vacaciones');
          var desde = AP.input('Desde', U.ymd(), { type: 'date' }), hasta = AP.input('Hasta', U.ymd(), { type: 'date' });
          var det = AP.textarea('Detalle', '', { rows: 2, placeholder: 'Opcional: número de solicitud o referencia interna. Sin diagnósticos ni datos de salud.' });
          var btn = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            if (!sel) return AP.toast('Elija a la persona.', 'warn');
            if (!desde.value || !hasta.value || hasta.value < desde.value) return AP.toast('Revise las fechas: «hasta» no puede ser anterior a «desde».', 'warn');
            if (RE_SALUD.test(det.value)) return AP.toast('El detalle parece contener información de salud (dato sensible, art. 5 Ley 1581 de 2012). Use «Ausencia justificada (reservada)» sin describir la causa.', 'warn', 9000);
            var cruce = datos.find(function (a) { return a.Token === sel.Token && a.Estado !== 'Anulada' && U.ymd(a.Desde) <= hasta.value && U.ymd(a.Hasta) >= desde.value; });
            if (cruce && !(await AP.confirm('Ausencia que se cruza', sel.Title + ' ya tiene registrada «' + cruce.Tipo + '» del ' + U.fDate(cruce.Desde) + ' al ' + U.fDate(cruce.Hasta) + '. ¿Registrar de todas formas?', 'Registrar'))) return;
            btn.disabled = true;
            try {
              var rec = {
                Title: sel.Title, PersonaId: sel.id, Token: sel.Token, NumDoc: sel.NumDoc, TipoPersonal: sel.TipoPersonal || '', Area: sel.Area || '', Cargo: sel.Cargo || '',
                Tipo: tipo.value, Desde: U.fromLocal(desde.value, '00:00').toISOString(), Hasta: new Date(U.fromLocal(hasta.value, '23:59').getTime() + 59000).toISOString(),
                Estado: 'Vigente', Detalle: det.value.trim(), RegistradoPorNombre: AP.Session.user.nombre
              };
              await AP.B.create('AP_Ausencias', rec);
              var txt = tipo.value + ' del ' + U.fDate(rec.Desde) + ' al ' + U.fDate(rec.Hasta);
              await AP.Planta.registrarCambio('Ausencia', sel.Title + ' (' + (sel.NumDoc || '') + ')', txt + (rec.Detalle ? '. ' + rec.Detalle : ''), 1, desde.value <= U.ymd() ? 1 : 0);
              await AP.Audit.log('Registro de ausencia', sel.Title + ' (' + (sel.NumDoc || '') + ')', txt);
              close(); AP.toast('Ausencia registrada. La portería la recibe en su próxima actualización.', 'info', 6000); cargar();
            } catch (e) { AP.toast(e.message, 'error', 8000); btn.disabled = false; }
          } }, AP.icon('check', 18), 'Registrar ausencia');
          return h('div', { class: 'stack' },
            AP.field('Persona *', vista),
            h('div', { class: 'form-grid' }, AP.field('Tipo *', tipo, null, 'span2'), AP.field('Desde *', desde), AP.field('Hasta (inclusive) *', hasta), AP.field('Detalle', det, null, 'span2')),
            h('p', { class: 'note small' }, 'En esas fechas la portería no deja ingresar a la persona sin aprobación del Director de Seguridad Integral (al vigilante solo se le muestra «ausencia registrada», sin el tipo). ' +
              'Incapacidades, licencias de maternidad o paternidad y demás asuntos de salud: registre «Ausencia justificada (reservada)», sin diagnóstico; el soporte se conserva en Talento Humano (dato sensible, art. 5 Ley 1581 de 2012).'),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), btn));
        } });
      }
      function anular(a) {
        AP.modal({ title: 'Anular ausencia', body: function (close) {
          var m = AP.input('m', '', { placeholder: 'Motivo (p. ej., la persona aplazó sus vacaciones)' });
          return h('div', { class: 'stack' }, h('p', null, a.Title + ' — ' + a.Tipo + ' (' + U.fDate(a.Desde) + ' a ' + U.fDate(a.Hasta) + ')'), AP.field('Motivo *', m),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
              h('button', { class: 'btn danger', type: 'button', onclick: async function () {
                if (m.value.trim().length < 4) return AP.toast('Indique el motivo.', 'warn');
                if (RE_SALUD.test(m.value)) return AP.toast('El motivo parece contener información de salud. Escriba solo el hecho general.', 'warn', 8000);
                try {
                  await AP.B.update('AP_Ausencias', a.id, { Estado: 'Anulada', AnuladoPor: AP.Session.user.upn, MotivoAnulacion: m.value.trim(), FechaAnulacion: new Date().toISOString() });
                  await AP.Planta.registrarCambio('Anulación de ausencia', a.Title + ' (' + (a.NumDoc || '') + ')', a.Tipo + ' del ' + U.fDate(a.Desde) + ' al ' + U.fDate(a.Hasta) + '. Motivo: ' + m.value.trim(), 1, U.ymd(a.Desde) <= U.ymd() ? 1 : 0, '', m.value.trim());
                  await AP.Audit.log('Anulación de ausencia', a.Title + ' — ' + a.Tipo, m.value.trim());
                  close(); AP.toast('Ausencia anulada.'); cargar();
                } catch (e) { AP.toast(e.message, 'error'); }
              } }, 'Anular ausencia')));
        } });
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('calendar', 18), h('span', null, 'Vacaciones, permisos de día completo, licencias y demás ausencias del personal propio. En esas fechas la portería no deja ingresar a la persona sin aprobación del Director de Seguridad Integral. ' +
          'Una ausencia no se borra: se anula con motivo y queda en el registro de cambios.')),
        h('div', { class: 'filters' }, fEst, fTipo, q, AP.btnExcel(function () {
          var l = filtradas();
          if (!l.length) return AP.toast('No hay ausencias con el filtro actual.', 'warn');
          AP.exportar('Ausencias', [['Persona', function (a) { return a.Title; }, 30], ['Documento', function (a) { return a.NumDoc; }, 15], ['Clase de personal', function (a) { return a.TipoPersonal; }, 14],
            ['Cargo', function (a) { return a.Cargo; }, 20], ['Área', function (a) { return a.Area; }, 16], ['Tipo', function (a) { return a.Tipo; }, 30], ['Desde', function (a) { return U.fDate(a.Desde); }, 12],
            ['Hasta', function (a) { return U.fDate(a.Hasta); }, 12], ['Días', dias, 7], ['Estado', estadoDe, 11], ['Detalle', function (a) { return a.Detalle; }, 30],
            ['Registró', function (a) { return a.RegistradoPorNombre || a._createdBy; }, 24], ['Motivo de anulación', function (a) { return a.MotivoAnulacion; }, 28]], l, 'xlsx',
            [['Vista', fEst.options[fEst.selectedIndex].text], ['Filtro', [fTipo.value, q.value].filter(Boolean).join(' · ') || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
        })), out);
      cargar();
    }

    // ---------- Horas en planta ----------
    function horas() {
      var hoy = U.ymd(), d0 = U.fromLocal(hoy, '12:00');
      var p = U.partsCO(d0), anio = Number(p.year), mes = Number(p.month), dia = Number(p.day);
      var pad = function (n) { return String(n).padStart(2, '0'); };
      var finMes = function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
      var mesAnt = mes === 1 ? [anio - 1, 12] : [anio, mes - 1];
      var lunes = J().lunes(hoy);
      var PRE = {
        semana: ['Esta semana', lunes, hoy],
        semanaAnt: ['Semana anterior', J().addYmd(lunes, -7), J().addYmd(lunes, -1)],
        quincena: ['Quincena actual', anio + '-' + pad(mes) + '-' + (dia <= 15 ? '01' : '16'), hoy],
        quincenaAnt: ['Quincena anterior', dia <= 15 ? mesAnt[0] + '-' + pad(mesAnt[1]) + '-16' : anio + '-' + pad(mes) + '-01', dia <= 15 ? mesAnt[0] + '-' + pad(mesAnt[1]) + '-' + finMes(mesAnt[0], mesAnt[1]) : anio + '-' + pad(mes) + '-15'],
        mes: ['Este mes', anio + '-' + pad(mes) + '-01', hoy],
        mesAnt: ['Mes anterior', mesAnt[0] + '-' + pad(mesAnt[1]) + '-01', mesAnt[0] + '-' + pad(mesAnt[1]) + '-' + finMes(mesAnt[0], mesAnt[1])]
      };
      var per = AP.select('per', Object.keys(PRE).map(function (k) { return [k, PRE[k][0]]; }).concat([['otro', 'Otro rango']]), 'quincena');
      var desde = AP.input('desde', PRE.quincena[1], { type: 'date' }), hasta = AP.input('hasta', PRE.quincena[2], { type: 'date' });
      per.addEventListener('change', function () { if (PRE[per.value]) { desde.value = PRE[per.value][1]; hasta.value = PRE[per.value][2]; } });
      [desde, hasta].forEach(function (i) { i.addEventListener('change', function () { per.value = 'otro'; }); });
      var fClase = AP.select('clase', [['', 'Toda clase de personal']].concat(AP.CAT.tiposPersonal), 'Operario');
      var fArea = AP.select('area', [['', 'Todas las áreas']], '');
      var fNov = AP.select('nov', [['', 'Todas las personas'], ['reg', 'Solo con registros'], ['inc', 'Solo con registros incompletos'], ['tarde', 'Solo con llegadas tarde']], 'reg');
      var q = AP.buscador('Buscar persona, documento o cargo', pintar);
      [fClase, fArea, fNov].forEach(function (s) { s.addEventListener('change', pintar); });
      var out = h('div', { class: 'stack' });
      var res = null, rango = null, personal = [];
      function filtrados() {
        return (res || []).filter(function (r) {
          if (fClase.value && r.p.TipoPersonal !== fClase.value) return false;
          if (fArea.value && r.p.Area !== fArea.value) return false;
          if (fNov.value === 'reg' && !r.dias.some(function (d) { return d.entradas.length || d.salidas.length; })) return false;
          if (fNov.value === 'inc' && !r.incompletos) return false;
          if (fNov.value === 'tarde' && !r.tardes) return false;
          return AP.coincide(r.p, q.value, ['Title', 'NumDoc', 'Cargo', 'Area']);
        });
      }
      async function calcular() {
        if (!desde.value || !hasta.value || hasta.value < desde.value) return AP.toast('Revise el rango de fechas.', 'warn');
        var nDias = Math.round((U.fromLocal(hasta.value, '12:00') - U.fromLocal(desde.value, '12:00')) / 864e5) + 1;
        if (nDias > 62) return AP.toast('Consulte máximo 62 días por vez.', 'warn');
        var info = h('span', null, 'Consultando…');
        out.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spin' }), info));
        try {
          var a = J().addYmd(desde.value, -1), b = hasta.value < hoy ? J().addYmd(hasta.value, 1) : hasta.value;
          var r = await Promise.all([D.personal(), D.semanas(desde.value), D.horarios().catch(function () { return []; }), D.ausencias(nDias + 70).catch(function () { return []; }),
            D.movimientos(a, b, function (i, n) { info.textContent = 'Consultando los registros de portería (' + i + ' de ' + n + ' días)…'; })]);
          personal = r[0];
          var ctx = { semanas: J().indexarSemanas(r[1]), horarios: r[2] };
          res = J().compendio(personal, r[4], desde.value, hasta.value, ctx, r[3]);
          rango = [desde.value, hasta.value];
          var areas = Array.from(new Set(personal.map(function (x) { return x.Area || ''; }).filter(Boolean))).sort(), v = fArea.value;
          fArea.replaceChildren.apply(fArea, [h('option', { value: '' }, 'Todas las áreas')].concat(areas.map(function (x) { return h('option', { value: x }, x); })));
          fArea.value = v;
          pintar();
        } catch (e) { out.replaceChildren(errBox(e)); }
      }
      function suma(l, k) { return l.reduce(function (a, r) { return a + r.tot[k]; }, 0); }
      function pintar() {
        if (!res) return;
        var l = filtrados().sort(function (x, y) { return y.tot.total - x.tot.total; });
        var kpi = function (v, t, kind) { return h('div', { class: 'kpi ' + (kind || '') }, h('strong', null, v), h('span', null, t)); };
        var inc = l.reduce(function (a, r) { return a + r.incompletos; }, 0);
        var top = l.filter(function (r) { return r.tot.total > 0; }).slice(0, 15);
        var series = [{ k: 'D', n: 'Diurnas' }, { k: 'N', n: 'Nocturnas' }, { k: 'F', n: 'Domingo o festivo' }];
        out.replaceChildren(
          h('div', { class: 'kpis' }, kpi(String(l.length), 'Personas en la vista'), kpi(fh(suma(l, 'total')), 'Horas en planta', 'brand'), kpi(fh(suma(l, 'nocturnas') + suma(l, 'dfNocturnas')), 'Horas nocturnas'),
            kpi(fh(suma(l, 'dfDiurnas') + suma(l, 'dfNocturnas')), 'Horas en domingo o festivo'), kpi(String(inc), 'Registros incompletos', inc ? 'warn' : '')),
          top.length ? h('section', { class: 'card stack sm' }, h('h3', null, 'Horas en planta por persona' + (top.length > 1 ? ' (las ' + top.length + ' con más horas)' : '')), AP.Viz.leyenda(series),
            AP.Viz.hbars(top.map(function (r) { return { label: r.p.Title, valores: { D: r.tot.diurnas, N: r.tot.nocturnas, F: r.tot.dfDiurnas + r.tot.dfNocturnas } }; }), series, { unidad: 'h' })) : null,
          tabla([
            ['Persona', function (r) { return h('div', null, h('strong', null, r.p.Title), h('small', { class: 'block muted' }, [r.p.NumDoc, r.p.TipoPersonal, r.p.Area].filter(Boolean).join(' · '))); }],
            ['Días', function (r) { return String(r.diasConRegistro); }, 'num'],
            ['En planta', function (r) { return h('strong', null, fh(r.tot.total)); }, 'num'],
            ['Diurnas', function (r) { return fh(r.tot.diurnas); }, 'num'],
            ['Nocturnas', function (r) { return fh(r.tot.nocturnas); }, 'num'],
            ['Dom./fest. diurnas', function (r) { return fh(r.tot.dfDiurnas); }, 'num'],
            ['Dom./fest. nocturnas', function (r) { return fh(r.tot.dfNocturnas); }, 'num'],
            ['Programadas', function (r) { return r.programadas ? fh(r.programadas) : '—'; }, 'num'],
            ['Novedades', function (r) { return h('div', null, r.tardes ? AP.pill(r.tardes + ' tarde', 'warn') : null, r.incompletos ? AP.pill(r.incompletos + ' incompleto(s)', 'deny') : null, r.diasAus ? AP.pill(r.diasAus + ' día(s) de ausencia', 'muted') : null); }]
          ], l, detalle),
          h('p', { class: 'muted small' }, 'Horas entre la entrada y la salida registradas en portería (permanencia en planta). Diurnas de ' + ((AP.CFG.jornada || {}).inicioDiurno || '06:00') + ' a ' + ((AP.CFG.jornada || {}).inicioNocturno || '19:00') +
            ' y nocturnas de ' + ((AP.CFG.jornada || {}).inicioNocturno || '19:00') + ' a ' + ((AP.CFG.jornada || {}).inicioDiurno || '06:00') + '; domingos y festivos de Colombia aparte. No descuentan pausas ni califican horas extra: Talento Humano valida antes de liquidar la nómina.'));
      }
      function detalle(r) {
        AP.modal({ title: r.p.Title + ' — ' + U.fDate(U.fromLocal(rango[0], '12:00')) + ' a ' + U.fDate(U.fromLocal(rango[1], '12:00')), size: 'wide', body: tabla([
          ['Fecha', function (d) { var f = J().festivo(d.fecha); return h('div', null, U.fDate(U.fromLocal(d.fecha, '12:00')), h('small', { class: 'block muted' }, ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][J().dow(d.fecha)] + (f ? ' · ' + f : ''))); }],
          ['Turno', function (d) { return d.turno || ''; }],
          ['Entrada', function (d) { return d.entradas.map(U.fTime).join(', '); }],
          ['Salida', function (d) { return d.salidas.map(function (x) { return U.fTime(x) + (U.ymd(x) !== d.fecha ? ' (+1)' : ''); }).join(', '); }],
          ['Horas', function (d) { return fh(d.total); }, 'num'],
          ['Diurnas / nocturnas', function (d) { return fh(d.diurnas + d.dfDiurnas) + ' / ' + fh(d.nocturnas + d.dfNocturnas); }, 'num'],
          ['Novedad', function (d) { return [d.ausencia ? 'Ausencia: ' + d.ausencia : ''].concat(d.estados, d.novedades).filter(Boolean).join(' | '); }]
        ], r.dias) });
      }
      function exportar() {
        var l = filtrados();
        if (!l.length) return AP.toast('No hay personas con el filtro actual.', 'warn');
        var filasDia = [];
        l.forEach(function (r) { r.dias.forEach(function (d) { filasDia.push({ r: r, d: d }); }); });
        var n2 = function (x) { return Math.round((x || 0) * 100) / 100; };
        AP.exportarHojas('Horas_en_planta_' + rango[0] + '_a_' + rango[1], [
          { sheet: 'Resumen', rows: l, cols: [['Persona', function (r) { return r.p.Title; }, 30], ['Documento', function (r) { return r.p.NumDoc; }, 15], ['Clase', function (r) { return r.p.TipoPersonal; }, 13],
            ['Cargo', function (r) { return r.p.Cargo; }, 20], ['Área', function (r) { return r.p.Area; }, 16], ['Días con registro', function (r) { return r.diasConRegistro; }, 10],
            ['Horas en planta', function (r) { return n2(r.tot.total); }, 11], ['Diurnas', function (r) { return n2(r.tot.diurnas); }, 10], ['Nocturnas', function (r) { return n2(r.tot.nocturnas); }, 10],
            ['Dominical/festiva diurnas', function (r) { return n2(r.tot.dfDiurnas); }, 12], ['Dominical/festiva nocturnas', function (r) { return n2(r.tot.dfNocturnas); }, 12],
            ['Horas programadas', function (r) { return n2(r.programadas); }, 11], ['Días programados', function (r) { return r.diasProg; }, 10], ['Llegadas tarde', function (r) { return r.tardes; }, 9],
            ['Registros incompletos', function (r) { return r.incompletos; }, 11], ['Días de ausencia (TH)', function (r) { return r.diasAus; }, 11]] },
          { sheet: 'Detalle por día', rows: filasDia, cols: [['Fecha', function (x) { return x.d.fecha; }, 11], ['Día', function (x) { return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][J().dow(x.d.fecha)]; }, 10],
            ['Festivo', function (x) { return J().festivo(x.d.fecha) || ''; }, 18], ['Persona', function (x) { return x.r.p.Title; }, 30], ['Documento', function (x) { return x.r.p.NumDoc; }, 15], ['Área', function (x) { return x.r.p.Area; }, 16],
            ['Turno programado', function (x) { return x.d.turno || ''; }, 22], ['Entrada(s)', function (x) { return x.d.entradas.map(U.fDateTime).join(' | '); }, 20], ['Salida(s)', function (x) { return x.d.salidas.map(U.fDateTime).join(' | '); }, 20],
            ['Horas en planta', function (x) { return n2(x.d.total); }, 10], ['Diurnas', function (x) { return n2(x.d.diurnas); }, 9], ['Nocturnas', function (x) { return n2(x.d.nocturnas); }, 9],
            ['Dom./fest. diurnas', function (x) { return n2(x.d.dfDiurnas); }, 10], ['Dom./fest. nocturnas', function (x) { return n2(x.d.dfNocturnas); }, 10],
            ['Novedad', function (x) { return [x.d.ausencia ? 'Ausencia: ' + x.d.ausencia : ''].concat(x.d.estados, x.d.novedades).filter(Boolean).join(' | '); }, 40]] }
        ], [['Periodo', rango[0] + ' a ' + rango[1]], ['Filtro', [fClase.value, fArea.value, fNov.options[fNov.selectedIndex].text, q.value].filter(Boolean).join(' · ')],
          ['Franjas', 'Diurna ' + ((AP.CFG.jornada || {}).inicioDiurno || '06:00') + '–' + ((AP.CFG.jornada || {}).inicioNocturno || '19:00') + '; nocturna ' + ((AP.CFG.jornada || {}).inicioNocturno || '19:00') + '–' + ((AP.CFG.jornada || {}).inicioDiurno || '06:00') + ' (art. 160 CST, modificado por la Ley 2466 de 2025). Domingos y festivos (Ley 51 de 1983) se informan aparte.'],
          ['Alcance', 'Horas de permanencia en planta según los registros de ingreso y salida de portería. No descuentan pausas ni califican horas extra o recargos; Talento Humano los valida antes de liquidar la nómina.'],
          ['Registros incompletos', 'Ingresos sin salida o salidas sin ingreso: no suman horas hasta que se aclaren.'],
          ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())], ['Fuente', 'Colecciones AP_Movimientos, AP_ProgPlanta, AP_Horarios y AP_Ausencias']]);
      }
      box.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('clock', 18), h('span', null, 'Compendio de horas por trabajador a partir de las marcas de ingreso y salida en portería, divididas en diurnas, nocturnas y en domingo o festivo. ' +
          'Es un soporte para Talento Humano: no reemplaza la liquidación de nómina.')),
        h('div', { class: 'filters' }, per, AP.field('Desde', desde), AP.field('Hasta', hasta), h('button', { class: 'btn primary', type: 'button', onclick: calcular }, AP.icon('search', 18), 'Calcular')),
        h('div', { class: 'filters' }, fClase, fArea, fNov, q, AP.btnExcel(exportar)),
        out);
      out.replaceChildren(h('p', { class: 'muted' }, 'Elija el periodo y oprima «Calcular».'));
    }
  });
})();
