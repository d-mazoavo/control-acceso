/* Celular de portería: inicio de turno con usuario y PIN, PIN personal, cierre de turno y desvinculación */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  // =================== INICIO DE TURNO ===================
  AP.Views.pin = function () {
    var P = AP.Pin;
    var usuario = AP.input('usuario', '', { autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off', enterkeyhint: 'next' });
    var pin = AP.input('pin', '', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '8', autocomplete: 'off', enterkeyhint: 'go' });
    var msg = h('p', { class: 'pin-msg', role: 'alert' });
    var btn = h('button', { class: 'btn primary big', type: 'submit' }, AP.icon('door', 22), 'Iniciar turno');
    var sinDatos = !AP.Sync.vigilantes.length;
    var estado = h('div', { class: 'pin-estado' });
    function pintarEstado() {
      var s = AP.Sync.state, n = AP.Sync.pendingCount();
      estado.replaceChildren();
      AP.add(estado,
        h('span', null, s.syncing ? 'Actualizando…' : 'Datos: ' + (s.lastPull ? 'actualizados ' + U.rel(s.lastPull) : 'sin descargar') + (s.online ? '' : ' · sin conexión')),
        n ? h('span', null, ' · ' + n + ' registro(s) por enviar') : null,
        h('button', { class: 'linkish', type: 'button', onclick: function () { AP.Sync.run().then(function () { if (sinDatos && AP.Sync.vigilantes.length) AP.render(); }); } }, AP.icon('sync', 14), ' Actualizar'));
    }
    pintarEstado();
    AP.onLeave(AP.Sync.on(pintarEstado));

    var form = h('form', { class: 'stack', autocomplete: 'off', onsubmit: async function (e) {
      e.preventDefault();
      msg.textContent = ''; msg.className = 'pin-msg';
      btn.disabled = true; btn.lastChild.textContent = 'Verificando…';
      try {
        var r = await P.ingresar(usuario.value, pin.value);
        if (r.error) { msg.textContent = r.error; msg.className = 'pin-msg error'; pin.value = ''; pin.focus(); return; }
        var actual = pin.value; pin.value = '';
        if (r.cred.temporal) {
          var ok = await AP.Views.definirPin(r.v, { temporal: true, actual: actual });
          if (!ok) { msg.textContent = 'Debe definir su PIN personal para iniciar el turno.'; msg.className = 'pin-msg error'; return; }
        }
        await P.iniciarTurno(r.v);
        AP.toast('Turno iniciado. ' + r.v.Title + ', sus registros quedan a su nombre.', 'info', 4500);
        location.hash = '#/porteria'; AP.render();
      } catch (err) {
        msg.textContent = err.message; msg.className = 'pin-msg error';
      } finally { btn.disabled = false; btn.lastChild.textContent = 'Iniciar turno'; }
    } },
      AP.field('Usuario', usuario),
      AP.field('PIN', pin),
      msg, btn);

    var demo = AP.CFG.modo === 'demo';
    var box = h('div', { class: 'login' },
      h('div', { class: 'login-card' },
        h('img', { class: 'login-logo', src: 'img/logo.png', alt: 'Avo Pak' }),
        h('h1', null, 'Inicio de turno'),
        h('p', { class: 'muted' }, AP.CFG.porteria + ' · celular ' + U.deviceId()),
        sinDatos ? h('p', { class: 'banner warn' }, AP.icon('offline', 18), h('span', null, 'Este celular aún no tiene los usuarios de portería. Conéctelo a internet y pulse Actualizar.')) : null,
        demo ? h('div', { class: 'note small' },
          h('strong', null, 'Usuarios de demostración: '), 'vigilante1 / PIN 482915 · supervisor1 / PIN 730264 · nuevo1 / PIN temporal 615283 (pedirá definir un PIN personal). Con horario programado: Juan Pablo Osorio (salida con permiso), Diana Muñoz (salida NO autorizada), Paula Giraldo (ingreso pendiente), Camilo Hernández (ingreso denegado); Laura Ríos no tiene horario.') : null,
        form, estado,
        h('div', { class: 'row gap wrap center' },
          h('button', { class: 'linkish small', type: 'button', onclick: AP.Views.desvincular }, AP.icon('logout', 14), ' Desvincular este celular'),
          demo ? h('button', { class: 'linkish small', type: 'button', onclick: function () { AP.Demo.logout(); } }, 'Salir de la demostración') : null)),
      h('p', { class: 'login-foot' }, AP.CFG.empresa + ' · v' + AP.VERSION));
    AP.mount(box, 'is-login');
    setTimeout(function () { try { usuario.focus(); } catch (e) { /* ignorar */ } }, 50);
  };

  // =================== PIN PERSONAL ===================
  // Devuelve una promesa: true si el vigilante definió su PIN, false si canceló.
  AP.Views.definirPin = function (v, opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var hecho = false;
      AP.modal({
        title: opt.temporal ? 'Defina su PIN personal' : 'Cambiar mi PIN',
        persistent: true,
        onClose: function () { resolve(hecho); },
        body: function (close) {
          var actual = AP.input('actual', '', { type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'off' });
          var n1 = AP.input('n1', '', { type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'off' });
          var n2 = AP.input('n2', '', { type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'off' });
          var acepta = AP.check('acepta', 'He leído y acepto. Mi PIN es personal e intransferible.', false);
          var err = h('p', { class: 'pin-msg', role: 'alert' });
          var guardar = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
            err.textContent = ''; err.className = 'pin-msg';
            var fallo = function (t) { err.textContent = t; err.className = 'pin-msg error'; };
            guardar.disabled = true;
            try {
              if (!opt.temporal) {
                if (!(await AP.Pin.verificar(v, actual.value))) return fallo('El PIN actual no es correcto.');
              }
              var regla = AP.Pin.regla(n1.value, v);
              if (regla) return fallo(regla);
              if (n1.value !== n2.value) return fallo('La confirmación no coincide con el nuevo PIN.');
              if (n1.value === (opt.temporal ? opt.actual : actual.value)) return fallo('El nuevo PIN debe ser distinto del anterior.');
              if (!acepta.querySelector('input').checked) return fallo('Debe aceptar las condiciones de uso del PIN.');
              await AP.Pin.definirPin(v, n1.value, true);
              hecho = true;
              AP.toast('PIN personal registrado.', 'info');
              close();
            } catch (e) { fallo(e.message); }
            finally { guardar.disabled = false; }
          } }, AP.icon('lock', 18), 'Guardar PIN');
          return h('div', { class: 'stack' },
            opt.temporal ? h('p', null, h('strong', null, v.Title), ' — su PIN actual es temporal. Defina ahora un PIN que solo usted conozca; ni siquiera el administrador podrá verlo.') : null,
            !opt.temporal ? AP.field('PIN actual', actual) : null,
            AP.field('Nuevo PIN (6 a 8 dígitos)', n1, 'Evite fechas de nacimiento, secuencias o números de su documento.'),
            AP.field('Confirme el nuevo PIN', n2),
            h('div', { class: 'aviso-box small' }, AP.TX.avisoVigilante ? AP.TX.avisoVigilante(AP.CFG) : ''),
            acepta, err,
            h('div', { class: 'row gap wrap end' },
              h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'), guardar));
        }
      });
    });
  };

  // =================== CIERRE DE TURNO ===================
  AP.Views.cerrarTurno = async function () {
    var t = AP.Session.turno;
    if (!t) { AP.render(); return; }
    var r = AP.Pin.resumenTurno(t);
    var ok = await new Promise(function (res) {
      AP.modal({
        title: 'Cerrar turno',
        onClose: function (v) { res(v === true); },
        body: h('div', { class: 'stack' },
          h('div', { class: 'kv' }, h('span', null, 'Vigilante'), h('strong', null, t.nombre + ' (' + t.usuario + ')')),
          h('div', { class: 'kv' }, h('span', null, 'Inicio'), h('strong', null, U.fDateTime(t.inicio) + ' · ' + U.duracion(t.inicio))),
          h('div', { class: 'kv' }, h('span', null, 'Registros del turno'), h('strong', null, String(r.registros))),
          r.pendientes ? h('p', { class: 'banner warn' }, AP.icon('sync', 18), h('span', null, r.pendientes + ' registro(s) aún no se han enviado. Quedan guardados en el celular y se enviarán solos cuando haya internet; no borre los datos del navegador.')) : null,
          h('p', { class: 'muted' }, 'Al cerrar, el celular vuelve a la pantalla de inicio de turno y el siguiente vigilante debe ingresar con su propio usuario y PIN.')),
        actions: [{ label: 'Cancelar', value: false }, { label: 'Cerrar turno', kind: 'primary', icon: 'logout', value: true }]
      });
    });
    if (!ok) return;
    await AP.Pin.cerrarTurno('Fin de turno');
    AP.toast('Turno cerrado.', 'info');
    location.hash = '#/'; AP.render();
  };

  // =================== DESVINCULAR EL CELULAR ===================
  // Cierra la sesión de la cuenta de servicio de Microsoft 365. Exige usuario y PIN de un supervisor activo,
  // porque después solo quien conozca la contraseña de la cuenta de servicio puede volver a vincular el celular.
  AP.Views.desvincular = function () {
    AP.modal({
      title: 'Desvincular este celular',
      body: function (close) {
        var u = AP.input('u', '', { autocapitalize: 'none', autocomplete: 'off' });
        var p = AP.input('p', '', { type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'off' });
        var err = h('p', { class: 'pin-msg', role: 'alert' });
        var n = AP.Sync.pendingCount();
        return h('div', { class: 'stack' },
          h('p', null, 'El celular dejará de operar como portería hasta que el Director de Seguridad Integral, o quien tenga la contraseña de la cuenta de servicio, lo vincule de nuevo.'),
          n ? h('p', { class: 'banner deny' }, AP.icon('alert', 18), h('span', null, 'Hay ' + n + ' registro(s) sin enviar. Conecte el celular a internet antes de desvincularlo.')) : null,
          AP.field('Usuario del supervisor', u), AP.field('PIN del supervisor', p), err,
          h('div', { class: 'row gap wrap end' },
            h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'),
            h('button', { class: 'btn danger', type: 'button', onclick: async function (ev) {
              var b = ev.currentTarget;
              if (b.dataset.forzar === '1') { close(); AP.B.logout(); return; }
              err.className = 'pin-msg error';
              var r = await AP.Pin.ingresar(u.value, p.value);
              if (r.error) { err.textContent = r.error; return; }
              if (r.v.Rol !== 'Supervisor') { err.textContent = 'Solo un usuario con rol Supervisor puede desvincular el celular.'; return; }
              await AP.Pin.evento('Desvinculación del celular', { id: '', vigilanteId: String(r.v.id), usuario: r.v.Usuario, nombre: r.v.Title, rol: r.v.Rol });
              err.className = 'pin-msg'; err.textContent = 'Enviando registros…';
              await Promise.race([AP.Sync.run(), U.sleep(8000)]);
              var quedan = AP.Sync.pendingCount();
              if (quedan) {
                err.className = 'pin-msg error';
                err.textContent = 'Quedan ' + quedan + ' registro(s) sin enviar. Se conservan en este celular y se enviarán cuando vuelva a vincularse. Si debe continuar, pulse de nuevo.';
                b.dataset.forzar = '1'; b.lastChild.textContent = 'Desvincular de todos modos';
                return;
              }
              close(); AP.B.logout();
            } }, AP.icon('logout', 18), 'Desvincular')));
      }
    });
  };
})();
