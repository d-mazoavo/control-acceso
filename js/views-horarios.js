/* Consola: horarios programados, permisos y verificación de novedades (solo Director de Seguridad Integral) */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function errBox(e) {
    if (e && e.missingList) return AP.empty('settings', 'Falta configurar la base de datos', e.message, h('a', { class: 'btn primary', href: '#/consola/instalacion' }, 'Ir a instalación'));
    return AP.empty(e && e.offline ? 'offline' : 'alert', e && e.offline ? 'Sin conexión con el servidor' : 'No fue posible cargar la información', e && e.message);
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
  var RE_SALUD = /(diagn[oó]stic|enfermedad|c[aá]ncer|embaraz|psiqui|psicol|terapia|cirug|incapacidad|v\.?i\.?h|medicament|tratamiento|m[eé]dic[oa]|\beps\b|\bips\b|hospital|cl[ií]nica|urgencias|odontol|examen(es)? de laboratorio)/i;

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
            'Al leer el QR, la aplicación compara la hora con el turno programado de la persona: el ingreso se habilita desde ' + AP.Horario.cfg().minutosAntelacionTurno +
            ' minutos antes de la hora de entrada (antes de eso se alerta MUY TEMPRANO y queda PENDIENTE); a tiempo hasta la hora de entrada; ' + AP.Horario.cfg().minutosPendiente +
            ' minutos o más después, el ingreso queda DENEGADO hasta que usted verifique; entre 1 y ' + (AP.Horario.cfg().minutosPendiente - 1) + ' minutos queda PENDIENTE. ' +
            'La salida antes de la hora de fin exige un permiso suyo; sin él se muestra como NO AUTORIZADA (sin retención física). Las personas sin horario registrado no tienen estas reglas.')),
          h('div', { class: 'banner info' }, AP.icon('truck', 18), h('span', null,
            'Acceso libre (conductores, contratistas): en los días y horas habilitados la persona entra y sale las veces que necesite, sin control de llegada tarde ni de salida antes de la hora. ' +
            'La llegada sí se controla fuera de ese horario: antes de la hora queda PENDIENTE de su verificación; después del cierre, o en un día no habilitado si es contratista, el ingreso requiere su aprobación.')),
          sin.length ? h('div', { class: 'banner warn' }, AP.icon('alert', 18), h('span', null, sin.length + ' persona(s) habilitada(s) sin horario registrado (' + sin.slice(0, 4).map(function (p) { return p.Title; }).join(', ') + (sin.length > 4 ? '…' : '') + '). Las reglas de puntualidad y salida no se les aplican.')) : null,
          h('div', { class: 'filters' }, q, AP.btnExcel(function () {
            var rows = filtrados();
            if (!rows.length) return AP.toast('No hay horarios con el filtro actual.', 'warn');
            AP.exportar('Horarios', [
              ['Persona', function (x) { return x.Title; }, 30], ['Documento', function (x) { return x.NumDoc; }, 15], ['Área', function (x) { return x.Area; }, 18],
              ['Turno', function (x) { return x.Turno; }, 18], ['Modalidad', function (x) { return modalidadTxt(x); }, 22], ['Días', function (x) { return AP.Horario.nombreDias(x.Dias); }, 26],
              ['Entrada', function (x) { return x.HoraEntrada; }, 9], ['Salida', function (x) { return x.HoraSalida; }, 9],
              ['Vigente desde', function (x) { return x.VigenteDesde; }, 13], ['Vigente hasta', function (x) { return x.VigenteHasta; }, 13],
              ['Estado', function (x) { return x.Activo === false ? 'Inactivo' : 'Activo'; }, 10], ['Observaciones', function (x) { return x.Observaciones; }, 30]
            ], rows, 'xlsx', [['Filtro', q.value || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
          })), box);
        pintar();
      } catch (e) { content.replaceChildren(errBox(e)); }
    }
    function modalidadTxt(x) { return AP.Horario.esLibre(x) ? 'Acceso libre dentro del horario' : 'Turno con control de puntualidad'; }
    function filtrados() {
      return datos.hor.filter(function (x) { return AP.coincide(x, q.value, ['Title', 'NumDoc', 'Area', 'Turno', 'HoraEntrada', modalidadTxt]); })
        .sort(function (a, b) { return (a.Activo === false) - (b.Activo === false) || (U.fold(a.Title) < U.fold(b.Title) ? -1 : 1); });
    }
    function pintar() {
      var rows = filtrados();
      box.replaceChildren(tabla([
        ['Persona', function (x) { return h('div', null, h('strong', null, x.Title), h('small', { class: 'muted block' }, (x.NumDoc || '') + (x.Area ? ' · ' + x.Area : ''))); }],
        ['Turno', function (x) { return x.Turno || '—'; }],
        ['Modalidad', function (x) { return AP.Horario.esLibre(x) ? AP.pill('Acceso libre', 'brand') : AP.pill('Turno', 'muted'); }],
        ['Días', function (x) { return AP.Horario.nombreDias(x.Dias); }],
        ['Horario', function (x) { var a = AP.Horario.toMin(x.HoraEntrada), b = AP.Horario.toMin(x.HoraSalida); return x.HoraEntrada === '00:00' && x.HoraSalida === '23:59' ? 'Todo el día' : x.HoraEntrada + ' – ' + x.HoraSalida + (b <= a ? ' (+1 día)' : ''); }],
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
      if (!AP.SCHEMA.AP_Horarios.cols.some(function (c) { return c[0] === 'Modalidad'; })) return AP.toast('Recargue la página (Ctrl+F5) para aplicar la actualización de la aplicación y vuelva a intentarlo.', 'warn', 9000);
      var nuevo = !x, d0 = x || { Dias: '1,2,3,4,5', HoraEntrada: '08:00', HoraSalida: '17:00', Activo: true, Modalidad: 'Turno' };
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
          var ayudaMod = h('p', { class: 'help' });
          var modalidad = AP.segmented('Modalidad', [
            { value: 'Turno', label: 'Turno (puntualidad)', icon: 'clock' },
            { value: 'Libre', label: 'Acceso libre (entra y sale)', icon: 'truck' }
          ], AP.Horario.esLibre(d0) ? 'Libre' : 'Turno', function () { pintarMod(); });
          function pintarMod() {
            ayudaMod.textContent = modalidad.dataset.value === 'Libre'
              ? 'Para conductores y contratistas que entran y salen varias veces en el día. Dentro de los días y horas habilitados no se mide llegada tarde ni salida antes de la hora. Fuera de ese horario la llegada sí se controla.'
              : 'Control de puntualidad: llegada tardía (pendiente o con aprobación del Director) y salida antes de la hora de fin sin permiso (no autorizada). Para personal con jornada fija.';
          }
          pintarMod();
          var todoDia = h('button', { class: 'btn small', type: 'button', onclick: function () { f.HoraEntrada.value = '00:00'; f.HoraSalida.value = '23:59'; } }, 'Todo el día (00:00 a 23:59)');
          var guardar = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            var v = {}; Object.keys(f).forEach(function (k) { v[k] = f[k].value.trim(); });
            v.Modalidad = modalidad.dataset.value === 'Libre' ? 'Libre' : 'Turno';
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
                await AP.Audit.log('Programación de horario', n + ' persona(s)', (v.Turno || '') + ' ' + v.HoraEntrada + '-' + v.HoraSalida + ' días ' + diasTxt + ' · ' + modalidadTxt(v));
              } else {
                var upd = Object.assign({ Dias: diasTxt }, v);
                await AP.B.update('AP_Horarios', x.id, upd); Object.assign(x, upd); n = 1;
                await AP.Audit.log('Modificación de horario', x.Title, (v.Turno || '') + ' ' + v.HoraEntrada + '-' + v.HoraSalida + ' días ' + diasTxt + ' · ' + modalidadTxt(v));
              }
              close(); AP.toast(n + ' horario(s) guardado(s). Los celulares de portería lo reciben en su próxima actualización.'); pintar(); AP.Sync.run();
            } catch (e) { AP.toast(e.message, 'error'); } finally { guardar.disabled = false; }
          } }, AP.icon('check', 18), 'Guardar');
          return h('div', { class: 'stack' },
            nuevo ? h('div', { class: 'stack sm' }, h('strong', null, 'Personas a las que se aplica este horario'), filtroP, lista, cuenta) : h('p', null, h('strong', null, x.Title), ' — ' + (x.NumDoc || '')),
            h('div', { class: 'stack sm' }, h('strong', null, 'Modalidad'), modalidad, ayudaMod),
            h('div', { class: 'form-grid' },
              AP.field('Turno o nombre del horario', f.Turno),
              h('div', { class: 'field' }, h('label', null, 'Atajo'), todoDia),
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
            Detalle: AP.textarea('Detalle', opt.detalle || '', { rows: 2, placeholder: 'Motivo general (p. ej., cita, diligencia personal, permiso autorizado). Sin datos de salud.' })
          };
          var cargo = (AP.Session.user.perfil && AP.Session.user.perfil.Cargo) || 'Director de Seguridad Integral';
          var autoriza = AP.autorizaPicker({
            fuente: function () { return Promise.resolve(opt.todas || AP.B.listAll('AP_Personas', { exclude: ['Foto', 'Observaciones'] })); },
            valor: opt.autorizaYo ? { AutorizadoPor: AP.Session.user.nombre + ' — ' + cargo, AutorizadoPorCargo: cargo } : {}
          });
          var guardar = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            var p = per.find(function (z) { return (z.Title + ' — ' + (z.NumDoc || '')) === pers.value.trim(); });
            if (!p) return AP.toast('Elija a la persona de la lista (debe estar habilitada).', 'warn');
            var a = U.fromLocalInput(f.Desde.value), b = U.fromLocalInput(f.Hasta.value);
            if (!a || !b || b <= a) return AP.toast('Revise el lapso de vigencia del permiso.', 'warn');
            if (RE_SALUD.test(f.Detalle.value)) return AP.toast('El detalle parece contener información de salud (dato sensible, art. 5 Ley 1581 de 2012). Escriba solo «permiso autorizado» o «cita personal», sin diagnóstico ni tratamiento.', 'warn', 9000);
            if (!autoriza.elegido()) return AP.toast('Seleccione de la lista de personas quién autoriza el permiso.', 'warn');
            var au = autoriza.valor();
            guardar.disabled = true;
            try {
              var rec = await AP.B.create('AP_Permisos', Object.assign({ Title: p.Title, Token: p.Token, NumDoc: p.NumDoc, Tipo: f.Tipo.value, Desde: a.toISOString(), Hasta: b.toISOString(),
                Estado: 'Vigente', Detalle: f.Detalle.value.trim() }, au));
              await AP.Audit.log('Registro de permiso', p.Title + ' — ' + f.Tipo.value, U.fDateTime(a) + ' a ' + U.fDateTime(b) + '; autoriza: ' + au.AutorizadoPor + (au.AutorizadoPorDoc ? ' (doc. ' + au.AutorizadoPorDoc + ')' : ''));
              hecho = rec; close(); AP.toast('Permiso registrado. Los celulares de portería lo reciben en su próxima actualización.'); AP.Sync.run();
            } catch (e) { AP.toast(e.message, 'error'); } finally { guardar.disabled = false; }
          } }, AP.icon('check', 18), 'Registrar permiso');
          return h('div', { class: 'stack' }, dl,
            h('div', { class: 'form-grid' }, AP.field('Persona *', pers, null, 'span2'), AP.field('Tipo *', f.Tipo, null, 'span2'),
              AP.field('Vigente desde *', f.Desde), AP.field('Vigente hasta *', f.Hasta),
              AP.field('Autorizado por *', autoriza, 'Búsquelo en la lista de personas registradas (jefe inmediato, Talento Humano, etc.).', 'span2'),
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
    // Vigentes y programados, o el registro completo de los permisos otorgados en un rango de fechas
    var tab = qs.t === 'historial' || qs.t === 'registro' ? 'registro' : 'vigentes';
    var content = h('div', { class: 'stack' });
    AP.consolaShell('/consola/permisos', 'Permisos', content,
      h('button', { class: 'btn primary', type: 'button', onclick: async function () { if (await crearPermiso()) AP.render(); } }, AP.icon('plus', 18), 'Registrar permiso'));
    var ahora = Date.now();
    var estadoDe = function (p) { return p.Estado === 'Anulado' ? 'Anulado' : new Date(p.Hasta).getTime() < ahora ? 'Vencido' : new Date(p.Desde).getTime() > ahora ? 'Programado' : 'Vigente'; };
    var KIND = { Anulado: 'deny', Vencido: 'muted', Programado: 'warn', Vigente: 'ok' };
    var desde = AP.input('desde', U.ymd(U.addDays(new Date(), -90)), { type: 'date' });
    var hasta = AP.input('hasta', U.ymd(), { type: 'date' });
    var fTipo = AP.select('tipo', [['', 'Todos los tipos']].concat(AP.CAT.tiposPermiso), '');
    var fEst = AP.select('estado', [['', 'Todos los estados'], 'Vigente', 'Programado', 'Vencido', 'Anulado'], '');
    var qp = AP.buscador('Buscar persona, documento, quien autoriza o detalle', pintarP);
    [fTipo, fEst].forEach(function (s0) { s0.addEventListener('change', pintarP); });
    var tbox = h('div');
    var base = [];
    var tabs = h('div', { class: 'tabs' }, [['vigentes', 'Vigentes y programados'], ['registro', 'Registro de permisos otorgados']].map(function (t) {
      return h('a', { class: t[0] === tab ? 'on' : '', href: '#/consola/permisos?t=' + t[0] }, t[1]);
    }));
    var filaFechas = tab === 'registro' ? h('div', { class: 'filters' }, AP.field('Desde', desde), AP.field('Hasta', hasta),
      h('button', { class: 'btn primary', type: 'button', onclick: consultar }, AP.icon('search', 18), 'Consultar'),
      h('small', { class: 'muted' }, 'Permisos cuya vigencia toca el rango: incluye los vigentes, los vencidos y los anulados.')) : null;
    var COLS = [
      ['Persona', function (p) { return p.Title; }, 30], ['Documento', function (p) { return p.NumDoc; }, 15], ['Tipo', function (p) { return p.Tipo; }, 30],
      ['Desde', function (p) { return U.toDate(p.Desde); }, 17], ['Hasta', function (p) { return U.toDate(p.Hasta); }, 17], ['Estado', estadoDe, 12],
      ['Autorizado por', function (p) { return p.AutorizadoPor; }, 30], ['Doc. de quien autoriza', function (p) { return p.AutorizadoPorDoc; }, 16],
      ['Detalle', function (p) { return p.Detalle; }, 40], ['Solicitud de portería', function (p) { return p.SolicitudId ? 'Sí' : ''; }, 12],
      ['Anulado por', function (p) { return p.AnuladoPor; }, 16], ['Motivo de anulación', function (p) { return p.MotivoAnulacion; }, 30],
      ['Registrado por', function (p) { return p._createdBy; }, 16], ['Fecha de registro', function (p) { return p._created ? U.toDate(p._created) : ''; }, 17]
    ];
    function filtrados() {
      return base.filter(function (p) {
        if (fTipo.value && p.Tipo !== fTipo.value) return false;
        if (fEst.value && estadoDe(p) !== fEst.value) return false;
        return AP.coincide(p, qp.value, ['Title', 'NumDoc', 'Tipo', 'AutorizadoPor', 'AutorizadoPorDoc', 'Detalle', estadoDe]);
      });
    }
    function pintarP() {
      var l = filtrados();
      var cuenta = {}; l.forEach(function (p) { var e = estadoDe(p); cuenta[e] = (cuenta[e] || 0) + 1; });
      tbox.replaceChildren(
        h('div', { class: 'row gap wrap' }, AP.pill(l.length + ' permisos', 'brand'), ['Vigente', 'Programado', 'Vencido', 'Anulado'].map(function (e) { return cuenta[e] ? AP.pill(cuenta[e] + ' ' + e.toLowerCase() + (cuenta[e] > 1 ? 's' : ''), KIND[e]) : null; })),
        tabla([
          ['Persona', function (p) { return h('div', null, h('strong', null, p.Title), h('small', { class: 'muted block' }, p.NumDoc || '')); }],
          ['Tipo', function (p) { return p.Tipo; }],
          ['Vigencia', function (p) { return U.fDateTime(p.Desde) + ' → ' + U.fDateTime(p.Hasta); }],
          ['Autoriza', function (p) { return p.AutorizadoPor || ''; }],
          ['Detalle', function (p) { return p.Detalle || ''; }],
          ['Registro', function (p) { return h('small', { class: 'muted' }, (p._created ? U.fDateTime(p._created) : '') + (p._createdBy ? ' · ' + p._createdBy : '')); }],
          ['Estado', function (p) { var e = estadoDe(p); return h('div', null, AP.pill(e, KIND[e]), e === 'Anulado' && p.MotivoAnulacion ? h('small', { class: 'block muted' }, p.MotivoAnulacion) : null); }],
          ['', function (p) { return p.Estado !== 'Anulado' && new Date(p.Hasta).getTime() >= Date.now() ? h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { anular(p); } }, 'Anular') : null; }]
        ], l));
    }
    async function consultar() {
      ahora = Date.now();
      tbox.replaceChildren(AP.spinner('Consultando…'));
      try {
        if (tab === 'vigentes') {
          var todos = await AP.B.listRange('AP_Permisos', 'Hasta', U.addDays(new Date(), -1), null);
          base = todos.filter(function (p) { return p.Estado !== 'Anulado' && new Date(p.Hasta).getTime() >= ahora; });
        } else {
          var a = U.fromLocal(desde.value, '00:00'), b = U.fromLocal(hasta.value, '23:59');
          if (!a || !b || b < a) { tbox.replaceChildren(); return AP.toast('Revise el rango de fechas.', 'warn'); }
          if ((b - a) / 86400000 > 400) { tbox.replaceChildren(); return AP.toast('Consulte máximo 400 días por vez.', 'warn'); }
          // Permisos cuya vigencia toca el rango: terminan después del inicio y empiezan antes del fin
          var l = await AP.B.listRange('AP_Permisos', 'Hasta', a, U.addDays(new Date(), 400));
          base = l.filter(function (p) { return new Date(p.Desde).getTime() <= b.getTime() + 59999; });
        }
        base.sort(function (x, y) { return x.Desde < y.Desde ? 1 : -1; });
        pintarP();
      } catch (e) { tbox.replaceChildren(errBox(e)); }
    }
    content.replaceChildren(tabs, filaFechas,
      h('div', { class: 'filters' }, fTipo, fEst, qp, AP.btnExcel(function () {
        var l = filtrados();
        if (!l.length) return AP.toast('No hay permisos con el filtro actual.', 'warn');
        AP.exportar('Permisos', COLS, l, 'xlsx', [['Vista', tab === 'vigentes' ? 'Vigentes y programados' : 'Registro de permisos otorgados (' + desde.value + ' a ' + hasta.value + ')'],
          ['Filtros', [fTipo.value, fEst.value, qp.value].filter(Boolean).join(' · ') || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
      })), tbox);
    consultar();
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
        var base = tab === 'sin' ? sin : nov;
        var chips = h('div', { class: 'chips' }, [['sin', 'Sin verificar (' + sin.length + ')'], ['todas', 'Últimos 14 días (' + nov.length + ')']].map(function (t) {
          return h('a', { class: 'chip ' + (t[0] === tab ? 'on' : ''), href: '#/consola/novedades?t=' + t[0] }, t[1]);
        }));
        var verTxt = function (m) { var v = ver.get(m.IdLocal); return v ? v.Resultado + (v.Nota ? ': ' + v.Nota : '') : 'Sin verificar'; };
        var tbox = h('div');
        var qn = AP.buscador('Buscar persona, documento, novedad, vigilante o resultado', pintarN);
        var filtradas = function () { return base.filter(function (m) { return AP.coincide(m, qn.value, ['Title', 'NumDoc', 'Categoria', 'Area', 'Novedad', 'Vigilante', 'AutorizadoPor', verTxt]); }); };
        content.replaceChildren(
          h('div', { class: 'banner info' }, AP.icon('shield', 18), h('span', null, 'Aquí llegan las llegadas tardías, ingresos pendientes o denegados por horario, salidas no autorizadas, salidas sin lectura de QR y excepciones. Su verificación queda registrada con su nombre y no modifica el registro original.')),
          chips,
          h('div', { class: 'filters' }, qn, AP.btnExcel(function () {
            var l = filtradas();
            if (!l.length) return AP.toast('No hay novedades con el filtro actual.', 'warn');
            AP.exportar('Novedades', [
              ['Fecha', function (m) { return U.toDate(m.FechaHora); }, 17], ['Persona', function (m) { return m.Title; }, 30], ['Documento', function (m) { return m.NumDoc; }, 15],
              ['Categoría', function (m) { return m.Categoria; }, 18], ['Movimiento', function (m) { return m.Resultado === 'Negado' ? 'Ingreso negado' : m.Sentido; }, 14],
              ['Novedad', function (m) { return m.Novedad || (m.Excepcion ? 'Excepción' : ''); }, 40], ['Turno programado', function (m) { return m.HorarioInfo; }, 24],
              ['Autorizado por', function (m) { return m.AutorizadoPor; }, 26], ['Motivo excepción / negación', function (m) { return m.MotivoExcepcion || m.MotivoNegacion; }, 40],
              ['Vigilante', function (m) { return m.Vigilante; }, 24], ['Verificación', verTxt, 40], ['Id. registro', function (m) { return m.IdLocal; }, 38]
            ], l, 'xlsx', [['Vista', tab === 'sin' ? 'Sin verificar' : 'Últimos 14 días'], ['Filtro', qn.value || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
          })),
          tbox);
        pintarN();
        function pintarN() { tbox.replaceChildren(tabla([
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
          ], filtradas())); }
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
      var p = await crearPermiso({ persona: { Title: m.Title, NumDoc: m.NumDoc, Token: m.Token }, personas: [{ Title: m.Title, NumDoc: m.NumDoc, Token: m.Token }], tipo: 'Ingreso tardío', desde: new Date(), hasta: new Date(Date.now() + 2 * 3600000), detalle: 'Ingreso verificado por el Director tras denegación por horario', autorizaYo: true });
      if (!p) return;
      try { await registrarVerificacion(m, 'Justificada', 'Se levantó la denegación mediante permiso de ingreso tardío vigente hasta ' + U.fTime(p.Hasta) + '.'); } catch (e) { AP.toast(e.message, 'error'); }
      AP.render();
    }
  });
  // =================== SOLICITUDES DE INGRESO (decide el Director) ===================
  // Llegadas tardías, ingresos fuera de turno y contratistas en día no programado: el vigilante no puede autorizarlos;
  // envía la solicitud y el Director la aprueba (se crea un permiso de corta duración) o la rechaza, con justificación.
  var TIPO_PERMISO = { 'Llegada tardía': 'Ingreso tardío', 'Fuera de turno': 'Ingreso y salida fuera de horario', 'Día no programado': 'Ingreso y salida fuera de horario' };
  function cargoDirector() { return (AP.Session.user.perfil && AP.Session.user.perfil.Cargo) || 'Director de Seguridad Integral'; }
  AP.solicitudesPendientes = function () { return (AP.Sync.solicitudes || []).filter(function (x) { return x.Estado === 'Pendiente'; }); };

  AP.route('/consola/solicitudes', function (qs) {
    if (!guard()) return;
    var tab = qs.t || 'pendientes';
    var content = h('div', { class: 'stack' }, AP.spinner('Cargando…'));
    AP.consolaShell('/consola/solicitudes', 'Solicitudes de ingreso', content);
    var datos = [];
    var qs2 = AP.buscador('Buscar persona, documento, empresa, novedad o vigilante', function () { pintarTabla(); });
    var tbox = h('div');
    var NOMBRES = { pendientes: 'Por decidir', hoy: 'Hoy', historial: 'Últimos 30 días' };
    var COLS = [
      ['Fecha de solicitud', function (x) { return U.toDate(x.FechaSolicitud); }, 17], ['Persona', function (x) { return x.Title; }, 30],
      ['Tipo doc.', function (x) { return x.TipoDoc; }, 8], ['Documento', function (x) { return x.NumDoc; }, 15], ['Tipo de persona', function (x) { return x.PersonaTipo; }, 18],
      ['Empresa', function (x) { return x.Empresa; }, 24], ['Cargo / área', function (x) { return [x.Cargo, x.Area].filter(Boolean).join(' · '); }, 24],
      ['Motivo de la solicitud', function (x) { return x.Tipo; }, 18], ['Novedad', function (x) { return x.Novedad; }, 28], ['Turno programado', function (x) { return x.HorarioInfo; }, 24],
      ['Lectura', function (x) { return x.Origen; }, 12], ['Portería', function (x) { return x.Porteria; }, 18], ['Solicitó (vigilante)', function (x) { return x.SolicitadoPorNombre || x.SolicitadoPor; }, 24],
      ['Decisión', function (x) { return x.Estado; }, 12], ['Decidió', function (x) { return x.DecididoPorNombre || x.DecididoPor; }, 24],
      ['Fecha de decisión', function (x) { return x.FechaDecision ? U.toDate(x.FechaDecision) : ''; }, 17], ['Autorizado hasta', function (x) { return x.VigenteHasta ? U.toDate(x.VigenteHasta) : ''; }, 17],
      ['Justificación', function (x) { return x.Justificacion; }, 40], ['Observaciones', function (x) { return x.Observaciones; }, 30]
    ];
    async function consultar() { return AP.B.listRange('AP_Solicitudes', 'FechaSolicitud', U.addDays(new Date(), tab === 'historial' ? -30 : -1), null); }
    async function cargar() {
      try { datos = await consultar(); actualizarSync(); pintar(); }
      catch (e) { content.replaceChildren(errBox(e)); }
    }
    function actualizarSync() {
      var desde = U.addDays(new Date(), -1).toISOString();
      AP.Sync.solicitudes = datos.filter(function (x) { return x.FechaSolicitud >= desde; });
      document.querySelectorAll('.nav-badge[data-k="sol"]').forEach(function (b) { b.textContent = AP.solicitudesPendientes().length || ''; });
    }
    var t = setInterval(async function () {
      if (document.querySelector('.modal-wrap')) return;
      try {
        var n = await consultar();
        var firma = function (l) { return l.map(function (x) { return x.id + x.Estado + x._etag; }).sort().join('|'); };
        if (firma(n) !== firma(datos) && !document.querySelector('.modal-wrap')) { datos = n; actualizarSync(); pintar(); }
      } catch (e) { /* se reintenta */ }
    }, 20000);
    AP.onLeave(function () { clearInterval(t); });

    function grupo() {
      var hoy = U.ymd();
      var l = tab === 'pendientes' ? datos.filter(function (x) { return x.Estado === 'Pendiente'; })
        : tab === 'hoy' ? datos.filter(function (x) { return U.ymd(x.FechaSolicitud) === hoy; }) : datos.slice();
      return l.sort(function (a, b) { return a.FechaSolicitud < b.FechaSolicitud ? (tab === 'pendientes' ? -1 : 1) : (tab === 'pendientes' ? 1 : -1); });
    }
    function filtradas() { return grupo().filter(function (x) { return AP.coincide(x, qs2.value, ['Title', 'NumDoc', 'Empresa', 'PersonaTipo', 'Tipo', 'Novedad', 'SolicitadoPorNombre', 'Estado', 'Justificacion']); }); }
    function pintar() {
      var pend = datos.filter(function (x) { return x.Estado === 'Pendiente'; }).length;
      var tabs = h('div', { class: 'tabs' }, [['pendientes', 'Por decidir (' + pend + ')'], ['hoy', 'Hoy'], ['historial', 'Últimos 30 días']].map(function (x) {
        return h('a', { class: x[0] === tab ? 'on' : '', href: '#/consola/solicitudes?t=' + x[0] }, x[1]);
      }));
      content.replaceChildren(
        h('div', { class: 'banner info' }, AP.icon('shield', 18), h('span', null, 'Aquí llegan, desde portería, las llegadas tardías (desde ' + AP.Horario.cfg().minutosPendiente + ' minutos), los ingresos fuera de turno y los contratistas que llegan en un día que no se les programó. ' +
          'El vigilante no puede autorizarlos: espera su decisión. Al aprobar se registra un permiso a su nombre; al rechazar, el vigilante registra el ingreso negado con su justificación.')),
        tabs,
        h('div', { class: 'filters' }, qs2, AP.btnExcel(function () {
          var l = filtradas();
          if (!l.length) return AP.toast('No hay solicitudes con el filtro actual.', 'warn');
          AP.exportar('Solicitudes_ingreso', COLS, l, 'xlsx', [['Vista', NOMBRES[tab]], ['Filtro', qs2.value || 'ninguno'], ['Generado por', AP.Session.user.nombre], ['Fecha', U.fDateTime(new Date())]]);
        })),
        tbox);
      pintarTabla();
    }
    function pintarTabla() {
      tbox.replaceChildren(tabla([
        ['Solicitud', function (x) { return h('div', null, U.fDateTime(x.FechaSolicitud), h('small', { class: 'block muted' }, 'Registró: ' + (x.SolicitadoPorNombre || x.SolicitadoPor || '—'))); }],
        ['Persona', function (x) { return h('div', null, h('strong', null, x.Title), h('small', { class: 'block muted' }, [(x.TipoDoc || '') + ' ' + (x.NumDoc || ''), x.PersonaTipo, x.Empresa].filter(function (z) { return String(z || '').trim(); }).join(' · '))); }],
        ['Motivo', function (x) { return h('div', null, AP.pill(x.Tipo || 'Solicitud', 'warn'), h('small', { class: 'block' }, x.Novedad || ''), x.HorarioInfo ? h('small', { class: 'block muted' }, 'Turno: ' + x.HorarioInfo) : null); }],
        ['Decisión', function (x) {
          return h('div', null, AP.estadoPill(x.Estado), x.DecididoPorNombre ? h('small', { class: 'block muted' }, x.DecididoPorNombre + ' · ' + U.fDateTime(x.FechaDecision)) : null,
            x.Estado === 'Aprobada' && x.VigenteHasta ? h('small', { class: 'block muted' }, 'Hasta ' + U.fDateTime(x.VigenteHasta)) : null);
        }],
        ['', function (x) {
          return x.Estado !== 'Pendiente' ? h('button', { class: 'btn small', type: 'button', onclick: function () { detalle(x); } }, 'Ver')
            : h('div', { class: 'row gap nowrap' },
              h('button', { class: 'btn small primary', type: 'button', onclick: function () { decidir(x, true); } }, AP.icon('check', 16), 'Aprobar'),
              h('button', { class: 'btn small danger-outline', type: 'button', onclick: function () { decidir(x, false); } }, 'Rechazar'));
        }]
      ], filtradas()));
    }
    function kv(k, v) { return v ? h('div', { class: 'kv' }, h('span', null, k), h('strong', null, v)) : null; }
    function resumen(x) {
      return h('div', { class: 'card stack sm' },
        kv('Persona', x.Title), kv('Documento', ((x.TipoDoc || '') + ' ' + (x.NumDoc || '')).trim()), kv('Tipo / empresa', [x.PersonaTipo, x.Empresa].filter(Boolean).join(' · ')),
        kv('Cargo / área', [x.Cargo, x.Area].filter(Boolean).join(' · ')), kv('Motivo', x.Tipo), kv('Novedad', x.Novedad), kv('Turno programado', x.HorarioInfo || (x.Tipo === 'Día no programado' ? 'Sin turno programado hoy' : '')),
        kv('Lectura', x.Origen), kv('Solicitud', U.fDateTime(x.FechaSolicitud) + ' · ' + (x.Porteria || '') + ' · registró ' + (x.SolicitadoPorNombre || x.SolicitadoPor || '—')),
        x.Estado !== 'Pendiente' ? kv('Decisión', x.Estado + ' · ' + (x.DecididoPorNombre || '') + ' · ' + U.fDateTime(x.FechaDecision)) : null,
        x.Justificacion ? kv('Justificación', x.Justificacion) : null, x.Observaciones ? kv('Observaciones', x.Observaciones) : null);
    }
    function detalle(x) { AP.modal({ title: 'Solicitud de ingreso — ' + x.Title, size: 'wide', body: resumen(x) }); }

    function decidir(x, si) {
      AP.modal({
        title: 'Solicitud de ingreso — ' + x.Title, size: 'wide',
        body: function (close) {
          var ant = h('p', { class: 'muted small' }, 'Consultando antecedentes…');
          AP.B.listRange('AP_Solicitudes', 'FechaSolicitud', U.addDays(new Date(), -30), null).then(function (l) {
            var mias = l.filter(function (z) { return z.Token === x.Token && z.id !== x.id; });
            var rech = mias.filter(function (z) { return z.Estado === 'Rechazada'; }).length;
            ant.textContent = mias.length ? 'En los últimos 30 días esta persona tuvo ' + mias.length + ' solicitud(es) más' + (rech ? ' (' + rech + ' rechazada(s))' : '') + '.' : 'Sin otras solicitudes en los últimos 30 días.';
          }).catch(function () { ant.textContent = ''; });
          var dec = AP.segmented('Decision', [{ value: 'Aprobada', label: 'Aprobar', icon: 'check', cls: 'in' }, { value: 'Rechazada', label: 'Rechazar', icon: 'x', cls: 'deny' }], si ? 'Aprobada' : 'Rechazada', function () { pintarDec(); });
          var tarde = x.Tipo === 'Llegada tardía';
          var ahora = new Date();
          var def = tarde ? new Date(ahora.getTime() + 60 * 60000) : (function () { var b = U.fromLocal(U.ymd(ahora), '18:00'); return b.getTime() - ahora.getTime() < 2 * 3600000 ? new Date(ahora.getTime() + 8 * 3600000) : b; })();
          var hasta = AP.input('hasta', U.toLocalInput(def), { type: 'datetime-local' });
          var just = AP.textarea('Justificacion', '', { rows: 3 });
          var vigBox = h('div', { class: 'stack sm' },
            AP.field(tarde ? 'El vigilante puede registrar el ingreso hasta *' : 'Autorizado a ingresar y salir hasta *', hasta,
              tarde ? 'Se registra un permiso de «Ingreso tardío». La salida se rige por su turno.' : 'Se registra un permiso de «Ingreso y salida fuera de horario» hasta esa hora.'),
            h('div', { class: 'presets' }, [['1 hora', 60], ['4 horas', 240], ['Hasta las 18:00', '18:00'], ['Hasta las 23:59', '23:59']].map(function (pr) {
              return h('button', { class: 'btn small', type: 'button', onclick: function () {
                var b = typeof pr[1] === 'number' ? new Date(Date.now() + pr[1] * 60000) : U.fromLocal(U.ymd(), pr[1]);
                if (b <= new Date()) return AP.toast('Esa hora ya pasó.', 'warn');
                hasta.value = U.toLocalInput(b);
              } }, pr[0]);
            })));
          var btn = h('button', { class: 'btn primary', type: 'button' });
          function aprobando() { return dec.dataset.value === 'Aprobada'; }
          function pintarDec() {
            vigBox.style.display = aprobando() ? '' : 'none';
            just.placeholder = aprobando() ? 'Por qué se autoriza (quién lo solicitó, necesidad del servicio, condiciones)' : 'Motivo del rechazo (el vigilante lo ve y lo anota en el ingreso negado)';
            btn.className = 'btn ' + (aprobando() ? 'primary' : 'danger');
            btn.replaceChildren(AP.icon(aprobando() ? 'check' : 'x', 18), aprobando() ? 'Aprobar ingreso' : 'Rechazar ingreso');
          }
          pintarDec();
          var enviando = false;
          btn.onclick = async function () {
            if (enviando) return;
            var j = just.value.trim();
            if (j.length < 6) return AP.toast('Escriba la justificación de la decisión.', 'warn');
            if (RE_SALUD.test(j)) return AP.toast('La justificación parece contener información de salud (dato sensible, art. 5 Ley 1581 de 2012). Escriba solo el hecho general, sin diagnóstico.', 'warn', 9000);
            var ap = aprobando();
            var b = U.fromLocalInput(hasta.value);
            if (ap && (!b || b <= new Date())) return AP.toast('Revise hasta cuándo se autoriza: la hora ya pasó.', 'warn');
            enviando = true; btn.disabled = true;
            var yo = AP.Session.user;
            var cambios = { Estado: ap ? 'Aprobada' : 'Rechazada', DecididoPor: yo.upn, DecididoPorNombre: yo.nombre, FechaDecision: new Date().toISOString(), Justificacion: j };
            try {
              if (ap) {
                var desde = new Date(Math.min(new Date(x.FechaSolicitud).getTime(), Date.now()) - 5 * 60000);
                var perm = await AP.B.create('AP_Permisos', {
                  Title: x.Title, Token: x.Token, NumDoc: x.NumDoc, Tipo: TIPO_PERMISO[x.Tipo] || 'Ingreso tardío', Desde: desde.toISOString(), Hasta: b.toISOString(), Estado: 'Vigente',
                  Detalle: 'Aprobación de solicitud de portería (' + (x.Novedad || x.Tipo) + '). ' + j,
                  AutorizadoPor: yo.nombre + ' — ' + cargoDirector(), AutorizadoPorDoc: (yo.perfil && yo.perfil.NumDoc) || '', AutorizadoPorCargo: cargoDirector(), SolicitudId: x.id
                });
                cambios.PermisoId = perm.id; cambios.VigenteHasta = b.toISOString();
              }
              await AP.B.update('AP_Solicitudes', x.id, cambios);
              Object.assign(x, cambios);
              await AP.Audit.log(ap ? 'Aprobación de solicitud de ingreso' : 'Rechazo de solicitud de ingreso', x.Title + ' (' + (x.NumDoc || '') + ') — ' + (x.Novedad || x.Tipo),
                (ap ? 'Autorizado hasta ' + U.fDateTime(b) + '. ' : '') + 'Justificación: ' + j);
              close();
              AP.toast(ap ? 'Ingreso aprobado. El vigilante lo ve en portería y registra el ingreso.' : 'Ingreso rechazado. El vigilante lo ve en portería y registra el ingreso negado.', 'info', 6000);
              actualizarSync(); pintar(); AP.Sync.run();
            } catch (e) { AP.toast('No se pudo guardar la decisión: ' + e.message, 'error', 8000); enviando = false; btn.disabled = false; }
          };
          return h('div', { class: 'stack' }, resumen(x), ant, dec, vigBox, AP.field('Justificación *', just),
            h('div', { class: 'row gap wrap end' }, h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cerrar'), btn));
        }
      });
    }
    cargar();
  });
})();
