/*
 * ============================================================================
 *  AVO PAK S.A.S. — Control de Acceso de Personas y Vehículos
 *  Archivo de configuración. Es el ÚNICO archivo que debe editarse para
 *  conectar la aplicación con el Microsoft 365 de la compañía.
 * ============================================================================
 */
window.AP_CONFIG = {
  // 'm365' = conectada a SharePoint de Avo Pak.  'demo' = datos ficticios locales.
  modo: 'm365',

  // ---- Conexión con Microsoft 365 (ver Guía de instalación, pasos 2 y 3) ----
  // Id. de directorio (inquilino), tomado de Microsoft Entra > Registros de aplicaciones.
  tenantId: 'PEGAR_AQUI_EL_ID_DE_DIRECTORIO',
  // Id. de aplicación (cliente) de la aplicación registrada.
  clientId: 'PEGAR_AQUI_EL_ID_DE_APLICACION',
  // Dirección del sitio de SharePoint SIN "https://". Ejemplo: avopak.sharepoint.com/sites/SeguridadIntegral
  sitioSharePoint: 'PEGAR_AQUI.sharepoint.com/sites/SeguridadIntegral',

  // Cuentas que siempre tendrán rol de Administrador (no pueden quedar bloqueadas).
  // Verifique que coincida exactamente con su usuario de inicio de sesión de Microsoft 365.
  administradores: ['dmazo@avo-pak.com'],

  // ---- Datos de la sede ----
  empresa: 'Avo Pak S.A.S.',
  porteria: 'Portería principal',
  sede: 'Planta La Ceja — Km 5 vía La Ceja – Abejorral, La Ceja (Antioquia)',

  // Teléfonos que el vigilante puede marcar desde la app (déjelos vacíos si no aplica).
  telefonos: {
    director: '',        // Director de Seguridad Integral
    supervisor: '',      // Supervisor del contratista de vigilancia
    policia: '123'       // Línea única de emergencias
  },

  // ---- Parámetros operativos ----
  horasMaxPermanencia: 14,          // Alerta: personas dentro por más de estas horas
  minutosAntelacionVisita: 0,       // Visitantes: el QR sirve exactamente entre la hora de inicio y la de fin que programe el Director (0 = sin holgura)
  minutosAlertaSinSincronizar: 30,  // Aviso al vigilante cuando los datos tengan más de X minutos sin actualizarse
  diasHistorialEnPorteria: 2,       // Días de movimientos que se guardan en el celular de portería

  // ---- Puntualidad y permisos del personal con horario registrado ----
  puntualidad: {
    minutosPendiente: 10,           // Llegada 1 a 9 min después de la hora de entrada: ingreso PENDIENTE (se registra y queda para verificación).
                                    // Desde este minuto (10): ingreso DENEGADO hasta que el Director verifique.
    minutosAntelacionTurno: 120,    // Se acepta el ingreso hasta X min antes de la hora de entrada; antes de eso queda PENDIENTE
    minutosSalidaAntesDeFin: 0,     // Salida permitida desde X min antes de la hora de fin de jornada
    horasMaxSinSalida: 14           // Un ingreso abierto por más horas se considera con salida no registrada
  },

  // ---- Turnos con usuario y PIN (celular de portería con cuenta de servicio) ----
  horasMaxTurno: 13,                // El turno se cierra solo si nadie lo cierra en este plazo
  horasVigenciaPinTemporal: 72,     // El PIN temporal que entrega el administrador vence en este plazo

  // ---- Responsable del tratamiento (Ley 1581 de 2012) — COMPLETAR antes de operar ----
  responsable: {
    razonSocial: 'Avo Pak S.A.S.',
    nit: '[COMPLETAR NIT]',
    domicilio: 'Km 5 vía La Ceja – Abejorral, La Ceja (Antioquia)',
    correoDatos: '[COMPLETAR CORREO DE ATENCIÓN DE PETICIONES SOBRE DATOS PERSONALES]',
    politicaUrl: ''   // Enlace a la Política de Tratamiento de Datos publicada, si existe
  },
  versionAutorizacion: 'AUT-ACC-01'
};
