/* Turno de vigilantes y supervisores, contraseña o PIN personal y cierre de turno */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U, h = AP.h;

  function tarjeta(titulo, sub, cuerpo) {
    return h('div', { class: 'login' },
      h('div', { class: 'login-card' },
        h('img', { class: 'login-logo', src: 'img/logo.png', alt: 'Avo Pak' }),
        h('h1', null, titulo), sub ? h('p', { class: 'muted' }, sub) : null, cuerpo),
      h('p', { class: 'login-foot' }, AP.CFG.empresa + ' · v' + AP.VERSION));
  }

  // =================== SIN TURNO ABIERTO ===================
  // Aparece cuando el turno se cerró (por tiempo máximo, por ejemplo) sin cerrar la sesión.
  AP.Views.pin = function () {
    var me = AP.Session.user;
    var btn = h('button', { class: 'btn primary big', type: 'button', onclick: async function () {
      btn.disabled = true;
      try {
        await AP.Pin.iniciarTurno();
        AP.toast('Turno iniciado. ' + me.nombre + ', sus registros quedan a su nombre.', 'info', 4500);
        location.hash = '#/porteria'; AP.render();
      } catch (e) { AP.toast(e.message, 'error'); btn.disabled = false; }
    } }, AP.icon('door', 22), 'Iniciar turno');
    AP.mount(tarjeta('Inicio de turno', AP.CFG.porteria,
      h('div', { class: 'stack' },
        h('div', { class: 'kv' }, h('span', null, 'Usuario'), h('strong', null, me.nombre + ' (' + me.usuario + ')')),
        h('div', { class: 'kv' }, h('span', null, 'Rol'), h('strong', null, AP.Session.rol)),
        AP.Sync.pendingCount() ? h('p', { class: 'banner warn' }, AP.icon('sync', 18), h('span', null, AP.Sync.pendingCount() + ' registro(s) por enviar desde este celular.')) : null,
        btn,
        h('button', { class: 'btn', type: 'button', onclick: AP.Views.logout }, AP.icon('logout', 18), 'Cerrar sesión'))), 'is-login');
  };

  // =================== CONTRASEÑA O PIN PERSONAL ===================
  function formClave(opt, alTerminar) {
    var me = AP.Session.user;
    var v = me.perfil || { Usuario: me.usuario };
    var pin = AP.Pin.usaPin(me.rol);
    var nombre = pin ? 'PIN' : 'contraseña';
    var attrs = pin ? { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '8', autocomplete: 'off' } : { type: 'password', autocomplete: 'new-password' };
    var actual = AP.input('actual', '', { type: 'password', autocomplete: 'off' });
    var n1 = AP.input('n1', '', attrs);
    var n2 = AP.input('n2', '', attrs);
    var acepta = AP.check('acepta', 'He leído y acepto. Mi ' + nombre + ' es personal e intransferible.', false);
    var err = h('p', { class: 'pin-msg', role: 'alert' });
    var guardar = h('button', { class: 'btn primary', type: 'button', onclick: async function () {
      err.textContent = ''; err.className = 'pin-msg';
      var fallo = function (t) { err.textContent = t; err.className = 'pin-msg error'; };
      if (!actual.value) return fallo(opt.temporal ? 'Escriba el PIN temporal que le entregaron.' : 'Escriba su ' + nombre + ' actual.');
      var regla = AP.Pin.reglaPara(me.rol, n1.value, v);
      if (regla) return fallo(regla);
      if (n1.value !== n2.value) return fallo('La confirmación no coincide.');
      if (n1.value === actual.value) return fallo('La nueva ' + (pin ? 'clave' : 'contraseña') + ' debe ser distinta de la anterior.');
      if (!acepta.querySelector('input').checked) return fallo('Debe aceptar las condiciones de uso.');
      if (!navigator.onLine) return fallo('Se requiere conexión a internet para cambiar el ' + nombre + '.');
      guardar.disabled = true;
      try {
        await AP.Pin.cambiarClave(actual.value, n1.value);
        AP.toast((pin ? 'PIN' : 'Contraseña') + ' personal registrado.', 'info');
        alTerminar(true);
      } catch (e) { fallo(e.message); }
      finally { guardar.disabled = false; }
    } }, AP.icon('lock', 18), 'Guardar');
    var cuerpo = h('div', { class: 'stack' },
      opt.temporal
        ? h('p', null, h('strong', null, me.nombre), ' — su ' + nombre + ' actual es temporal. Defina ahora ' + (pin ? 'un PIN' : 'una contraseña') + ' que solo usted conozca; ni siquiera el administrador podrá verlo.')
        : null,
      AP.field(opt.temporal ? 'PIN temporal que le entregaron' : (pin ? 'PIN actual' : 'Contraseña actual'), actual),
      AP.field(pin ? 'Nuevo PIN (6 a 8 dígitos)' : 'Nueva contraseña (mínimo 10 caracteres, letras y números)', n1,
        pin ? 'Evite fechas de nacimiento, secuencias o números de su documento.' : 'No use su usuario ni su número de documento.'),
      AP.field('Confirme', n2),
      h('div', { class: 'aviso-box small' }, AP.TX.avisoVigilante ? AP.TX.avisoVigilante(AP.CFG) : ''),
      acepta, err, guardar);
    return cuerpo;
  }

  // Primer ingreso o después de un restablecimiento: obligatorio antes de operar
  AP.Views.claveObligatoria = function () {
    var me = AP.Session.user;
    var pin = AP.Pin.usaPin(me.rol);
    AP.mount(tarjeta(pin ? 'Defina su PIN personal' : 'Defina su contraseña personal', null,
      h('div', { class: 'stack' },
        formClave({ temporal: true }, async function () {
          if (AP.Session.dispositivo && !AP.Session.turno) {
            await AP.Pin.iniciarTurno();
            AP.toast('Turno iniciado. ' + me.nombre + ', sus registros quedan a su nombre.', 'info', 4500);
          }
          location.hash = '#/'; AP.render();
        }),
        h('button', { class: 'linkish small', type: 'button', onclick: AP.Views.logout }, AP.icon('logout', 14), ' Cerrar sesión'))), 'is-login');
  };

  // Cambio voluntario desde "Mi turno" o desde la consola
  AP.Views.definirPin = function () {
    var pin = AP.Pin.usaPin(AP.Session.rol);
    return new Promise(function (resolve) {
      var hecho = false;
      AP.modal({
        title: pin ? 'Cambiar mi PIN' : 'Cambiar mi contraseña',
        onClose: function () { resolve(hecho); },
        body: function (close) {
          return h('div', { class: 'stack' }, formClave({ temporal: false }, function () { hecho = true; close(); }),
            h('button', { class: 'btn', type: 'button', onclick: function () { close(); } }, 'Cancelar'));
        }
      });
    });
  };

  // =================== CIERRE DE TURNO (y de sesión) ===================
  AP.Views.cerrarTurno = async function () {
    var t = AP.Session.turno;
    if (!t) { AP.render(); return; }
    var r = AP.Pin.resumenTurno(t);
    var ok = await new Promise(function (res) {
      AP.modal({
        title: 'Cerrar turno',
        onClose: function (v) { res(v === true); },
        body: h('div', { class: 'stack' },
          h('div', { class: 'kv' }, h('span', null, 'Usuario'), h('strong', null, t.nombre + ' (' + t.usuario + ')')),
          h('div', { class: 'kv' }, h('span', null, 'Inicio'), h('strong', null, U.fDateTime(t.inicio) + ' · ' + U.duracion(t.inicio))),
          h('div', { class: 'kv' }, h('span', null, 'Registros del turno'), h('strong', null, String(r.registros))),
          r.pendientes ? h('p', { class: 'banner warn' }, AP.icon('sync', 18), h('span', null, r.pendientes + ' registro(s) aún no se han enviado. Conéctese a internet antes de cerrar; si no es posible, quedan guardados en este celular y se enviarán cuando vuelva a ingresar. No borre los datos del navegador.')) : null,
          h('p', { class: 'muted' }, 'Al cerrar el turno también se cierra su sesión en este celular.')),
        actions: [{ label: 'Cancelar', value: false }, { label: 'Cerrar turno y salir', kind: 'primary', icon: 'logout', value: true }]
      });
    });
    if (!ok) return;
    await AP.Pin.cerrarTurno('Fin de turno');
    AP.mount(AP.spinner('Enviando registros…'), 'is-login');
    await Promise.race([AP.Sync.run({ skipPull: true }), U.sleep(8000)]);
    var quedan = AP.Sync.pendingCount();
    if (quedan) AP.toast(quedan + ' registro(s) quedan guardados en este celular y se enviarán al volver a ingresar.', 'warn', 9000);
    else AP.toast('Turno cerrado.', 'info');
    await AP.Sync.limpiarLocal();
    await AP.B.logout();
  };
})();
