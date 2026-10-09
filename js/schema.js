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
        ['Observaciones', 'note']
      ]
    },
    AP_Visitas: {
      titulo: 'Nombre del visitante',
      desc: 'Prerregistro y aprobación de visitantes',
      cols: [
        ['Token', 'text', UNQ], ['Categoria', 'text'], ['TipoDoc', 'text'], ['NumDoc', 'text', IDX], ['Telefono', 'text'],
        ['Correo', 'text'], ['Empresa', 'text'], ['Motivo', 'note'], ['Anfitrion', 'text'], ['AnfitrionCorreo', 'text'],
        ['Area', 'text'], ['FechaInicio', 'datetime', IDX], ['FechaFin', 'datetime', IDX], ['Placa', 'text'],
        ['VehiculoTipo', 'text'], ['Estado', 'text', IDX], ['SolicitadoPor', 'text'], ['AprobadoPor', 'text'],
        ['FechaAprobacion', 'datetime'], ['QREnviado', 'datetime'], ['Foto', 'note'], ['Observaciones', 'note']
      ]
    },
    AP_Movimientos: {
      titulo: 'Nombre',
      desc: 'Registro de ingresos, salidas e ingresos negados (no se edita ni se borra)',
      cols: [
        ['IdLocal', 'text', UNQ], ['Sentido', 'text'], ['Resultado', 'text'], ['Categoria', 'text'], ['Origen', 'text'],
        ['Token', 'text', IDX], ['RefLista', 'text'], ['RefId', 'text'], ['TipoDoc', 'text'], ['NumDoc', 'text', IDX],
        ['Telefono', 'text'], ['Empresa', 'text'], ['Cargo', 'text'], ['Anfitrion', 'text'], ['AnfitrionCorreo', 'text'], ['Area', 'text'],
        ['Motivo', 'note'], ['Placa', 'text', IDX], ['VehiculoTipo', 'text'], ['EstadoMostrado', 'text'],
        ['Excepcion', 'bool'], ['AutorizadoPor', 'text'], ['MotivoExcepcion', 'note'], ['MotivoNegacion', 'note'],
        ['AutorizacionConfirmada', 'bool'], ['CarneEntregado', 'text'], ['DocumentoCustodia', 'bool'],
        ['CarneDevuelto', 'bool'], ['DatosAdicionales', 'note'], ['FechaHora', 'datetime', IDX], ['Vigilante', 'text'],
        ['VigilanteCorreo', 'text'], ['VigilanteUsuario', 'text'], ['TurnoId', 'text'], ['Dispositivo', 'text'], ['SinConexion', 'bool'],
        ['DesfaseReloj', 'number'], ['Porteria', 'text'], ['EntradaId', 'text'], ['InspeccionId', 'text'], ['Novedad', 'text', IDX], ['PermisoId', 'text'], ['HorarioInfo', 'text'], ['Hash', 'text'], ['Observaciones', 'note']
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
        ['AltaPor', 'text'], ['FechaBaja', 'datetime'], ['BajaPor', 'text'], ['MotivoBaja', 'text'], ['Observaciones', 'note']
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
        ['HoraEntrada', 'text'], ['HoraSalida', 'text'], ['VigenteDesde', 'text'], ['VigenteHasta', 'text'], ['Activo', 'bool'], ['Observaciones', 'note']
      ]
    },
    AP_Permisos: {
      titulo: 'Nombre de la persona',
      desc: 'Permisos de ingreso tardío, salida anticipada o temporal y autorizaciones especiales',
      cols: [
        ['Token', 'text', IDX], ['NumDoc', 'text', IDX], ['Tipo', 'text'], ['Desde', 'datetime', IDX], ['Hasta', 'datetime', IDX],
        ['Estado', 'text'], ['Detalle', 'note'], ['AutorizadoPor', 'text'], ['AnuladoPor', 'text'], ['MotivoAnulacion', 'text']
      ]
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
    }
  };

  AP.CAT = {
    tiposPersona: ['Personal propio', 'Contratista', 'Conductor / transportador'],
    tiposDoc: ['CC', 'CE', 'PA', 'PPT', 'TI', 'NIT', 'Otro'],
    vehiculos: ['', 'Automóvil', 'Camioneta', 'Motocicleta', 'Bicicleta', 'Camión', 'Tractocamión', 'Furgón', 'Otro'],
    roles: ['Administrador', 'Analista', 'Supervisor', 'Vigilante'],
    rolesPin: ['Vigilante', 'Supervisor'],
    motivosBaja: ['Retiro del servicio informado por el contratista', 'Cambio de puesto o rotación informado por el contratista',
      'Terminación del contrato de vigilancia', 'Retiro o cambio de cargo del trabajador de Avo Pak', 'Credencial comprometida (PIN conocido por terceros)', 'Otro'],
    estadosVisita: ['Pendiente', 'Aprobada', 'Rechazada', 'Cancelada'],
    categoriasManual: ['Visitante no anunciado', 'Autoridad', 'Personal propio sin carné', 'Contratista sin carné', 'Conductor / transportador'],
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
    tiposPermiso: ['Ingreso tardío', 'Salida anticipada', 'Salida temporal (cita o diligencia)', 'Ingreso y salida fuera de horario'],
    resultadosVerificacion: ['Justificada', 'No justificada', 'Pendiente de soporte'],
    operacionesCarga: ['Ingreso de vehículo de carga', 'Salida / despacho con carga', 'Salida en vacío', 'Ingreso de contenedor vacío']
  };

  AP.ROLES = {
    Administrador: { consola: true, porteria: true, admin: true },
    Analista: { consola: true, porteria: true, admin: false },
    Supervisor: { consola: false, porteria: true, historial: true },
    Vigilante: { consola: false, porteria: true }
  };
  // Roles que operan la portería por turnos (abren turno al ingresar y lo cierran al salir)
  AP.ROLES_TURNO = ['Vigilante', 'Supervisor'];
})();
