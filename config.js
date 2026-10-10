/*
 * ============================================================================
 *  AVO PAK S.A.S. — Control de Acceso de Personas y Vehículos
 *  Archivo de configuración. Es el ÚNICO archivo que debe editarse.
 * ============================================================================
 */

// ====== PEGUE AQUÍ, reemplazando las 8 líneas siguientes, el bloque que le muestra Firebase ======
const firebaseConfig = {
  apiKey: "AIzaSyDA-T4nqFN-LoF94nuIG5-EpYCFvZqY9FQ",
  authDomain: "avopak-acceso-bf73e.firebaseapp.com",
  projectId: "avopak-acceso-bf73e",
  storageBucket: "avopak-acceso-bf73e.firebasestorage.app",
  messagingSenderId: "988828626159",
  appId: "1:988828626159:web:a593c81c2bb085881fbf1a"
};
// ====== FIN DEL BLOQUE DE FIREBASE ======

window.AP_CONFIG = {
  modo: 'firebase',
  firebase: firebaseConfig,

  // Dominio técnico interno de los usuarios: nadie recibe correos en él. No lo cambie después de crear usuarios.
  dominioUsuarios: 'usuarios.avo-pak.com',

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
  diasHistorialEnPorteria: 2,       // Días de movimientos que se guardan en el celular de cada vigilante

  // ---- Puntualidad y permisos del personal con horario registrado ----
  puntualidad: {
    minutosPendiente: 10,           // Llegada 1 a 9 min después de la hora de entrada: ingreso PENDIENTE (se registra y queda para verificación).
                                    // Desde este minuto (10): ingreso DENEGADO hasta que el Director verifique.
    minutosAntelacionTurno: 120,    // Se acepta el ingreso hasta X min antes de la hora de entrada; antes de eso queda PENDIENTE
    minutosSalidaAntesDeFin: 0,     // Salida permitida desde X min antes de la hora de fin de jornada
    horasMaxSinSalida: 14           // Un ingreso abierto por más horas se considera con salida no registrada
  },

  // ---- Turnos de vigilantes y supervisores ----
  horasMaxTurno: 13,                // El turno se cierra solo si nadie lo cierra en este plazo
  horasVigenciaPinTemporal: 72,     // El PIN temporal que entrega el administrador vence en este plazo

  // ---- Responsable del tratamiento (Ley 1581 de 2012) — COMPLETAR antes de operar ----
  responsable: {
    razonSocial: 'Avo Pak S.A.S.',
    nit: '901.557.939-1',
    domicilio: 'Km 5 vía La Ceja – Abejorral, La Ceja (Antioquia)',
    correoDatos: 'info@avo-pak.com',
    politicaUrl: ''   // Enlace a la Política de Tratamiento de Datos publicada, si existe
  },
  versionAutorizacion: 'AUT-ACC-02'
};
