/* Inspección de vehículos de carga, contenedores y precintos */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  AP.route('/carga', function () {
    var fotos = []; // {name, label, blob, url, sha256}
    var I = AP.input;
    var op = AP.select('Operacion', AP.CAT.operacionesCarga, AP.CAT.operacionesCarga[0]);
    var placa = I('Placa', '', { autocapitalize: 'characters', maxlength: 10, placeholder: 'Placa del cabezote' });
    var remolque = I('Remolque', '', { autocapitalize: 'characters', maxlength: 12, placeholder: 'Placa del remolque' });
    var contenedor = I('Contenedor', '', { autocapitalize: 'characters', maxlength: 15, placeholder: 'Ej.: MSKU1234567' });
    var transp = I('Transportadora', '', {});
    var cond = I('Conductor', '', { autocapitalize: 'words' });
    var docCond = I('DocConductor', '', { inputmode: 'numeric' });
    var condInfo = h('div');
    var testigo = I('Testigo', '', { placeholder: 'Nombre de quien presencia la inspección' });
    var obs = AP.textarea('Observaciones', '', { rows: 3 });
    var regMov = AP.check('regMov', 'Registrar también el ingreso o salida del conductor', true);
    var conductorRec = null;

    docCond.addEventListener('input', U.debounce(function () {
      condInfo.replaceChildren(); conductorRec = null;
      var d = U.normDoc(docCond.value); if (d.length < 5) return;
      var p = AP.Sync.personas.find(function (x) { return U.normDoc(x.NumDoc) === d; });
      if (!p) { condInfo.appendChild(h('p', { class: 'note' }, 'El conductor no figura como habilitado. Verifique con Logística y la Dirección de Seguridad Integral.')); return; }
      conductorRec = p;
      var ev = AP.Access.evaluate(p.Token);
      if (!cond.value) cond.value = p.Title;
      if (!transp.value) transp.value = p.Empresa || '';
      condInfo.appendChild(h('div', { class: 'banner ' + (ev.nivel === 'ok' ? 'info' : 'deny') }, AP.icon(ev.nivel === 'ok' ? 'check' : 'alert', 18), h('span', null, p.Title + ': ' + ev.etiqueta + (ev.detalle ? ' — ' + ev.detalle : ''))));
    }, 300));

    // ---- Lista de verificación ----
    var estado = {};
    var notas = {};
    var rows = AP.CAT.puntos17.map(function (pt) {
      var id = pt[0];
      var nota = I('nota_' + id, '', { placeholder: 'Describa el hallazgo', class: 'hidden' });
      var seg = AP.segmented(id, [{ value: 'C', label: 'C', cls: 'in' }, { value: 'NC', label: 'NC', cls: 'deny' }, { value: 'NA', label: 'N/A' }], '', function (v) {
        estado[id] = v; nota.classList.toggle('hidden', v !== 'NC'); resumen();
      });
      notas[id] = nota;
      return h('div', { class: 'chk-row' }, h('span', { class: 'chk-n' }, id.slice(1)), h('span', { class: 'chk-l' }, pt[1]), seg, nota);
    });
    var todos = h('button', { class: 'btn small', type: 'button', onclick: function () {
      AP.CAT.puntos17.forEach(function (pt) {
        if (estado[pt[0]]) return;
        estado[pt[0]] = 'C';
        var b = document.querySelector('.segmented[data-name="' + pt[0] + '"] button[data-v="C"]'); if (b) b.click();
      });
      resumen();
    } }, 'Marcar pendientes como conformes');

    // ---- Precintos ----
    var precBox = h('div', { class: 'stack sm' });
    var precintos = [];
    function addPrecinto() {
      if (precintos.length >= 4) return;
      var n = I('precinto', '', { autocapitalize: 'characters', placeholder: 'Número del precinto', maxlength: 30 });
      var chk = ['ver', 'verificar', 'halar', 'girar'].map(function (k, i) {
        return AP.check(k, ['Ver (sello y mecanismo)', 'Verificar número contra documentos', 'Halar', 'Girar'][i], false);
      });
      var p = { num: n, chk: chk };
      precintos.push(p);
      var foto = h('button', { class: 'btn small', type: 'button', onclick: function () { tomarFoto('Precinto ' + (precintos.indexOf(p) + 1)); } }, AP.icon('camera', 16), 'Foto del precinto');
      precBox.appendChild(h('div', { class: 'card stack sm' }, h('strong', null, 'Precinto ' + precintos.length), n, h('div', { class: 'vvtt' }, chk), foto));
      chk.forEach(function (c) { c.querySelector('input').addEventListener('change', resumen); });
      n.addEventListener('input', resumen);
    }

    // ---- Fotos ----
    var galeria = h('div', { class: 'gallery' });
    async function tomarFoto(label) {
      var file = await AP.pickImage('environment');
      if (!file) return;
      try {
        var r = await U.fotoEvidencia(file);
        var sha = await U.sha256(r.blob);
        var name = String(fotos.length + 1).padStart(2, '0') + '_' + U.safeName(label) + '.jpg';
        var f = { name: name, label: label, blob: r.blob, url: URL.createObjectURL(r.blob), sha256: sha };
        fotos.push(f);
        pintarFotos(); resumen();
      } catch (e) { AP.toast(e.message, 'error'); }
    }
    function pintarFotos() {
      galeria.replaceChildren();
      fotos.forEach(function (f, i) {
        galeria.appendChild(h('figure', null, h('img', { src: f.url, alt: f.label }), h('figcaption', null, f.label),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Quitar foto', onclick: function () { URL.revokeObjectURL(f.url); fotos.splice(i, 1); pintarFotos(); resumen(); } }, AP.icon('x', 16))));
      });
    }
    var fotoBtns = h('div', { class: 'row gap wrap' }, ['Vehículo (frente y placa)', 'Remolque / contenedor', 'Puertas y cierre', 'Hallazgo'].map(function (l) {
      return h('button', { class: 'btn small', type: 'button', onclick: function () { tomarFoto(l); } }, AP.icon('camera', 16), l);
    }));

    var res = h('div', { class: 'verdict muted' });
    function resultado() {
      var nc = AP.CAT.puntos17.filter(function (pt) { return estado[pt[0]] === 'NC'; });
      var faltan = AP.CAT.puntos17.filter(function (pt) { return !estado[pt[0]]; });
      var precMal = precintos.filter(function (p) {
        return p.num.value.trim() && p.chk.some(function (c) { return !c.querySelector('input').checked; });
      });
      return { nc: nc, faltan: faltan, precMal: precMal, conforme: !nc.length && !precMal.length };
    }
    function resumen() {
      var r = resultado();
      res.className = 'verdict ' + (r.faltan.length ? 'muted' : r.conforme ? 'ok' : 'deny');
      res.replaceChildren(AP.icon(r.faltan.length ? 'list' : r.conforme ? 'check' : 'alert', 32),
        h('div', null, h('strong', null, r.faltan.length ? 'Faltan ' + r.faltan.length + ' puntos por revisar' : r.conforme ? 'INSPECCIÓN CONFORME' : 'INSPECCIÓN NO CONFORME'),
          h('span', null, r.nc.length + ' no conformidad(es) · ' + precintos.filter(function (p) { return p.num.value.trim(); }).length + ' precinto(s) · ' + fotos.length + ' foto(s)' +
            (r.precMal.length ? ' · verificación VVTT incompleta' : ''))));
    }

    var saving = false;
    async function guardar() {
      if (saving) return;
      var r = resultado();
      var pl = U.normPlaca(placa.value);
      if (!pl) return AP.toast('Escriba la placa del vehículo.', 'warn');
      if (cond.value.trim().length < 5) return AP.toast('Escriba el nombre del conductor.', 'warn');
      if (r.faltan.length) return AP.toast('Revise todos los puntos de inspección (faltan ' + r.faltan.length + ').', 'warn');
      var faltaNota = r.nc.find(function (pt) { return !notas[pt[0]].value.trim(); });
      if (faltaNota) return AP.toast('Describa el hallazgo del punto ' + faltaNota[1] + '.', 'warn');
      var salida = op.value.indexOf('Salida') === 0;
      var precs = precintos.filter(function (p) { return p.num.value.trim(); });
      if (salida && op.value.indexOf('carga') > 0 && !precs.length) return AP.toast('En salida con carga registre al menos un precinto.', 'warn');
      if (!fotos.length) return AP.toast('Tome al menos una fotografía del vehículo.', 'warn');
      if (!r.conforme && !(await AP.confirm('Inspección no conforme', 'Se registrará como NO CONFORME y se alertará a la Dirección de Seguridad Integral. Retenga el despacho hasta recibir instrucción. ¿Continuar?', 'Registrar', 'danger'))) return;
      saving = true;
      try {
        var u = AP.Session.operador();
        var id = U.uuid();
        var check = AP.CAT.puntos17.map(function (pt) { return { id: pt[0], punto: pt[1], estado: estado[pt[0]], nota: notas[pt[0]].value.trim() || undefined }; });
        var pv = precs.map(function (p) {
          var c = p.chk.map(function (x) { return x.querySelector('input').checked; });
          return { numero: p.num.value.trim().toUpperCase(), ver: c[0], verificar: c[1], halar: c[2], girar: c[3] };
        });
        var fields = {
          IdLocal: id, Title: op.value + ' — ' + pl, Operacion: op.value, Placa: pl, Remolque: U.normPlaca(remolque.value),
          Contenedor: contenedor.value.trim().toUpperCase(), Transportadora: transp.value.trim(), Conductor: cond.value.trim(),
          DocConductor: docCond.value.trim(), Checklist: JSON.stringify(check), Precintos: pv.map(function (p) { return p.numero; }).join(', '),
          PrecintosVerificacion: JSON.stringify(pv), Testigo: testigo.value.trim(), Resultado: r.conforme ? 'Conforme' : 'No conforme',
          NoConformidades: r.nc.map(function (pt) { return pt[1] + ': ' + notas[pt[0]].value.trim(); }).concat(r.precMal.length ? ['Verificación VVTT incompleta en precinto(s) ' + r.precMal.map(function (p) { return p.num.value.trim(); }).join(', ')] : []).join('\n'),
          FechaHora: new Date().toISOString(), Vigilante: u.nombre, VigilanteCorreo: u.upn, VigilanteUsuario: u.usuario, TurnoId: u.turnoId, Dispositivo: U.deviceId(),
          SinConexion: !AP.Sync.state.online, Porteria: AP.CFG.porteria, Observaciones: obs.value.trim()
        };
        var movId = null;
        if (regMov.querySelector('input').checked) {
          var p = conductorRec;
          var key = p && p.Token ? p.Token : (docCond.value ? 'DOC:' + U.normDoc(docCond.value) : null);
          var ult = key ? AP.Access.lastFor(key) : null;
          var sentido = salida ? 'Salida' : 'Ingreso';
          if (ult && ult.Sentido === sentido) sentido = sentido === 'Ingreso' ? 'Salida' : 'Ingreso';
          var ev = p ? AP.Access.evaluate(p.Token) : null;
          var mov = await AP.registrarMovimiento({
            Title: cond.value.trim(), Sentido: sentido, Resultado: 'Permitido', Categoria: 'Conductor / transportador',
            Origen: p ? 'Inspección de carga' : 'Manual — inspección de carga', Token: p ? p.Token : undefined,
            RefLista: p ? 'AP_Personas' : 'Manual', RefId: p ? p.id : undefined, TipoDoc: p ? p.TipoDoc : 'CC', NumDoc: docCond.value.trim(),
            Empresa: transp.value.trim(), Placa: pl, VehiculoTipo: 'Tractocamión', EstadoMostrado: ev ? ev.etiqueta : 'NO REGISTRADO',
            Excepcion: !!(ev && ev.nivel !== 'ok') || !p ? true : undefined,
            MotivoExcepcion: !p ? 'Conductor no registrado; ingreso ligado a inspección de carga' : ev && ev.nivel !== 'ok' ? ev.etiqueta : undefined,
            AutorizadoPor: !p || (ev && ev.nivel !== 'ok') ? 'Ver inspección ' + id.slice(0, 8) : undefined,
            InspeccionId: id, EntradaId: sentido === 'Salida' && ult ? ult.IdLocal : undefined
          });
          movId = mov.IdLocal;
        }
        if (movId) fields.MovimientoId = movId;
        fields.Hash = await U.hashRecord(fields);
        var photos = [];
        for (var i = 0; i < fotos.length; i++) {
          photos.push({ name: fotos[i].name, label: fotos[i].label, type: 'image/jpeg', data: await fotos[i].blob.arrayBuffer(), sha256: fotos[i].sha256 });
        }
        // La inspección se encola antes que el movimiento ya encolado no importa: ambos se envían en orden de creación.
        await AP.Sync.enqueue('insp', fields, photos);
        if (AP.Notif) AP.Notif.inspeccion(fields, r.conforme);
        U.beep(r.conforme ? 'ok' : 'deny');
        AP.toast(r.conforme ? 'Inspección registrada.' : 'Inspección NO CONFORME registrada. Informe al supervisor y al Director.', r.conforme ? '' : 'error', 6000);
        fotos.forEach(function (f) { URL.revokeObjectURL(f.url); });
        AP.go('/porteria');
      } catch (e) {
        AP.toast('No se pudo guardar la inspección: ' + e.message, 'error');
      } finally { saving = false; }
    }

    addPrecinto();
    var cont = h('div', { class: 'stack' },
      h('div', { class: 'card stack' }, h('h3', null, 'Vehículo y conductor'),
        AP.field('Operación', op),
        h('div', { class: 'grid2' }, AP.field('Placa vehículo', placa), AP.field('Placa remolque', remolque)),
        AP.field('Contenedor', contenedor),
        h('div', { class: 'grid2' }, AP.field('Documento del conductor', docCond), AP.field('Conductor', cond)),
        condInfo,
        AP.field('Empresa transportadora', transp),
        regMov),
      h('div', { class: 'card stack' }, h('div', { class: 'row between wrap gap' }, h('h3', null, 'Inspección de puntos'), todos),
        h('p', { class: 'help' }, 'C = conforme · NC = no conforme · N/A = no aplica. Para cada no conformidad describa el hallazgo y tome foto.'),
        h('div', { class: 'chk' }, rows)),
      h('div', { class: 'card stack' }, h('div', { class: 'row between wrap gap' }, h('h3', null, 'Precintos (ISO 17712)'),
        h('button', { class: 'btn small', type: 'button', onclick: addPrecinto }, AP.icon('plus', 16), 'Otro precinto')),
        h('p', { class: 'help' }, 'Verificación VVTT: ver el sello y el mecanismo de cierre, verificar el número contra los documentos, halar y girar el sello.'),
        precBox),
      h('div', { class: 'card stack' }, h('h3', null, 'Fotografías'), fotoBtns, galeria),
      h('div', { class: 'card stack' }, AP.field('Testigo', testigo), AP.field('Observaciones', obs)),
      res,
      h('div', { class: 'actions-sticky' }, h('button', { class: 'btn big block primary', type: 'button', onclick: guardar }, AP.icon('check', 22), 'Registrar inspección')));
    AP.porteriaShell('Vehículo de carga', cont, { back: '/porteria' });
    resumen();
    AP.onLeave(function () { fotos.forEach(function (f) { URL.revokeObjectURL(f.url); }); });
  });
})();
