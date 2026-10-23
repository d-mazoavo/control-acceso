/* Idioma del menú (español o inglés). Cada usuario lo elige en su celular o computador; los registros, los
 * documentos y los mensajes a terceros siguen en español. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var CLAVE = 'ap_idioma_menu';

  // Español → inglés (solo menús, títulos de pantalla y accesos directos)
  var EN = {
    // Consola
    'Panel': 'Dashboard', 'Personas': 'People', 'Visitas': 'Visits', 'Solicitudes de ingreso': 'Entry requests',
    'Ingresos y salidas': 'Entries and exits', 'Inspecciones': 'Inspections', 'Horarios': 'Schedules', 'Permisos': 'Permits',
    'Novedades': 'Exceptions to verify', 'Usuarios': 'Users', 'Elementos': 'Items and equipment', 'Rondas': 'Security rounds',
    'Programación': 'Guard roster', 'Bitácora': 'Audit log', 'Instalación': 'Setup', 'Notificaciones': 'Notifications',
    'Estadísticas': 'Statistics', 'Planta': 'Plant shifts', 'Talento Humano': 'Human Resources', 'Manual de uso': 'User manual',
    'Ir a portería': 'Go to the gate', 'Cambiar mi contraseña': 'Change my password', 'Cerrar sesión': 'Sign out',
    'Idioma del menú': 'Menu language', 'Consola': 'Console', 'Control de Acceso': 'Access Control', 'Solo consulta': 'View only',
    // Títulos de pantalla
    'Panel de control': 'Control dashboard', 'Personas habilitadas': 'Authorized people', 'Historial de ingresos y salidas': 'Entry and exit log',
    'Inspecciones de carga': 'Cargo inspections', 'Horarios y turnos': 'Schedules and shifts', 'Novedades por verificar': 'Exceptions to verify',
    'Bitácora de actuaciones': 'Audit log', 'Control de elementos': 'Items and equipment control', 'Instalación y configuración': 'Setup and configuration',
    'Notificaciones y alertas': 'Notifications and alerts', 'Programación de vigilantes y ronderos': 'Guard and patrol roster',
    'Rondas de seguridad': 'Security rounds', 'Estadísticas e indicadores': 'Statistics and indicators',
    'Programación de planta': 'Plant shift scheduling', 'Talento Humano — personal': 'Human Resources — staff',
    'Manual de uso de la aplicación': 'Application user manual',
    'Empresas': 'Companies', 'Cargos': 'Job positions', 'Empresas (personas jurídicas)': 'Companies (legal entities)', 'Mi personal y programación': 'My staff and scheduling',
    // Portería y rondas
    'Leer código QR': 'Scan QR code', 'Ingreso y salida: siempre con lectura del QR': 'Entry and exit: always scan the QR',
    'Buscar': 'Search', 'Por documento o nombre': 'By ID number or name', 'Registro manual': 'Manual entry',
    'No anunciado / sin QR / salidas': 'Unannounced / no QR / exits', 'Visitas de hoy': "Today's visits", 'Personas dentro': 'People inside',
    'Autoridad': 'Authorities', 'Visita de autoridad': 'Authority visit', 'Vehículo de carga': 'Cargo vehicle', 'Inspección y precintos': 'Inspection and seals',
    'Mi turno': 'My shift', 'Registros del celular': 'Records on this phone', 'Sincronizar': 'Sync', 'Cerrar turno': 'End shift', 'Salir': 'Sign out',
    'Instalar app': 'Install app', 'Historial': 'History', 'Buscar persona': 'Find a person', 'Verificación': 'Verification',
    'Solicitud de ingreso': 'Entry request', 'Solicitud de visita': 'Visit request', 'Punto de control': 'Checkpoint',
    'Marcar punto de control': 'Check in at a checkpoint', 'Lea el código QR fijado en el punto': 'Scan the QR code posted at the checkpoint',
    'Cambiar mi PIN': 'Change my PIN', 'Manual': 'Manual', 'Panel de rondas': 'Rounds dashboard'
  };

  function leer() { try { return localStorage.getItem(CLAVE) === 'en' ? 'en' : 'es'; } catch (e) { return 'es'; } }
  var actual = leer();

  AP.idioma = function () { return actual; };
  AP.setIdioma = function (v) {
    actual = v === 'en' ? 'en' : 'es';
    try { localStorage.setItem(CLAVE, actual); } catch (e) { /* sin almacenamiento: vale para esta sesión */ }
    try { document.documentElement.lang = actual === 'en' ? 'en' : 'es-CO'; } catch (e) { /* */ }
    if (AP.render) AP.render();
  };
  // Traduce un texto del menú; si no está en el diccionario, se deja como está
  AP.t = function (s) { return actual === 'en' && EN[s] ? EN[s] : s; };

  // Selector compacto (ES | EN) para la consola, la portería y las rondas
  AP.selectorIdioma = function (compacto) {
    var h = AP.h;
    var wrap = h('div', { class: 'lang-switch' + (compacto ? ' compact' : ''), role: 'group', 'aria-label': AP.t('Idioma del menú') },
      compacto ? null : h('span', { class: 'lang-lbl' }, AP.t('Idioma del menú')));
    [['es', 'ES', 'Español'], ['en', 'EN', 'English']].forEach(function (o) {
      wrap.appendChild(h('button', { type: 'button', class: 'lang-btn' + (actual === o[0] ? ' on' : ''), 'aria-pressed': String(actual === o[0]), title: o[2],
        onclick: function () { if (actual !== o[0]) AP.setIdioma(o[0]); } }, o[1]));
    });
    return wrap;
  };
})();
