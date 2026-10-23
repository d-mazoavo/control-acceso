/* Estructura de datos (colecciones de Firebase) y catálogos de la aplicación */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});

  // [nombre interno, tipo, opciones]   tipos: text | note | datetime | bool | number
  var IDX = { idx: true }, UNQ = { idx: true, uniq: true };
  AP.SCHEMA = {
    AP_Personas: {
      titulo: 'Nombre completo',
      desc: 'Personal propio, contratistas y conductores habilitados para ingresar',
      cols: [
        ['Token', 'text', UNQ], ['Tipo', 'text'], ['TipoDoc', 'text'], ['NumDoc', 'text', IDX], ['Telefono', 'text'],
        ['Correo', 'text'], ['Empresa', 'text'], ['Cargo', 'text'], ['Area', 'text'], ['Estado', 'text', IDX],
        ['MotivoEstado', 'text'], ['VigenciaHasta', 'text'], ['Placa', 'text'], ['VehiculoTipo', 'text'], ['Foto', 'note'],
        ['AutorizaDatos', 'bool'], ['AutorizaFoto', 'bool'], ['FechaAutorizacion', 'text'], ['VersionAutorizacion', 'text'],
        ['Observaciones', 'note'],
        // v1.0.0: clase de personal propio y alerta de salida del Director
        ['TipoPersonal', 'text', IDX], ['AlertaSalida', 'bool'], ['MotivoAlertaSalida', 'text'],
        // Empresa (persona jurídica registrada), cargo del catálogo y jefe inmediato (persona registrada). El Jefe de
        // Producción ve y programa a las personas que lo tienen como jefe inmediato.
        ['EmpresaId', 'text', IDX], ['CargoId', 'text'], ['JefeId', 'text', IDX], ['JefeNombre', 'text']
      ]
    },
    // ---------- Datos maestros del Director: personas jurídicas y cargos ----------
    AP_Empresas: {
      titulo: 'Nombre o razón social',
      desc: 'Personas jurídicas (empresa propia, contratistas, transportadoras) a las que se vinculan las personas registradas',
      cols: [['NIT', 'text', UNQ], ['Logo', 'note'], ['Activo', 'bool'], ['Observaciones', 'note']]
    },
    AP_Cargos: {
      titulo: 'Nombre del cargo',
      desc: 'Catálogo de cargos que se asignan a las personas registradas',
      cols: [['Area', 'text'], ['TipoPersonal', 'text'], ['Activo', 'bool'], ['Observaciones', 'note']]
    },
    AP_Visitas: {
      titulo: 'Nombre del visitante',
      desc: 'Prerregistro y aprobación de visitantes',
      cols: [
        ['Token', 'text', UNQ], ['Categoria', 'text'], ['TipoDoc', 'text'], ['NumDoc', 'text', IDX], ['Telefono', 'text'],
        ['Correo', 'text'], ['Empresa', 'text'], ['Motivo', 'note'], ['Anfitrion', 'text'], ['AnfitrionCorreo', 'text'],
        ['Area', 'text'], ['FechaInicio', 'datetime', IDX], ['FechaFin', 'datetime', IDX], ['Placa', 'text'],
        ['VehiculoTipo', 'text'], ['Estado', 'text', IDX], ['SolicitadoPor', 'text'], ['AprobadoPor', 'text'],
        ['FechaAprobacion', 'datetime'], ['QREnviado', 'datetime'], ['Foto', 'note'], ['Observaciones', 'note'],
        // v2.2.0: anfitrión vinculado al personal propio y solicitudes de visitantes no anunciados hechas en portería
        ['AnfitrionId', 'text'], ['AnfitrionDoc', 'text', IDX], ['AnfitrionCargo', 'text'],
        ['Origen', 'text'], ['Porteria', 'text'], ['SolicitadoPorNombre', 'text'], ['FechaSolicitud', 'datetime'],
        ['AutorizaDatos', 'bool'], ['JustificacionDecision', 'note'], ['AprobadoPorNombre', 'text']
      ]
    },
    AP_Movimientos: {
      titulo: 'Nombre',
      desc: 'Registro de ingresos, salidas e ingresos negados (no se edita ni se borra)',
      cols: [
        ['IdLocal', 'text', UNQ], ['Sentido', 'text'], ['Resultado', 'text'], ['Categoria', 'text'], ['Origen', 'text'],
        ['Token', 'text', IDX], ['RefLista', 'text'], ['RefId', 'text'], ['TipoDoc', 'text'], ['NumDoc', 'text', IDX],
        ['Telefono', 'text'], ['Empresa', 'text'], ['Cargo', 'text'], ['Anfitrion', 'text'], ['AnfitrionCorreo', 'text'], ['Area', 'text'],
        ['AnfitrionId', 'text'], ['AnfitrionDoc', 'text'],
        ['Motivo', 'note'], ['Placa', 'text', IDX], ['VehiculoTipo', 'text'], ['EstadoMostrado', 'text'],
        ['Excepcion', 'bool'], ['AutorizadoPor', 'text'], ['MotivoExcepcion', 'note'], ['MotivoNegacion', 'note'],
        ['AutorizacionConfirmada', 'bool'], ['CarneEntregado', 'text'], ['DocumentoCustodia', 'bool'],
        ['CarneDevuelto', 'bool'], ['DatosAdicionales', 'note'], ['FechaHora', 'datetime', IDX], ['Vigilante', 'text'],
        ['VigilanteCorreo', 'text'], ['VigilanteUsuario', 'text'], ['TurnoId', 'text'], ['Dispositivo', 'text'], ['SinConexion', 'bool'],
        ['DesfaseReloj', 'number'], ['Porteria', 'text'], ['EntradaId', 'text'], ['InspeccionId', 'text'], ['Novedad', 'text', IDX], ['PermisoId', 'text'], ['HorarioInfo', 'text'], ['Hash', 'text'], ['Observaciones', 'note'],
        ['SolicitudId', 'text'], ['InduccionConfirmada', 'bool'], ['TipoPersonal', 'text', IDX],
        // Jefe inmediato de la persona al momento del registro (el Jefe de Producción consulta los de su personal)
        ['JefeId', 'text', IDX]
      ]
    },
    AP_Inspecciones: {
      titulo: 'Resumen',
      desc: 'Inspección de vehículos de carga, contenedores y precintos',
      cols: [
        ['IdLocal', 'text', UNQ], ['Operacion', 'text'], ['Placa', 'text', IDX], ['Remolque', 'text'], ['Contenedor', 'text'],
        ['Transportadora', 'text'], ['Conductor', 'text'], ['DocConductor', 'text'], ['Checklist', 'note'], ['Precintos', 'text'],
        ['PrecintosVerificacion', 'note'], ['Testigo', 'text'], ['Resultado', 'text'], ['NoConformidades', 'note'],
        ['Fotos', 'note'], ['FechaHora', 'datetime', IDX], ['Vigilante', 'text'], ['VigilanteCorreo', 'text'],
        ['VigilanteUsuario', 'text'], ['TurnoId', 'text'], ['Dispositivo', 'text'], ['SinConexion', 'bool'], ['Porteria', 'text'], ['MovimientoId', 'text'], ['Hash', 'text'],
        ['Observaciones', 'note']
      ]
    },
    AP_Vigilantes: {
      titulo: 'Nombre completo',
      desc: 'Usuarios de la aplicación (todos los roles): ingresan solo con usuario y contraseña o PIN',
      cols: [
        ['Usuario', 'text', UNQ], ['TipoDoc', 'text'], ['NumDoc', 'text', IDX], ['Empresa', 'text'], ['Cargo', 'text'], ['Telefono', 'text'],
        ['Rol', 'text'], ['Activo', 'bool'], ['Uid', 'text'], ['PinVersion', 'number'], ['PinTemporal', 'bool'], ['PinPersonalDesde', 'datetime'],
        ['PinFecha', 'datetime'], ['PinPor', 'text'], ['SolicitadoPor', 'text'], ['Soporte', 'text'], ['FechaAlta', 'datetime'],
        ['AltaPor', 'text'], ['FechaBaja', 'datetime'], ['BajaPor', 'text'], ['MotivoBaja', 'text'], ['Observaciones', 'note'],
        // Cierre de la sesión de un vigilante ordenado desde la consola: el celular lo aplica en su próxima actualización
        ['CierreSesion', 'datetime'], ['CierreSesionTurnoId', 'text'], ['CierreSesionPor', 'text'], ['CierreSesionMotivo', 'text'],
        // Persona registrada a la que corresponde el usuario (nombre, documento, empresa y cargo salen de su ficha)
        ['PersonaId', 'text', IDX]
      ]
    },
    AP_Turnos: {
      titulo: 'Nombre del vigilante',
      desc: 'Inicio y cierre de turnos de vigilantes y supervisores (no se edita ni se borra)',
      cols: [
        ['IdLocal', 'text', UNQ], ['Evento', 'text'], ['TurnoId', 'text', IDX], ['VigilanteId', 'text', IDX], ['VigilanteUsuario', 'text'],
        ['Rol', 'text'], ['FechaHora', 'datetime', IDX], ['InicioTurno', 'datetime'], ['Registros', 'number'], ['Pendientes', 'number'],
        ['Dispositivo', 'text'], ['Cuenta', 'text'], ['SinConexion', 'bool'], ['Detalle', 'note'], ['Hash', 'text']
      ]
    },
    AP_Horarios: {
      titulo: 'Nombre de la persona',
      desc: 'Horario o turno programado de cada persona (lo registra la Dirección de Seguridad Integral)',
      cols: [
        ['Token', 'text', IDX], ['NumDoc', 'text', IDX], ['Area', 'text'], ['Turno', 'text'], ['Dias', 'text'],
        ['HoraEntrada', 'text'], ['HoraSalida', 'text'], ['VigenteDesde', 'text'], ['VigenteHasta', 'text'], ['Activo', 'bool'], ['Observaciones', 'note'],
        // Turno (control de puntualidad y de salida) o Libre (entra y sale las veces que necesite dentro del horario habilitado)
        ['Modalidad', 'text']
      ]
    },
    AP_Permisos: {
      titulo: 'Nombre de la persona',
      desc: 'Permisos de ingreso tardío, salida anticipada o temporal y autorizaciones especiales',
      cols: [
        ['Token', 'text', IDX], ['NumDoc', 'text', IDX], ['Tipo', 'text'], ['Desde', 'datetime', IDX], ['Hasta', 'datetime', IDX],
        ['Estado', 'text'], ['Detalle', 'note'], ['AutorizadoPor', 'text'], ['AnuladoPor', 'text'], ['MotivoAnulacion', 'text'],
        // Quién autoriza, elegido de la lista de personas registradas
        ['AutorizadoPorId', 'text'], ['AutorizadoPorDoc', 'text'], ['AutorizadoPorCargo', 'text'], ['SolicitudId', 'text'],
        // Persona del permiso (los permisos del Jefe de Producción se validan contra la ficha de la persona)
        ['PersonaId', 'text'], ['TipoPersonal', 'text', IDX], ['Area', 'text'], ['FechaAnulacion', 'datetime'],
        // Tipo de la persona (Talento Humano consulta los del personal propio) y su jefe inmediato (Jefe de Producción)
        ['PersonaTipo', 'text', IDX], ['JefeId', 'text', IDX]
      ]
    },
    AP_Solicitudes: {
      titulo: 'Nombre de la persona',
      desc: 'Ingresos que el vigilante no puede autorizar (llegada tardía, fuera de turno, día no programado): decide el Director de Seguridad Integral',
      cols: [
        ['Token', 'text', IDX], ['Tipo', 'text'], ['PersonaTipo', 'text'], ['TipoDoc', 'text'], ['NumDoc', 'text', IDX], ['Empresa', 'text'],
        ['Cargo', 'text'], ['Area', 'text'], ['Novedad', 'text'], ['HorarioInfo', 'text'], ['Origen', 'text'], ['Estado', 'text', IDX],
        ['Porteria', 'text'], ['SolicitadoPor', 'text'], ['SolicitadoPorNombre', 'text'], ['FechaSolicitud', 'datetime', IDX],
        ['DecididoPor', 'text'], ['DecididoPorNombre', 'text'], ['FechaDecision', 'datetime'], ['Justificacion', 'note'],
        ['PermisoId', 'text'], ['VigenteHasta', 'datetime'], ['Observaciones', 'note']
      ]
    },
    AP_PuntosRonda: {
      titulo: 'Nombre del punto',
      desc: 'Puntos de control de las rondas (cada uno con su código QR fijo en sitio)',
      cols: [
        ['Codigo', 'text', UNQ], ['Ubicacion', 'text'], ['Instrucciones', 'note'], ['Orden', 'number'], ['Activo', 'bool'],
        // Revistas exigidas por turno y minutos mínimos entre una y otra para que cuenten
        ['VecesTurno', 'number'], ['IntervaloMin', 'number']
      ]
    },
    AP_Rondas: {
      titulo: 'Punto de control',
      desc: 'Marcaciones de los ronderos en los puntos de control, con novedades y fotografías (no se edita ni se borra)',
      cols: [
        ['IdLocal', 'text', UNQ], ['PuntoId', 'text', IDX], ['Codigo', 'text'], ['Origen', 'text'], ['FechaHora', 'datetime', IDX],
        ['Rondero', 'text'], ['RonderoUsuario', 'text'], ['TurnoId', 'text'], ['Dispositivo', 'text'], ['SinConexion', 'bool'],
        ['Novedad', 'bool'], ['TipoNovedad', 'text'], ['Descripcion', 'note'], ['Justificacion', 'note'], ['Fotos', 'note'], ['Hash', 'text']
      ]
    },
    AP_Programacion: {
      titulo: 'Programación',
      desc: 'Programación mensual del servicio de vigilancia y rondas (día, noche, descanso) reportada por la empresa contratista',
      cols: [
        ['Mes', 'text', UNQ], ['Datos', 'note'], ['HorarioDia', 'text'], ['HorarioNoche', 'text'], ['Soporte', 'text'], ['Observaciones', 'note']
      ]
    },
    // ---------- Planta: turnos del personal a cargo de cada Jefe de Producción (por jefe inmediato) ----------
    AP_TurnosPlanta: {
      titulo: 'Nombre del turno',
      desc: 'Turnos de planta (código, hora de entrada y de salida) que usa cada Jefe de Producción para programar a su personal',
      cols: [['Codigo', 'text', IDX], ['HoraEntrada', 'text'], ['HoraSalida', 'text'], ['Activo', 'bool'], ['Observaciones', 'note'],
        ['JefeId', 'text', IDX], ['JefeNombre', 'text']]
    },
    AP_ProgPlanta: {
      titulo: 'Semana',
      desc: 'Programación semanal de turnos del personal de cada jefe inmediato (un registro por semana y por jefe): la portería aplica las reglas de puntualidad con esta programación',
      cols: [['Semana', 'text', IDX], ['Desde', 'datetime', IDX], ['Datos', 'note'], ['Turnos', 'note'], ['Version', 'number'], ['Observaciones', 'note'],
        ['JefeId', 'text', IDX], ['JefeNombre', 'text']]
    },
    AP_CambiosPlanta: {
      titulo: 'Cambio',
      desc: 'Registro de los cambios a la programación de planta y a las ausencias (no se modifica ni se borra)',
      cols: [['Tipo', 'text', IDX], ['Semana', 'text'], ['Referencia', 'text'], ['FechaHora', 'datetime', IDX], ['Usuario', 'text'], ['UsuarioNombre', 'text'],
        ['Rol', 'text'], ['Cambios', 'number'], ['MismoDia', 'number'], ['Detalle', 'note'], ['Motivo', 'note'], ['JefeId', 'text', IDX]]
    },
    // ---------- Talento Humano: ausencias del personal (vacaciones, permisos de día completo, licencias) ----------
    AP_Ausencias: {
      titulo: 'Nombre de la persona',
      desc: 'Ausencias registradas por Talento Humano: en esas fechas la portería no deja ingresar a la persona sin aprobación del Director',
      cols: [['PersonaId', 'text'], ['Token', 'text', IDX], ['NumDoc', 'text', IDX], ['TipoPersonal', 'text', IDX], ['Area', 'text'], ['Cargo', 'text'],
        ['Tipo', 'text'], ['Desde', 'datetime', IDX], ['Hasta', 'datetime', IDX], ['Estado', 'text'], ['Detalle', 'note'],
        ['RegistradoPorNombre', 'text'], ['AnuladoPor', 'text'], ['MotivoAnulacion', 'text'], ['FechaAnulacion', 'datetime'], ['JefeId', 'text', IDX]]
    },
    AP_Verificaciones: {
      titulo: 'Nombre de la persona',
      desc: 'Verificación por el Director de las novedades de puntualidad, salida y lectura (no se edita ni se borra)',
      cols: [
        ['IdLocal', 'text', UNQ], ['MovimientoId', 'text', IDX], ['Novedad', 'text'], ['Resultado', 'text'], ['Nota', 'note'],
        ['VerificadoPor', 'text'], ['FechaHora', 'datetime', IDX], ['Hash', 'text']
      ]
    },
    AP_Bitacora: {
      titulo: 'Acción',
      desc: 'Bitácora de actuaciones administrativas (habilitaciones, cargas, exportaciones)',
      cols: [['Accion', 'text'], ['Usuario', 'text'], ['FechaHora', 'datetime', IDX], ['Referencia', 'text'], ['Detalle', 'note'], ['Hash', 'text']]
    },
    AP_Elementos: {
      titulo: 'Nombre de la persona',
      desc: 'Control de ingreso y salida de elementos, herramientas y equipos (lo registra la Dirección de Seguridad Integral; el vigilante lo verifica al leer el QR)',
      cols: [
        ['Token', 'text', IDX], ['PersonaTipo', 'text'], ['PersonaDoc', 'text', IDX], ['PersonaEmpresa', 'text'],
        ['Sentido', 'text', IDX], ['Estado', 'text', IDX], ['FechaPrevista', 'datetime', IDX], ['AutorizadoPor', 'text'],
        ['Items', 'note'], ['Fotos', 'note'],
        ['Vigilante', 'text'], ['VigilanteUsuario', 'text'], ['FechaConfirmacion', 'datetime'], ['NotaPorteria', 'note'],
        ['Observaciones', 'note'], ['CreadoPor', 'text'], ['FechaCreacion', 'datetime', IDX],
        ['AutorizadoPorId', 'text'], ['AutorizadoPorDoc', 'text'], ['AutorizadoPorCargo', 'text'],
        // Elementos que salen y deben regresar: la salida queda enlazada a un registro de regreso (EsRegreso) que el
        // vigilante verifica cuando los elementos vuelven. Avisos y recordatorios a la persona por WhatsApp o correo.
        ['DebeRegresar', 'bool'], ['FechaRegresoPrevista', 'datetime'], ['EsRegreso', 'bool'], ['SalidaId', 'text'], ['RegresoId', 'text'],
        ['AvisoPersona', 'datetime'], ['Recordatorios', 'number'], ['UltimoRecordatorio', 'datetime']
      ]
    }
  };

  AP.CAT = {
    tiposPersona: ['Personal propio', 'Personal de finca', 'Contratista', 'Conductor / transportador'],
    tiposDoc: ['CC', 'CE', 'PA', 'PPT', 'TI', 'NIT', 'Otro'],
    vehiculos: ['', 'Automóvil', 'Camioneta', 'Motocicleta', 'Bicicleta', 'Camión', 'Tractocamión', 'Furgón', 'Otro'],
    roles: ['Administrador', 'Analista', 'Gobierno Corporativo', 'Jefe de Producción', 'Talento Humano', 'Supervisor', 'Vigilante', 'Rondero'],
    // Clase de personal propio. Talento Humano ve en planta, por defecto, a los operarios y al personal operativo.
    tiposPersonal: ['Operario', 'Personal operativo', 'Administrativo', 'Calidad', 'Mantenimiento', 'Logística', 'Seguridad', 'Otro'],
    clasesOperativas: ['Operario', 'Personal operativo'],
    // Ausencias que registra Talento Humano. Incapacidades, licencias de maternidad o paternidad y demás asuntos de salud se
    // registran como «Ausencia justificada (reservada)», sin diagnóstico (dato sensible, art. 5 Ley 1581 de 2012).
    tiposAusencia: ['Vacaciones', 'Permiso remunerado (día completo)', 'Permiso no remunerado (día completo)', 'Licencia (luto, calamidad u otra legal)',
      'Ausencia justificada (reservada)', 'Suspensión', 'Otra'],
    rolesPin: ['Vigilante', 'Supervisor', 'Rondero'],
    motivosBaja: ['Retiro del servicio informado por el contratista', 'Cambio de puesto o rotación informado por el contratista',
      'Terminación del contrato de vigilancia', 'Retiro o cambio de cargo del trabajador de Avo Pak', 'Credencial comprometida (PIN conocido por terceros)', 'Otro'],
    estadosVisita: ['Pendiente', 'Aprobada', 'Rechazada', 'Cancelada'],
    categoriasManual: ['Visitante no anunciado', 'Autoridad', 'Personal propio sin carné', 'Personal de finca sin carné', 'Contratista sin carné', 'Conductor / transportador'],
    tiposVisitaAutoridad: ['Inspección', 'Verificación', 'Registro / requisa', 'Notificación', 'Apoyo operativo',
      'Recepción de denuncia', 'Seguimiento', 'Incautación / decomiso', 'Citación', 'Otra'],
    entidades: ['Policía Nacional', 'Fiscalía General de la Nación', 'Ejército Nacional', 'DIAN', 'ICA', 'INVIMA',
      'Ministerio del Trabajo', 'Superintendencia', 'Alcaldía / ente territorial', 'Migración Colombia', 'Otra'],
    // Inspección de 17 puntos (tractocamión y remolque/contenedor) según la práctica CTPAT,
    // más verificación de contaminación agrícola. Debe validarse contra el procedimiento interno vigente.
    puntos17: [
      ['p01', 'Parachoques'], ['p02', 'Motor'], ['p03', 'Llantas (camión y remolque)'], ['p04', 'Piso de la cabina'],
      ['p05', 'Tanques de combustible'], ['p06', 'Cabina y compartimientos de almacenamiento'], ['p07', 'Tanques de aire'],
      ['p08', 'Ejes de transmisión'], ['p09', 'Quinta rueda'], ['p10', 'Exterior y parte inferior (chasis)'],
      ['p11', 'Puertas exteriores e interiores y mecanismo de cierre'], ['p12', 'Piso interior del remolque o contenedor'],
      ['p13', 'Paredes laterales'], ['p14', 'Pared frontal'], ['p15', 'Techo interior y exterior'],
      ['p16', 'Unidad de refrigeración'], ['p17', 'Tubo de escape'],
      ['p18', 'Contaminación agrícola visible (plagas, tierra, material vegetal)']
    ],
    dias: [['1', 'Lun'], ['2', 'Mar'], ['3', 'Mié'], ['4', 'Jue'], ['5', 'Vie'], ['6', 'Sáb'], ['0', 'Dom']],
    // Modalidad del horario: Turno = control de llegada tarde y de salida antes de la hora; Libre = entradas y salidas libres
    // dentro de los días y horas habilitados (conductores, contratistas), sin medir llegada tarde ni salida anticipada.
    modalidadesHorario: [['Turno', 'Turno con control de puntualidad y salida'], ['Libre', 'Acceso libre dentro del horario']],
    motivosCierreSesion: ['Se retiró sin cerrar el turno', 'Cambio de turno: el relevo ya ingresó', 'Celular perdido, dañado o en poder de otra persona', 'Otro'],
    tiposPermiso: ['Ingreso tardío', 'Salida anticipada', 'Salida temporal (cita o diligencia)', 'Ingreso y salida fuera de horario'],
    // Salida anticipada: la persona no regresa, así que el permiso no lleva hora final (vale desde la hora indicada hasta el fin del día)
    permisosSinFin: ['Salida anticipada'],
    resultadosVerificacion: ['Justificada', 'No justificada', 'Pendiente de soporte'],
    operacionesCarga: ['Ingreso de vehículo de carga', 'Salida / despacho con carga', 'Salida en vacío', 'Ingreso de contenedor vacío'],
    sentidosElemento: ['Ingreso', 'Salida'],
    estadosElemento: ['Pendiente', 'Confirmado', 'Rechazado', 'Cancelado'],
    estadosSolicitud: ['Pendiente', 'Aprobada', 'Rechazada', 'Cancelada'],
    tiposNovedadRonda: ['Puerta, ventana o acceso abierto', 'Persona sospechosa', 'Objeto o paquete sospechoso', 'Cerramiento o perímetro vulnerado',
      'Daño en infraestructura o equipos', 'Iluminación deficiente', 'Fuga, derrame o goteo', 'Riesgo de incendio o eléctrico',
      'Condición insegura', 'Animal o plaga', 'Otra'],
    // Programación del servicio: D = día, N = noche, X = descanso
    turnosProg: [['D', 'Día'], ['N', 'Noche'], ['X', 'Descanso']],
    rolesProgramables: ['Vigilante', 'Supervisor', 'Rondero']
  };

  // Días hacia atrás (por fecha de registro) de los elementos que conserva el celular: cubre préstamos largos por regresar
  AP.DIAS_ELEMENTOS = 115;

  // consola: entra a la consola · ver: consulta también las pantallas del Director (solo lectura) · editar: crea, modifica y borra
  // (solo el Director) · porteria: opera la portería · planta: programa turnos y permisos de su personal a cargo · th: Talento Humano
  AP.ROLES = {
    Administrador: { consola: true, porteria: true, admin: true, ver: true, editar: true, estadisticas: true, planta: true, th: true },
    // Solo consulta y descarga (personas, visitas, ingresos y salidas, inspecciones)
    Analista: { consola: true },
    // Gerencia u órgano de gobierno: ve y descarga toda la información, sin modificar ni borrar nada
    'Gobierno Corporativo': { consola: true, ver: true, estadisticas: true },
    // Ve, consulta y programa al personal que lo tiene como jefe inmediato (turnos, programación y permisos); no borra;
    // todo cambio queda registrado
    'Jefe de Producción': { consola: true, planta: true },
    // Consulta el personal propio (sin modificarlo), registra permisos y ausencias (vacaciones, licencias), y consulta el
    // estado en planta, la programación, las horas y las estadísticas del personal
    'Talento Humano': { consola: true, th: true },
    Supervisor: { consola: false, porteria: true, historial: true },
    Vigilante: { consola: false, porteria: true },
    // El rondero solo marca los puntos de control de la ronda: no ve personas, visitas ni movimientos
    Rondero: { consola: false, porteria: false, rondas: true }
  };
  // Roles que trabajan por turnos (abren turno al ingresar y lo cierran al salir; ingresan con PIN)
  AP.ROLES_TURNO = ['Vigilante', 'Supervisor', 'Rondero'];
})();
