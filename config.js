/*
 * ============================================================================
 *  AVO PAK S.A.S. — Control de Acceso de Personas y Vehículos
 *  Archivo de configuración. Es el ÚNICO archivo que debe editarse para
 *  conectar la aplicación con el Microsoft 365 de la compañía.
 * ============================================================================
 */
window.AP_CONFIG = {
  modo: 'm365',
  tenantId: '8519607c-2dc5-4278-8880-60dc272e53f2',
  clientId: '916a78d9-e2a5-4aab-bb87-eff41f203f83',
  sitioSharePoint: 'netorgft10279123.sharepoint.com/sites/ComprehensiveSecurityManagementStatementAvo-PakS.A.S',
  administradores: ['dmazo@avo-pak.com'],
  empresa: 'Avo Pak S.A.S.',
  porteria: 'Portería principal',
  sede: 'Planta La Ceja — Km 5 vía La Ceja – Abejorral, La Ceja (Antioquia)',
  telefonos: { director: '', supervisor: '', policia: '123' },
  horasMaxPermanencia: 14,
  minutosAntelacionVisita: 0,
  minutosAlertaSinSincronizar: 30,
  diasHistorialEnPorteria: 2,
  puntualidad: { minutosPendiente: 10, minutosAntelacionTurno: 120, minutosSalidaAntesDeFin: 0, horasMaxSinSalida: 14 },
  horasMaxTurno: 13,
  horasVigenciaPinTemporal: 72,
  responsable: { razonSocial: 'Avo Pak S.A.S.', nit: '[COMPLETAR NIT]', domicilio: 'Km 5 vía La Ceja – Abejorral, La Ceja (Antioquia)', correoDatos: '[COMPLETAR CORREO]', politicaUrl: '' },
  versionAutorizacion: 'AUT-ACC-01'
};
