/* Consola: horarios programados, permisos y verificación de novedades (solo Director de Seguridad Integral) */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function errBox(e) {
    if (e && e.missingList) return AP.empty('settings', 'Falta crear la estructura en SharePoint', e.message, h('a', { class: 'btn primary', href: '#/consola/instalacion' }, 'Ir a instalación'));
    return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con Microsoft 365' : 'No fue posible cargar la información', e && e.message);
  }
  function tabla(cols, rows) {
    return h('div', { class: 'tbl-scroll' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', null, c[0]); }))),
      h('tbody', null, rows.length ? rows.map(function (r) {
        return h('tr', null, cols.map(function (c) { var v = c[1](r); return h('td', { 'data-label': c[0] }, v == null ? '' : v); }));
      }) : h('tr', null, h('td', { colspan: cols.length, class: 'center muted' }, 'Sin registros')))));
  }
  function me() { return AP.Session.user.upn; }
  function nowIso() { return new Date().toISOString(); }
  function guard() { if (!AP.Session.can('admin')) { AP.go('/porteria'); return false; } return true; }
  async function personasHabilitadas() {
    var l = await AP.B.listAll('AP_Personas', { exclude: ['Foto', 'Observaciones'] });
    return l.filter(function (p) { return p.Estado === 'Habilitado'; }).sort(function (a, b) { return U.fold(a.Title) < U.fold(b.Title) ? -1 : 1; });
  }
  var RE_SALUD = /(diagn[oó]stic|enfermedad|c[aá]ncer|embaraz|psiqui|psicol|terapia|cirug|incapacidad m[eé]dica|v\.?i\.?h|medicament|tratamiento m[eé]dico)/i;

  // =================== HORARIOS ===================
  AP.route('/consola/horarios', function () {
    if (!guard()) return;
    var content = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    AP.consolaShell('/consola/horarios', 'Horarios y turnos', content,
      h('button', { class: 'btn primary', type: 'button', onclick: function () { editar(null); } }, AP.icon('plus', 18), 'Programar horario'));
    var datos = { hor: [], per: [] };
    var q = h('input', { type: 'search', placeholder: 'Buscar por nombre, documento, área o turno', class: 'grow' });
    var box = h('div', { class: 'stack' });
    q.addEventListener('input', U.debounce(pintar, 200));

    async function cargar() {
      try {
        var r = await Promise.all([AP.B.listAll('AP_Horarios'), personasHabilitadas()]);
        datos.hor = r[0]; datos.per = r[1];
        var sin = datos.per.filter(function (p) { return !datos.hor.some(function (x) { return x.Token === p.Token && x.Activo !== false; }); });
        content.replaceChildren(
          h('div', { class: 'banner info' }, AP.icon('clock', 18), h('span', null,
            'Al leer el QR, la aplicación compara la hora con el turno programado de la persona: a tiempo hasta la hora de entrada; ' + AP.Horario.cfg().minutosPendiente +
            ' minutos o más después, el ingreso queda DENEGADO hasta que usted verifique; entre 1 y ' + (AP.Horario.cfg().minutosPendiente - 1) + ' minutos queda PENDIENTE. ' +
            'La salida antes de la hora de fin exige un permiso suyo; sin él se muestra como NO AUTORIZADA (sin retención física). Las personas sin horario registrado no tienen estas reglas.')),
          sin.length ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, sin.length + ' persona(s) habilitada(s) sin horario registrado (' + sin.slice(0, 4).map(function (p) { return p.Title; }).join(', ') + (sin.length > 4 ? '…' : '') + '). Las reglas de puntualidad y salida no se les aplican.')) : null,
          h('div', { class: 'filters' }, q), box);
        pintar();
      } catch (e) { content.replaceChildren(errBox(e)); }
    }
    function pintar() {
      var t = U.fold(q.value);
      var rows = datos.hor.filter(function (x) { return !t || U.fold([x.Title, x.NumDoc, x.Area, x.Turno].join(' ')).indexOf(t) >= 0; })
        .sort(function (a, b) { return (a.Activo === false) - (b.Activo === false) || (U.fold(a.Title) < U.fold(b.Title) ? -1 : 1); });
      box.replaceChildren(tabla([
        ['Persona', function (x) { return h('div', null, h('strong', null, x.Title), h('small', { class: 'muted block' }, (x.NumDoc || '') + (x.Area ? ' · ' + x.Area : ''))); }],
        ['Turno', function (x) { return x.Turno || '—'; }],
        ['Días', function (x) { return AP.Horario.nombreDias(x.Dias); }],
        ['Horario', function (x) { var a = AP.Horario.toMin(x.HoraEntrada), b = AP.Horario.toMin(x.HoraSalida); return x.HoraEntrada + ' – ' + x.HoraSalida + (b <= a ? ' (+1 día)' : ''); }],
        ['Vigencia', function (x) { return (x.VigenteDesde || 'sin inicio') + ' → ' + (x.VigenteHasta || 'indefinida'); }],
        ['Estado', function (x) { return AP.pill(x.Activo === false ? 'Inactivo' : 'Activo', x.Activo === false ? 'muted' : 'ok'); }],
        ['', function (x) {
          return h('div', { class: 'row gap' },
            h('button', { class: 'btn small', type: 'button', onclick: function () { editar(x); } }, 'Editar'),
            x.Activo === false ? null : h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { desactivar(x); } }, 'Desactivar'));
        }]
      ], rows));
    }
    async function desactivar(x) {
      if (!(await AP.confirm('Desactivar horario', 'Se desactiva el horario de ' + x.Title + ' (' + (x.Turno || x.HoraEntrada) + '). Mientras no tenga otro, no se le aplicarán las reglas de puntualidad.', 'Desactivar', 'danger'))) return;
      try {
        await AP.B.update('AP_Horarios', x.id, { Activo: false });
        x.Activo = false;
        await AP.Audit.log('Desactivación de horario', x.Title, x.Turno + ' ' + x.HoraEntrada + '-' + x.HoraSalida);
        AP.toast('Horario desactivado.'); pintar();
      } catch (e) { AP.toast(e.message, 'error'); }
    }

    function editar(x) {
      var nuevo = !x, d0 = x || { Dias: '1,2,3,4,5', HoraEntrada: '08:00', HoraSalida: '17:00', Activo: true };
      AP.modal({
        title: nuevo ? 'Programar horario' : 'Horario de ' + x.Title, size: 'wide',
        body: function (close) {
          var elegidos = new Set(nuevo ? [] : [x.Token]);
          var filtroP = h('input', { type: 'search', placeholder: 'Filtrar personas por nombre, documento o área' });
          var lista = h('div', { class: 'pick-list' });
          var cuenta = h('small', { class: 'muted' });
          function pintarLista() {
            var t = U.fold(filtroP.value);
            lista.replaceChildren();
            datos.per.filter(function (p) { return !t || U.fold([p.Title, p.NumDoc, p.Area, p.Cargo].join(' ')).indexOf(t) >= 0; }).slice(0, 200).forEach(function (p) {
              var cb = h('input', { type: 'checkbox', checked: elegidos.has(p.Token), disabled: !nuevo });
              cb.addEventListener('change', function () { if (cb.checked) elegidos.add(p.Token); else elegidos.delete(p.Token); cuenta.textContent = elegidos.size + ' seleccionada(s)'; });
              lista.appendChild(h('label', null, cb, h('span', null, p.Title + ' — ' + (p.NumDoc || '') + (p.Area ? ' · ' + p.Area : ''))));
            });
            cuenta.textContent = elegidos.size + ' seleccionada(s)';
          }
          filtroP.addEventListener('input', U.debounce(pintarLista, 150));
          pintarLista();
          var dias = new Set(String(d0.Dias || '').split(',').filter(Boolean));
          var diasBox = h('div', { class: 'dias-sel' }, AP.CAT.dias.map(function (d) {
            var cb = h('input', { type: 'checkbox', checked: dias.has(d[0]), dataset: { d: d[0] } });
            cb.addEventListener('change', function () { if (cb.checked) dias.add(d[0]); else dias.delete(d[0]); });
            return h('label', null, cb, d[1]);
          }));
          function marcar(arr) { dias.clear(); arr.forEach(function (v) { dias.add(v); }); diasBox.querySelectorAll('input').forEach(function (i) { i.checked = dias.has(i.dataset.d); }); }
          var f = {
            Turno: AP.input('Turno', d0.Turno, { placeholder: 'Ej.: Turno A, Administrativo, Noche' }),
            HoraEntrada: AP.input('HoraEntrada', d0.HoraEntrada, { type: 'time' }),
            HoraSalida: AP.input('HoraSalida', d0.HoraSalida, { type: 'time' }),
            VigenteDesde: AP.input('VigenteDesde', d0.VigenteDesde, { type: 'date' }),
            VigenteHasta: AP.input('VigenteHasta', d0.VigenteHasta, { type: 'date' }),
            Observaciones: AP.textarea('Observaciones', d0.Observaciones, { rows: 2 })
          };
          var guardar = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            var v = {}; Object.keys(f).forEach(function (k) { v[k] = f[k].value.trim(); });
            if (!elegidos.size) return AP.toast('Seleccione al menos una persona.', 'warn');
            if (AP.Horario.toMin(v.HoraEntrada) == null || AP.Horario.toMin(v.HoraSalida) == null) return AP.toast('Indique hora de entrada y de salida.', 'warn');
            if (v.HoraEntrada === v.HoraSalida) return AP.toast('La hora de entrada y la de salida no pueden ser iguales.', 'warn');
            if (!dias.size) return AP.toast('Marque al menos un día de la semana.', 'warn');
            if (v.VigenteDesde && v.VigenteHasta && v.VigenteHasta < v.VigenteDesde) return AP.toast('La vigencia termina antes de empezar.', 'warn');
            var diasTxt = AP.CAT.dias.map(function (d) { return d[0]; }).filter(function (d) { return dias.has(d); }).join(',');
            guardar.disabled = true;
            try {
              var n = 0;
              if (nuevo) {
                var tokens = Array.from(elegidos);
                for (var i = 0; i < tokens.length; i++) {
                  var p = datos.per.find(function (z) { return z.Token === tokens[i]; });
                  var rec = await AP.B.create('AP_Horarios', Object.assign({ Title: p.Title, Token: p.Token, NumDoc: p.NumDoc, Area: p.Area || '', Dias: diasTxt, Activo: true }, v));
                  datos.hor.push(rec); n++;
                }
                await AP.Audit.log('Programación de horario', n + ' persona(s)', (v.Turno || '') + ' ' + v.HoraEntrada + '-' + v.HoraSalida + ' días ' + diasTxt);
              } else {
                var upd = Object.assign({ Dias: diasTxt }, v);
                await AP.B.update('AP_Horarios', x.id, upd); Object.assign(x, upd); n = 1;
                await AP.Audit.log('Modificación de horario', x.Title, (v.Turno || '') + ' ' + v.HoraEntrada + '-' + v.HoraSalida + ' días ' + diasTxt);
              }
              close(); AP.toast(n + ' horario(s) guardado(s). Los celulares de portería lo reciben en su próxima actualización.'); pintar(); AP.Sync.run();
            } catch (e) { AP.toast(e.message, 'error'); } finally { guardar.disabled = false; }
          } }, AP.icon('check', 18), 'Guardar');
          return h('div', { class: 'stack' },
            nuevo ? h('div', { class: 'stack sm' }, h('strong', null, 'Personas a las que se aplica este horario'), filtroP, lista, cuenta) : h('p', null, h('strong', null, x.Title), ' — ' + (x.NumDoc || '')),
            h('div', { class: 'form-grid' },
              AP.field('Turno o nombre del horario', f.Turno),
              AP.field('Hora de entrada *', f.HoraEntrada), AP.field('Hora de salida *', f.HoraSalida, 'Si es menor que la de entrada, el turno cruza la medianoche (p. ej., 22:00 a 06:00).'),
              AP.field('Vigente desde', f.VigenteDesde, 'Opcional.'), AP.field('Vigente hasta', f.VigenteHasta, 'Opcional. Útil para turnos rotativos: programe cada semana.'),
              AP.field('Observaciones', f.Observaciones, null, 'span2')),
            h('div', { class: 'stack sm' }, h('strong', null, 'Días de la semana'), diasBox,
              h('div', { class: 'row gap wrap' },
                h('button', { class: 'btn small', type: 'button', onclick: function () { marcar(['1', '2', '3', '4', '5']); } }, 'Lunes a viernes'),
                h('button', { class: 'btn small', type: 'button', onclick: function () { marcar(['1', '2', '3', '4', '5', '6']); } }, 'Lunes a sábado'),
                h('button', { class: 'btn small', type: 'button', onclick: function () { marcar(['0', '1', '2', '3', '4', '5', '6']); } }, 'Todos los días'))),
            h('p', { class: 'help' }, 'Una persona puede tener varios horarios (por ejemplo, uno de lunes a viernes y otro de sábado). El horario es un dato de control de acceso; no sustituye el registro de asistencia ni la programación de Talento Humano.'),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), guardar));
        }
      });
    }
    cargar();
  });

  // =================== PERMISOS ===================
  async function crearPermiso(opt) {
    opt = opt || {};
    var per = opt.personas || await personasHabilitadas();
    return new Promise(function (resolve) {
      var hecho = null;
      AP.modal({
        title: 'Registrar permiso', size: 'wide', onClose: function () { resolve(hecho); },
        body: function (close) {
          var dl = h('datalist', { id: 'perm-dl' }, per.map(function (p) { return h('option', { value: p.Title + ' — ' + (p.NumDoc || '') }); }));
          var pers = AP.input('persona', opt.persona ? opt.persona.Title + ' — ' + (opt.persona.NumDoc || '') : '', { list: 'perm-dl', placeholder: 'Escriba nombre o documento y elija' });
          var ini = new Date(), fin = new Date(Date.now() + 2 * 3600000);
          var f = {
            Tipo: AP.select('Tipo', AP.CAT.tiposPermiso, opt.tipo || 'Ingreso tardío'),
            Desde: AP.input('Desde', U.toLocalInput(opt.desde || ini), { type: 'datetime-local' }),
            Hasta: AP.input('Hasta', U.toLocalInput(opt.hasta || fin), { type: 'datetime-local' }),
            Detalle: AP.textarea('Detalle', opt.detalle || '', { rows: 2, placeholder: 'Motivo general (p. ej., cita, diligencia personal, permiso autorizado). Sin datos de salud.' }),
            AutorizadoPor: AP.input('AutorizadoPor', opt.autoriza || 'Director de Seguridad Integral')
          };
          var guardar = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            var p = per.find(function (z) { return (z.Title + ' — ' + (z.NumDoc || '')) === pers.value.trim(); });
            if (!p) return AP.toast('Elija a la persona de la lista (debe estar habilitada).', 'warn');
            var a = U.fromLocalInput(f.Desde.value), b = U.fromLocalInput(f.Hasta.value);
            if (!a || !b || b <= a) return AP.toast('Revise el lapso de vigencia del permiso.', 'warn');
            if (RE_SALUD.test(f.Detalle.value)) return AP.toast('El detalle parece contener información de salud (dato sensible, art. 5 Ley 1581 de 2012). Escriba solo «permiso autorizado» o «cita personal», sin diagnóstico ni tratamiento.', 'warn', 9000);
            guardar.disabled = true;
            try {
              var rec = await AP.B.create('AP_Permisos', { Title: p.Title, Token: p.Token, NumDoc: p.NumDoc, Tipo: f.Tipo.value, Desde: a.toISOString(), Hasta: b.toISOString(),
                Estado: 'Vigente', Detalle: f.Detalle.value.trim(), AutorizadoPor: f.AutorizadoPor.value.trim() });
              await AP.Audit.log('Registro de permiso', p.Title + ' — ' + f.Tipo.value, U.fDateTime(a) + ' a ' + U.fDateTime(b) + '; autoriza: ' + f.AutorizadoPor.value.trim());
              hecho = rec; close(); AP.toast('Permiso registrado. Los celulares de portería lo reciben en su próxima actualización.'); AP.Sync.run();
            } catch (e) { AP.toast(e.message, 'error'); } finally { guardar.disabled = false; }
          } }, AP.icon('check', 18), 'Registrar permiso');
          return h('div', { class: 'stack' }, dl,
            h('div', { class: 'form-grid' }, AP.field('Persona *', pers, null, 'span2'), AP.field('Tipo *', f.Tipo),
              AP.field('Autorizado por', f.AutorizadoPor), AP.field('Vigente desde *', f.Desde), AP.field('Vigente hasta *', f.Hasta),
              AP.field('Detalle', f.Detalle, null, 'span2')),
            h('p', { class: 'help' }, 'Ingreso tardío: acepta el ingreso aunque pase la hora. Salida anticipada o temporal: la salida se muestra como AUTORIZADA dentro del lapso. Ingreso y salida fuera de horario: ambas. ' +
              'No registre diagnósticos ni datos de salud: son datos sensibles (art. 5 Ley 1581 de 2012); basta indicar que el permiso fue autorizado.'),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), guardar));
        }
      });
    });
  }

  AP.route('/consola/permisos', function (qs) {
    if (!guard()) return;
    var tab = qs.t || 'vigentes';
    var content = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    AP.consolaShell('/consola/permisos', 'Permisos', content,
      h('button', { class: 'btn primary', type: 'button', onclick: async function () { if (await crearPermiso()) AP.render(); } }, AP.icon('plus', 18), 'Registrar permiso'));
    (async function () {
      try {
        var todos = await AP.B.listRange('AP_Permisos', 'Hasta', U.addDays(new Date(), tab === 'historial' ? -90 : -1), null);
        var ahora = Date.now();
        var vig = todos.filter(function (p) { return p.Estado !== 'Anulado' && new Date(p.Hasta).getTime() >= ahora; });
        var rows = (tab === 'vigentes' ? vig : todos.filter(function (p) { return vig.indexOf(p) < 0; })).sort(function (a, b) { return a.Desde < b.Desde ? 1 : -1; });
        var chips = h('div', { class: 'chips' }, [['vigentes', 'Vigentes y futuros'], ['historial', 'Historial (90 días)']].map(function (t) {
          return h('a', { class: 'chip ' + (t[0] === tab ? 'on' : ''), href: '#/consola/permisos?t=' + t[0] }, t[1]);
        }));
        content.replaceChildren(chips, tabla([
          ['Persona', function (p) { return h('div', null, h('strong', null, p.Title), h('small', { class: 'muted block' }, p.NumDoc || '')); }],
          ['Tipo', function (p) { return p.Tipo; }],
          ['Vigencia', function (p) { return U.fDateTime(p.Desde) + ' → ' + U.fDateTime(p.Hasta); }],
          ['Autoriza', function (p) { return p.AutorizadoPor || ''; }],
          ['Detalle', function (p) { return p.Detalle || ''; }],
          ['Estado', function (p) { return p.Estado === 'Anulado' ? AP.pill('Anulado', 'deny') : new Date(p.Hasta).getTime() < ahora ? AP.pill('Vencido', 'muted') : new Date(p.Desde).getTime() > ahora ? AP.pill('Programado', 'warn') : AP.pill('Vigente', 'ok'); }],
          ['', function (p) { return p.Estado !== 'Anulado' && new Date(p.Hasta).getTime() >= ahora ? h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { anular(p); } }, 'Anular') : null; }]
        ], rows));
      } catch (e) { content.replaceChildren(errBox(e)); }
    })();
    function anular(p) {
      AP.modal({ title: 'Anular permiso', body: function (close) {
        var m = AP.input('m', '', { placeholder: 'Motivo de la anulación' });
        return h('div', { class: 'stack' }, h('p', null, p.Title + ' — ' + p.Tipo + ' (' + U.fDateTime(p.Desde) + ' a ' + U.fDateTime(p.Hasta) + ')'), AP.field('Motivo', m),
          h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
            h('button', { class: 'btn danger', type: 'button', onclick: async function () {
              if (m.value.trim().length < 4) return AP.toast('Indique el motivo.', 'warn');
              try {
                await AP.B.update('AP_Permisos', p.id, { Estado: 'Anulado', AnuladoPor: me(), MotivoAnulacion: m.value.trim() });
                await AP.Audit.log('Anulación de permiso', p.Title + ' — ' + p.Tipo, m.value.trim());
                close(); AP.toast('Permiso anulado.'); AP.Sync.run(); AP.render();
              } catch (e) { AP.toast(e.message, 'error'); }
            } }, 'Anular permiso')));
      } });
    }
  });

  // =================== NOVEDADES ===================
  AP.route('/consola/novedades', function (qs) {
    if (!guard()) return;
    var tab = qs.t || 'sin';
    var content = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    AP.consolaShell('/consola/novedades', 'Novedades por verificar', content);
    (async function () {
      try {
        var r = await Promise.all([
          AP.B.listRange('AP_Movimientos', 'FechaHora', U.addDays(new Date(), -14), null),
          AP.B.listRange('AP_Verificaciones', 'FechaHora', U.addDays(new Date(), -15), null)]);
        var ver = new Map();
        r[1].sort(function (a, b) { return a.FechaHora < b.FechaHora ? -1 : 1; }).forEach(function (v) { ver.set(v.MovimientoId, v); });
        var nov = r[0].filter(function (m) { return m.Novedad || m.Excepcion; }).sort(function (a, b) { return a.FechaHora < b.FechaHora ? 1 : -1; });
        var sin = nov.filter(function (m) { return !ver.has(m.IdLocal); });
        var lista = tab === 'sin' ? sin : nov;
        var chips = h('div', { class: 'chips' }, [['sin', 'Sin verificar (' + sin.length + ')'], ['todas', 'Últimos 14 días (' + nov.length + ')']].map(function (t) {
          return h('a', { class: 'chip ' + (t[0] === tab ? 'on' : ''), href: '#/consola/novedades?t=' + t[0] }, t[1]);
        }));
        content.replaceChildren(
          h('div', { class: 'banner info' }, AP.icon('shield', 18), h('span', null, 'Aquí llegan las llegadas tardías, ingresos pendientes o denegados por horario, salidas no autorizadas, salidas sin lectura de QR y excepciones. Su verificación queda registrada con su nombre y no modifica el registro original.')),
          chips,
          tabla([
            ['Fecha y hora', function (m) { return U.fDateTime(m.FechaHora); }],
            ['Persona', function (m) { return h('div', null, h('strong', null, m.Title), h('small', { class: 'muted block' }, [m.Categoria, m.Area].filter(Boolean).join(' · '))); }],
            ['Movimiento', function (m) { return m.Resultado === 'Negado' ? AP.pill('Ingreso negado', 'deny') : AP.pill(m.Sentido, m.Sentido === 'Ingreso' ? 'ok' : 'muted'); }],
            ['Novedad', function (m) { return h('div', null, m.Novedad || (m.Excepcion ? 'Excepción autorizada por ' + (m.AutorizadoPor || '—') : ''), m.HorarioInfo ? h('small', { class: 'muted block' }, 'Turno: ' + m.HorarioInfo) : null); }],
            ['Vigilante', function (m) { return m.Vigilante || ''; }],
            ['Verificación', function (m) { var v = ver.get(m.IdLocal); return v ? h('div', null, AP.pill(v.Resultado, v.Resultado === 'Justificada' ? 'ok' : v.Resultado === 'No justificada' ? 'deny' : 'warn'), h('small', { class: 'muted block' }, (v.Nota || '') + ' — ' + U.fDateTime(v.FechaHora))) : AP.pill('Sin verificar', 'warn'); }],
            ['', function (m) {
              var v = ver.get(m.IdLocal);
              var tarde = m.Resultado === 'Negado' && /denegad/.test(m.Novedad || '') && m.Token;
              return h('div', { class: 'row gap wrap' },
                h('button', { class: 'btn small', type: 'button', onclick: function () { verificar(m, v); } }, v ? 'Reverificar' : 'Verificar'),
                tarde ? h('button', { class: 'btn small primary', type: 'button', onclick: function () { habilitar(m); } }, 'Habilitar ingreso') : null);
            }]
          ], lista));
      } catch (e) { content.replaceChildren(errBox(e)); }
    })();

    function verificar(m, previa) {
      AP.modal({ title: 'Verificar novedad', body: function (close) {
        var res = AP.select('Resultado', AP.CAT.resultadosVerificacion, previa ? previa.Resultado : 'Justificada');
        var nota = AP.textarea('Nota', '', { rows: 3, placeholder: 'Qué se verificó, con quién y cómo (sin datos de salud).' });
        return h('div', { class: 'stack' },
          h('p', null, h('strong', null, m.Title), ' — ' + (m.Novedad || 'Excepción') + ' (' + U.fDateTime(m.FechaHora) + ')'),
          AP.field('Resultado de la verificación', res), AP.field('Nota *', nota),
          h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
            h('button', { class: 'btn primary', type: 'button', onclick: async function () {
              if (nota.value.trim().length < 6) return AP.toast('Escriba la nota de verificación.', 'warn');
              try { await registrarVerificacion(m, res.value, nota.value.trim()); close(); AP.toast('Verificación registrada.'); AP.render(); }
              catch (e) { AP.toast(e.message, 'error'); }
            } }, AP.icon('check', 18), 'Registrar verificación')));
      } });
    }
    async function registrarVerificacion(m, resultado, nota) {
      var f = { IdLocal: U.uuid(), Title: m.Title, MovimientoId: m.IdLocal, Novedad: m.Novedad || 'Excepción', Resultado: resultado, Nota: nota, VerificadoPor: me(), FechaHora: nowIso() };
      f.Hash = await U.hashRecord(f);
      await AP.B.create('AP_Verificaciones', f);
      await AP.Audit.log('Verificación de novedad', m.Title + ' — ' + (m.Novedad || 'Excepción'), resultado + ': ' + nota, f.Hash);
    }
    // Levanta la denegación: registra un permiso de ingreso tardío de corta duración y deja constancia de la verificación
    async function habilitar(m) {
      var p = await crearPermiso({ persona: { Title: m.Title, NumDoc: m.NumDoc, Token: m.Token }, personas: [{ Title: m.Title, NumDoc: m.NumDoc, Token: m.Token }], tipo: 'Ingreso tardío', desde: new Date(), hasta: new Date(Date.now() + 2 * 3600000), detalle: 'Ingreso verificado por el Director tras denegación por horario' });
      if (!p) return;
      try { await registrarVerificacion(m, 'Justificada', 'Se levantó la denegación mediante permiso de ingreso tardío vigente hasta ' + U.fTime(p.Hasta) + '.'); } catch (e) { AP.toast(e.message, 'error'); }
      AP.render();
    }
  });
})();
