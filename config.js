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

  // ---- Conexión con Microsoft 365 ----
  tenantId: '8519607c-2dc5-4278-8880-60dc272e53f2',
  clientId: '916a78d9-e2a5-4aab-bb87-eff41f203f83',
  sitioSharePoint: 'netorgft10279123.sharepoint.com/sites/ComprehensiveSecurityManagementStatementAvo-PakS.A.S',

  // Cuentas que siempre tendrán rol de Administrador.
  administradores: ['david1mazo@hotmail.com'],

  // ---- Datos de la sede ----
  empresa: 'Avo Pak S.A.S.',
  porteria: 'Portería principal',
  sede: 'Planta La Ceja — Km 5 vía La Ceja – Abejorral, La Ceja (Antioquia)',

  telefonos: {
    director: '',
    supervisor: '',
    policia: '123'
  },

  // ---- Parámetros operativos ----
  horasMaxPermanencia: 14,
  minutosAntelacionVisita: 0,
  minutosAlertaSinSincronizar: 30,
  diasHistorialEnPorteria: 2,

  puntualidad: {
    minutosPendiente: 10,
    minutosAntelacionTurno: 120,
    minutosSalidaAntesDeFin: 0,
    horasMaxSinSalida: 14
  },

  horasMaxTurno: 13,
  horasVigenciaPinTemporal: 72,

  responsable: {
    razonSocial: 'Avo Pak S.A.S.',
    nit: '901.557.939-1',
    domicilio: 'Km 5 vía La Ceja – Abejorral, La Ceja (Antioquia)',
    correoDatos: 'info@avo-pak.com',
    politicaUrl: ''
  },
  versionAutorizacion: 'AUT-ACC-01'
};
