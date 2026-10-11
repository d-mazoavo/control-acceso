/* Contraseñas y PIN, y turnos de vigilantes y supervisores.
 * La contraseña la verifica el servidor de autenticación de Google (Firebase): no se guarda en los celulares. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U;

  var P = (AP.Pin = {});

  P.norm = function (u) { return String(u || '').trim().toLowerCase().replace(/\s+/g, ''); };
  P.usaPin = function (rol) { return AP.ROLES_TURNO.indexOf(rol) >= 0; };

  // Vigilantes y supervisores: PIN de 6 a 8 dígitos, sin repeticiones ni secuencias evidentes, que no salga del documento.
  P.regla = function (pin, v) {
    pin = String(pin || '');
    if (!/^\d{6,8}$/.test(pin)) return 'El PIN debe tener entre 6 y 8 dígitos, solo números.';
    if (/^(\d)\1+$/.test(pin)) return 'El PIN no puede ser un mismo dígito repetido.';
    if ('0123456789'.indexOf(pin) >= 0 || '9876543210'.indexOf(pin) >= 0) return 'El PIN no puede ser una secuencia (por ejemplo, 123456).';
    if (v && v.NumDoc && U.normDoc(v.NumDoc).indexOf(pin) >= 0) return 'El PIN no puede formar parte de su número de documento.';
    return null;
  };
  // Administrador y analista: contraseña de al menos 10 caracteres con letras y números.
  P.reglaClave = function (c, v) {
    c = String(c || '');
    if (c.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
    if (!/[a-záéíóúñ]/i.test(c) || !/\d/.test(c)) return 'La contraseña debe combinar letras y números.';
    if (v && v.Usuario && c.toLowerCase().indexOf(P.norm(v.Usuario)) >= 0) return 'La contraseña no puede contener el usuario.';
    if (v && v.NumDoc && c.indexOf(U.normDoc(v.NumDoc)) >= 0) return 'La contraseña no puede contener su número de documento.';
    return null;
  };
  P.reglaPara = function (rol, valor, v) { return P.usaPin(rol) ? P.regla(valor, v) : P.reglaClave(valor, v); };
  P.temporal = function () { var p; do { p = U.randomDigits(6); } while (P.regla(p)); return p; };

  // La contraseña temporal vence a las X horas de asignada
  P.temporalVencida = function (perfil) {
    if (!perfil || !perfil.PinTemporal || !perfil.PinFecha) return false;
    var hv = AP.CFG.horasVigenciaPinTemporal || 72;
    return Date.now() - new Date(perfil.PinFecha).getTime() > hv * 3600000;
  };

  // Cambio de contraseña por el propio usuario; deja constancia de la aceptación del aviso.
  P.cambiarClave = async function (actual, nueva) {
    await AP.B.cambiarClave(actual, nueva);
    var me = AP.Session.user || {};
    if (me.perfil) { me.perfil.PinTemporal = false; me.perfil.PinPersonalDesde = new Date().toISOString(); }
    await AP.Audit.log('Definición de contraseña personal', me.usuario + ' — ' + me.nombre,
      'Aceptó las condiciones de uso de la credencial (' + ((AP.TX && AP.TX.versionAvisoVigilante) || '') + '). Dispositivo ' + U.deviceId() + '.');
  };

  // ---------- Turnos ----------
  P.evento = async function (evento, t, extra) {
    var me = AP.Session.user || {};
    var f = Object.assign({
      IdLocal: U.uuid(), Title: t.nombre, Evento: evento, TurnoId: t.id, VigilanteId: t.vigilanteId, VigilanteUsuario: t.usuario, Rol: t.rol,
      FechaHora: new Date().toISOString(), InicioTurno: t.inicio, Dispositivo: U.deviceId(), Cuenta: me.usuario, SinConexion: !AP.Sync.state.online
    }, extra || {});
    Object.keys(f).forEach(function (k) { if (f[k] === undefined || f[k] === null || f[k] === '') delete f[k]; });
    f.Hash = await U.hashRecord(f);
    await AP.Sync.enqueue('turno', f);
    return f;
  };

  P.iniciarTurno = async function () {
    var me = AP.Session.user, v = me.perfil || {};
    var t = {
      id: U.uuid(), vigilanteId: String(me.vigilanteId), usuario: me.usuario, nombre: me.nombre, uid: me.uid,
      rol: P.usaPin(me.rol) ? me.rol : 'Vigilante', inicio: new Date().toISOString(),
      pinVersion: Number(v.PinVersion || 0), dispositivo: U.deviceId()
    };
    await AP.Store.set('turno:actual', t);
    AP.Session.setTurno(t);
    await P.evento('Inicio de turno', t);
    return t;
  };

  P.resumenTurno = function (t) {
    t = t || AP.Session.turno;
    if (!t) return null;
    var movs = AP.Sync.allMovs().filter(function (m) { return m.TurnoId === t.id; });
    var insp = AP.Sync.outbox.filter(function (o) { return o.kind === 'insp' && o.fields.TurnoId === t.id; }).length;
    return { movs: movs, registros: movs.length, inspeccionesPendientes: insp, pendientes: AP.Sync.pendingCount() };
  };

  P.cerrarTurno = async function (evento, detalle) {
    var t = AP.Session.turno;
    if (!t) return;
    var r = P.resumenTurno(t);
    await P.evento(evento || 'Fin de turno', t, { Registros: r.registros, Pendientes: r.pendientes, Detalle: detalle });
    await AP.Store.del('turno:actual');
    AP.Session.setTurno(null);
  };

  // Cierra el turno si superó la duración máxima, si el usuario fue dado de baja o si el administrador restableció su contraseña.
  // Devuelve { msg, salir } o false.
  var vigilando = false;
  P.vigilar = async function () {
    var t = AP.Session.turno;
    if (!t || vigilando) return false;
    vigilando = true;
    try {
      var horas = AP.CFG.horasMaxTurno || 13;
      if (Date.now() - new Date(t.inicio).getTime() > horas * 3600000) {
        await P.cerrarTurno('Cierre automático de turno', 'El turno superó ' + horas + ' horas sin cerrarse.');
        return { msg: 'El turno se cerró automáticamente por superar ' + horas + ' horas.' };
      }
      if (AP.B.inactivo) {
        await P.cerrarTurno('Cierre por baja de la credencial', 'El usuario fue dado de baja o su contraseña fue restablecida desde la consola.');
        return { msg: 'Su usuario fue dado de baja o su contraseña fue restablecida. Comuníquese con su supervisor.', salir: true };
      }
      var v = AP.Sync.vigilantes.find(function (x) { return String(x.id) === String(t.vigilanteId); });
      if (v && v.Activo === false) {
        await P.cerrarTurno('Cierre por baja de la credencial', 'El usuario fue dado de baja desde la consola.');
        return { msg: 'El turno se cerró: su usuario fue dado de baja.', salir: true };
      }
      if (v && Number(v.PinVersion || 0) !== Number(t.pinVersion || 0)) {
        await P.cerrarTurno('Cierre por restablecimiento del PIN', 'El administrador restableció la contraseña durante el turno.');
        return { msg: 'El turno se cerró: el administrador restableció su PIN.', salir: true };
      }
      return false;
    } finally { vigilando = false; }
  };
})();
