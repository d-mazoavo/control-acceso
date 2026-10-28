/* Contenido del manual de uso (instructivo) de la aplicación Control de Acceso.
 * Se actualiza con cada versión de la aplicación: appVersion debe coincidir con AP.VERSION; si no coincide, la pantalla
 * del manual lo advierte. Los valores entre llaves ({pendiente}, {antelacion}…) se toman de la configuración vigente.
 * Perfiles: 'todos' o los nombres de rol (Administrador, Analista, Gobierno Corporativo, Jefe de Producción,
 * Talento Humano, Supervisor, Vigilante, Rondero). */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var PORT = ['Vigilante', 'Supervisor', 'Administrador'];

  AP.MANUAL = {
    titulo: 'Instructivo de uso de la aplicación Control de Acceso',
    codigo: 'Por asignar (Dirección de Calidad)',
    version: '05',
    fecha: '2026-10-27',
    appVersion: '1.0.0',
    secciones: [
      { id: 'objetivo', titulo: 'Objetivo', roles: ['todos'], bloques: [
        { p: 'Establecer la forma de uso de la aplicación Control de Acceso de Avo Pak S.A.S. para registrar y verificar el ingreso y la salida de personas, visitantes y vehículos, las inspecciones de vehículos de carga, el control de elementos, las rondas de seguridad, la programación de turnos de planta y las ausencias del personal, con trazabilidad e integridad de los registros.' }
      ] },
      { id: 'alcance', titulo: 'Alcance', roles: ['todos'], bloques: [
        { p: 'Aplica a la portería principal de la planta de La Ceja y a todos los usuarios de la aplicación: Director de Seguridad Integral (Administrador), Analista, Gobierno Corporativo, Jefe de Producción, Talento Humano, y al personal del contratista de vigilancia (supervisores, vigilantes y ronderos).' },
        { p: 'La aplicación es una herramienta de control de acceso y de seguridad. Las horas en planta que muestra no constituyen por sí solas la liquidación de nómina, y la programación del personal del contratista de vigilancia corresponde al contratista y a su supervisor.' }
      ] },
      { id: 'definiciones', titulo: 'Definiciones', roles: ['todos'], bloques: [
        { tabla: { cab: ['Término', 'Significado'], filas: [
          ['Credencial o QR', 'Código personal e intransferible de cada persona habilitada o de cada visita aprobada. No contiene datos personales: es un identificador aleatorio.'],
          ['Movimiento', 'Registro de un ingreso, una salida o un ingreso negado. Queda firmado por el servidor con el usuario y la hora, y no se modifica.'],
          ['Novedad', 'Situación que queda señalada para verificación del Director: llegada tardía, ingreso sin QR, salida no autorizada, ingreso en día no programado, entre otras.'],
          ['Solicitud de ingreso', 'Caso que el vigilante no puede autorizar (llegada tardía desde {pendiente} minutos, fuera de turno, día no programado o de descanso, ausencia registrada por Talento Humano). Decide el Director desde la consola.'],
          ['Permiso', 'Autorización registrada para ingresar tarde, salir antes, salir temporalmente o entrar y salir fuera de horario.'],
          ['Ausencia', 'Vacaciones, permiso de día completo, licencia u otra ausencia registrada por Talento Humano.'],
          ['Turno de planta', 'Turno con código, hora de entrada y hora de salida con el que el Jefe de Producción programa a su personal a cargo.'],
          ['Jefe inmediato', 'Persona registrada (del personal propio) que figura como superior en la ficha de cada persona, sea esta personal propio, contratista u otro tipo. El Jefe de Producción ve, consulta y programa solo a quienes lo tienen como jefe inmediato y están habilitados.'],
          ['Horario fijo', 'Horario de entrada y salida para los días de la semana (por ejemplo, lunes a viernes de 08:00 a 17:00) que el Director o el jefe inmediato asignan a una persona que no rota por turnos. La portería le aplica control de puntualidad.'],
          ['Número de uniforme', 'Número del uniforme asignado a cada persona. Lo registran el Director, el jefe inmediato y Talento Humano.'],
          ['Empresa (persona jurídica)', 'Empresa registrada por el Director con nombre o razón social, NIT y logo. Toda persona natural se vincula a una empresa ya creada.'],
          ['Cargo', 'Cargo del catálogo que administra el Director. Al asignarlo a una persona propone su área y su clase de personal.'],
          ['Clase de personal', 'Clasificación del personal propio (operario, personal operativo, administrativo, calidad, mantenimiento, logística, seguridad u otro). Talento Humano ve en planta, por defecto, a los operarios y al personal operativo.'],
          ['Alerta de salida', 'Marca que el Director pone a una persona para ser avisado cuando salga. No impide la salida.'],
          ['Revista', 'Paso del rondero por un punto de control, registrado con la lectura del QR del punto.'],
          ['Huella SHA-256', 'Código que identifica un archivo o registro: si el contenido cambia, la huella cambia. Permite demostrar que una exportación no fue alterada.']
        ] } }
      ] },
      { id: 'documentos', titulo: 'Documentos relacionados', roles: ['todos'], bloques: [
        { ul: [
          'AP-SG-PD-001 Procedimiento de acceso de personal interno.',
          'AP-SG-PD-002 Procedimiento de acceso de visitantes.',
          'AP-SG-PD-003 Procedimiento de acceso de contratistas.',
          'AP-AC-PD-001 Procedimiento de control documental.',
          'Constitución Política de Colombia, artículos 15, 24 y 28 (intimidad y habeas data, libre circulación y libertad personal).',
          'Ley 1581 de 2012 (protección de datos personales).',
          'Código Sustantivo del Trabajo, artículo 160, modificado por la Ley 2466 de 2025 (trabajo diurno y nocturno); Ley 2101 de 2021 (reducción de la jornada laboral); Ley 51 de 1983 (días festivos).'
        ] },
        { nota: 'Los códigos de los procedimientos deben verificarse contra el listado maestro de documentos (AP-CA-FT-001) antes de la aprobación de este instructivo.' }
      ] },
      { id: 'perfiles', titulo: 'Perfiles de usuario y permisos', roles: ['todos'], bloques: [
        { tabla: { cab: ['Perfil', 'Qué puede hacer', 'Qué no puede hacer'], filas: [
          ['Administrador (Director de Seguridad Integral)', 'Todo: crea, modifica y borra en la consola; administra empresas, cargos y usuarios (único perfil que ve «Usuarios»); aprueba visitas y solicitudes de ingreso; habilita e inhabilita personas; programa horarios y permisos; administra rondas, programación de planta y ausencias; consulta estadísticas; opera la portería.', '—'],
          ['Analista', 'Consulta y descarga: panel, personas, visitas, ingresos y salidas, inspecciones.', 'Crear, aprobar, modificar o borrar. Operar la portería.'],
          ['Gobierno Corporativo', 'Consulta y descarga la información, incluidas estadísticas, bitácora, planta y Talento Humano.', 'Crear, aprobar, modificar o borrar. Ver el ítem «Usuarios».'],
          ['Jefe de Producción', 'Ve, consulta y filtra al personal habilitado que lo tiene como jefe inmediato; crea turnos con horario, asigna personas a los turnos, programa la semana, asigna horarios fijos, registra y anula permisos de su personal, actualiza el número de uniforme, consulta su estado en planta y sus estadísticas, y descarga la programación por turnos.', 'Ver visitantes o personal de otros jefes. Modificar los demás datos de las personas. Borrar cualquier registro. Decidir solicitudes de ingreso.'],
          ['Talento Humano', 'Consulta el personal propio y a las personas con jefe inmediato asignado (aunque sean de otra empresa) y la ficha de cada una; registra y anula permisos y ausencias (vacaciones, licencias) de ese personal; actualiza el número de uniforme; ve el estado en planta, todo lo programado a cada persona por los Jefes de Producción, las horas según portería y las estadísticas del personal.', 'Modificar los demás datos de las personas. Ver visitantes. Borrar registros. Modificar la programación.'],
          ['Supervisor y Vigilante', 'Operan la portería por turnos: leen QR, registran ingresos y salidas, inspecciones, elementos, solicitudes al Director. El supervisor consulta además el historial.', 'Modificar o borrar registros. Autorizar lo que corresponde al Director.'],
          ['Rondero', 'Marca los puntos de control de la ronda y reporta novedades con fotografía; ve su avance y su cumplimiento.', 'Ver personas, visitas o movimientos.']
        ] } },
        { p: 'Los permisos se hacen cumplir en el servidor (reglas de seguridad de Firebase): aunque alguien intente una acción por fuera de su perfil, el servidor la rechaza.' }
      ] },
      { id: 'ingreso', titulo: 'Ingreso a la aplicación, contraseña o PIN e idioma', roles: ['todos'], bloques: [
        { ol: [
          'Abra la dirección de la aplicación en el navegador del celular o del computador (o el ícono instalado).',
          'Escriba su usuario y su contraseña o PIN. Nadie usa correo para ingresar.',
          'La primera vez, o después de un restablecimiento, la aplicación exige cambiar la clave temporal (vence a las {horasPin} horas). Vigilantes, supervisores y ronderos usan un PIN de 6 a 8 dígitos; los demás perfiles, una contraseña de al menos 10 caracteres con letras y números.',
          'Vigilantes, supervisores y ronderos abren su turno al ingresar y lo cierran con «Cerrar turno»: sus registros quedan a su nombre.',
          'Si el Director le cambia el perfil (por ejemplo, de vigilante a rondero), el celular cierra el turno y la sesión en su siguiente actualización; al volver a ingresar verá el panel y las actividades del nuevo perfil.',
          'Para ver la aplicación en inglés, use el selector ES / EN (en la consola, abajo en el menú lateral; en el celular, al pie de la pantalla de inicio). Se traduce toda la pantalla: menús, títulos, botones, formularios, tablas, avisos y este manual. La elección queda guardada en ese equipo.',
          'Siguen en español los datos registrados, los archivos que se descargan (Excel, Word, PDF), las credenciales, los mensajes de WhatsApp y correo, y los textos legales que se aceptan (aviso de privacidad, autorización de datos y condiciones de uso de la credencial), porque la versión en español es la que tiene valor jurídico.'
        ] },
        { nota: 'La contraseña o el PIN son personales e intransferibles. Quien los preste responde por los registros hechos a su nombre.' }
      ] },
      { id: 'porteria', titulo: 'Portería: lectura del QR y registro de ingresos y salidas', roles: PORT, bloques: [
        { ol: [
          'Oprima «Leer código QR» y enfoque la credencial o el QR del visitante. El sistema determina si corresponde a un ingreso o a una salida según el último registro; el vigilante no lo elige.',
          'Lea el resultado: verde (HABILITADO), amarillo (PENDIENTE de verificación: se registra y queda como novedad) o rojo (NEGADO o REQUIERE APROBACIÓN DEL DIRECTOR).',
          'Coteje la fotografía y el documento de identidad. Si la persona trae elementos registrados por el Director, márquelos antes de registrar.',
          'Oprima el botón del registro que corresponda. Si no hay internet, el registro se guarda en el celular y se envía solo cuando haya señal.'
        ] },
        { h: 'Reglas de puntualidad (personal con horario o con turno de planta)' },
        { ul: [
          'El ingreso se habilita desde {antelacion} minutos antes de la hora de entrada. Antes de eso aparece MUY TEMPRANO y el ingreso queda pendiente.',
          'Entre 1 y {pendienteMenos1} minutos tarde: ingreso PENDIENTE de verificación.',
          'Desde {pendiente} minutos tarde, fuera de turno, en un día no programado o de descanso, o con ausencia registrada por Talento Humano: el vigilante NO puede autorizar ni registrar el ingreso como pendiente, y la persona no ingresa mientras el Director no decida. Oprima «Enviar a aprobación del Director» y espere la decisión en la pantalla; puede avisarle por WhatsApp o llamarlo. Si el Director aprueba, oprima «Registrar INGRESO»; si rechaza, «Registrar ingreso negado».',
          'Al operario lo rige la programación semanal del Jefe de Producción; a los demás, su horario general. Esto aplica al personal propio, a los contratistas y a toda persona con horario: en un día sin turno o de descanso decide el Director.',
          'Ante una ausencia registrada, al vigilante solo se le muestra «ausencia registrada», sin el tipo (vacaciones, licencia, etc.).'
        ] },
        { h: 'Salidas' },
        { ul: [
          'La salida NUNCA se impide: nadie puede ser retenido por el personal de vigilancia (artículos 24 y 28 de la Constitución). Si la persona no tiene autorización de salida, registre «salida no autorizada» y repórtelo.',
          'Salida anticipada autorizada: aparece «SALIDA AUTORIZADA — SALIDA ANTICIPADA». No tiene hora final porque la persona no regresa en la jornada.',
          'Salida temporal: la persona debe regresar dentro del plazo leyendo su QR.',
          'ALERTA DE SALIDA DEL DIRECTOR: registre la salida normalmente y, en la ventana que aparece, avísele al Director por WhatsApp o llámelo.'
        ] },
        { h: 'Visitantes, autoridades y registro manual' },
        { ul: [
          'Visitante con QR: confirme que autorizó el tratamiento de datos y que recibió la inducción; registre el ingreso y avise a su anfitrión con el botón de WhatsApp. El QR solo vale en el lapso aprobado por el Director.',
          'Visitante no anunciado: en «Registro manual» diligencie la solicitud; el Director la aprueba o la rechaza y, si aprueba, se le envía el QR. Si el documento corresponde a una persona registrada (personal propio, contratista o conductor), la aplicación no la tramita como visitante: debe ingresar con su propia credencial.',
          'Autoridades: «Autoridad» registra la visita con entidad, motivo y documento; el Director diligencia luego el formato de visita de autoridad.',
          'Persona sin carné o QR ilegible: búsquela por documento o use el registro manual; queda como ingreso por excepción con quién autorizó y por qué.'
        ] },
        { h: 'Otras opciones de la portería' },
        { ul: [
          '«Visitas de hoy», «Permisos» y «Elementos» muestran lo previsto para el turno (solo consulta). En «Visitas de hoy» el visitante desaparece de la lista al registrar su ingreso, porque ya está dentro.',
          'Todas las listas tienen un filtro de texto: escriba parte del nombre, documento, empresa u otro dato para ver solo lo que coincide.',
          '«Vehículo de carga»: inspección de 17 puntos más contaminación agrícola, precintos (verificación VVTT) y fotografías con su huella.',
          '«Personas dentro» muestra quién está en las instalaciones.',
          '«Mi turno» muestra los registros del celular y lo pendiente por enviar; desde allí se cierra el turno.'
        ] }
      ] },
      { id: 'rondas', titulo: 'Rondas de seguridad (rondero)', roles: ['Rondero', 'Administrador'], bloques: [
        { p: 'El panel de rondas muestra el cumplimiento del turno: revistas que cuentan sobre las exigidas, puntos completos, revistas pendientes y novedades reportadas, y por cada punto su avance (por ejemplo, 1/3) y desde qué hora cuenta la siguiente revista.' },
        { ol: [
          'Oprima «Marcar punto de control» y lea el QR fijado en el punto.',
          'Elija «Sin novedad» o «Con novedad». Si hay novedad, indique el tipo, descríbala y tome hasta 3 fotografías (sin captar rostros cuando no sea necesario).',
          'Oprima «Registrar marcación». Si hay novedad, avise de inmediato al Director con el botón de WhatsApp.',
          'Si el QR del punto está dañado, use «Sin QR» y escriba la justificación: la marcación queda señalada para revisión.',
          'Al terminar, oprima «Cerrar turno»: se muestra y se registra el porcentaje de cumplimiento de la ronda.'
        ] },
        { nota: 'Cada punto tiene una meta fijada por el Director: cuántas revistas por turno y el tiempo mínimo entre una y otra. Una revista hecha antes de ese tiempo queda registrada, pero NO cuenta para el cumplimiento; la aplicación lo avisa en el momento.' }
      ] },
      { id: 'consola-director', titulo: 'Consola del Director de Seguridad Integral', roles: ['Administrador'], bloques: [
        { h: 'Empresas y cargos' },
        { ul: [
          '«Empresas»: registre cada persona jurídica (la empresa propia, los contratistas, las transportadoras) con su nombre o razón social, NIT y logo. No se admite un NIT repetido. Una empresa con personas vinculadas no se borra: se inactiva.',
          '«Cargos»: catálogo de cargos con su área y su clase de personal.',
          'Para las personas registradas antes de esta versión, abra la empresa o el cargo y use «Vincular personas con este nombre» (o «con este cargo escrito»): las personas que lo tenían escrito quedan vinculadas.'
        ] },
        { h: 'Personas' },
        { ul: [
          'Registre a cada persona con su tipo (personal propio, personal de finca, contratista, conductor), su empresa (obligatoria, de la lista de Empresas), su cargo (de la lista de Cargos), su número de uniforme, su jefe inmediato y, si es personal propio, su clase de personal.',
          'El jefe inmediato puede asignarse a cualquier persona (también a contratistas) y se busca entre el personal propio habilitado. El Jefe de Producción ve y programa solo a quienes lo tienen como jefe inmediato y están habilitados; Talento Humano incluye a esas personas en su consulta. Al cambiar el jefe en la ficha, los permisos y ausencias vigentes o futuros y los horarios fijos del jefe anterior pasan al nuevo jefe.',
          'La búsqueda de Personas busca solo en los datos de cada persona (nombre, documento, empresa, cargo, área, placa y uniforme), no en el nombre de su jefe. Para ver al personal de un jefe use el filtro «jefe inmediato».',
          'La carga masiva por Excel incluye «NIT empresa», «Cargo», «Documento jefe inmediato» y «Número de uniforme»: la empresa y el cargo deben existir; el jefe debe estar registrado o venir en el mismo archivo.',
          '«Inhabilitar» impide el ingreso de inmediato (con motivo, que ve el vigilante). La campana activa la «alerta de salida»: no impide la salida, pero el vigilante le avisa y la consola le muestra el aviso.',
          'Credenciales: imprimir carné, descargar la imagen, enviar por WhatsApp o correo, o regenerar (la anterior deja de funcionar). Carga masiva por Excel con la plantilla.'
        ] },
        { h: 'Visitas y solicitudes de ingreso' },
        { ul: [
          'Visitas: prerregistro, aprobación o rechazo con justificación, envío del QR, aviso al anfitrión y libro de ingresos y salidas de visitantes. La pestaña «Hoy» muestra por defecto las visitas por llegar; al ingresar el visitante sale de esa lista (filtre «Dentro» o «Ya salieron» para verlas).',
          'Si registra una visita para una persona que ya tiene autorizado el ingreso ese día y a esa hora (ingreso libre, turno, permiso o acceso sin horario), la aplicación lo informa y no registra la visita: la persona entra con su credencial.',
          'Solicitudes de ingreso: aprobar (se crea un permiso de corta duración) o rechazar, con justificación sin datos de salud.'
        ] },
        { h: 'Horarios, permisos y novedades' },
        { ul: [
          'Horarios: horario general de cada persona (turno con control de puntualidad o acceso libre). Para los operarios, la programación semanal de planta reemplaza el horario general en esas fechas.',
          'Permisos: ingreso tardío, salida anticipada (sin hora final), salida temporal o ingreso y salida fuera de horario, con quién autoriza elegido de la lista de personas.',
          'Novedades: verifique cada novedad (justificada, no justificada o pendiente de soporte); la verificación queda registrada sin modificar el registro original.'
        ] },
        { h: 'Elementos, usuarios, rondas y programación' },
        { ul: [
          'Elementos: registre lo que sale, ingresa o debe regresar; el vigilante lo verifica al leer el QR de la persona.',
          'Usuarios (solo el Director lo ve; es el último ítem del menú): para crear un usuario, busque a la persona ya registrada en Personas y asígnele el perfil y el usuario; su nombre, documento, empresa y cargo salen de la ficha. Alta con PIN temporal (se muestra una sola vez), restablecimiento, baja y cierre de turnos abiertos. Los usuarios anteriores se vinculan con «Editar datos». Al cambiar el perfil de un usuario con turno abierto, su celular cierra el turno y le pide ingresar de nuevo.',
          'Rondas: puntos de control con su QR y su meta (revistas por turno y tiempo mínimo entre revistas), marcaciones y cumplimiento por turno.',
          'Programación: programación mensual del servicio de vigilancia que remite el contratista, para verificar el cubrimiento.',
          'Instalación: estado de la conexión. Las consultas del Jefe de Producción y de Talento Humano ya no necesitan índices compuestos; los dos índices de la sección «Índices de la base de datos» son opcionales y solo permiten que esos perfiles vean los ingresos y salidas registrados antes de la actualización de octubre de 2026.',
          'Al ingresar, la sesión del Director completa en segundo plano, una vez al día, los datos que necesitan esas consultas (ámbito de Talento Humano, mes y jefe inmediato vigente de permisos, ausencias y horarios recientes). Los ingresos y salidas no se modifican.'
        ] }
      ] },
      { id: 'planta', titulo: 'Personal a cargo y programación de planta (Jefe de Producción)', roles: ['Jefe de Producción', 'Administrador', 'Gobierno Corporativo'], bloques: [
        { p: 'El Jefe de Producción ve únicamente a las personas habilitadas que lo tienen como jefe inmediato en su ficha (si el Director inhabilita a una persona, sale de sus listas). Su usuario debe estar vinculado a su propia ficha en Personas (lo hace el Director en Usuarios). El Director y Gobierno Corporativo eligen arriba el grupo de cada jefe.' },
        { h: 'Mi personal' },
        { p: 'Muestra a cada persona a cargo con su número de uniforme, su turno de hoy y su estado según la portería (en planta, fuera, no ha llegado, ya salió, con ausencia), con filtros por área, cargo, estado y texto, y descarga en Excel. «Ficha» abre los datos de la persona (solo consulta), su programación de los próximos 7 días, sus permisos y sus ausencias, y permite cambiar su número de uniforme. «Números de uniforme» permite registrar o corregir varios a la vez.' },
        { p: 'Si una consulta secundaria no responde (por ejemplo, sin conexión), el personal se muestra igual con un aviso. Los ingresos y salidas registrados antes de la actualización de octubre de 2026 pueden no aparecer: la pantalla lo advierte.' },
        { h: 'Turnos y asignación' },
        { p: 'Cree los turnos con un código de 1 a 3 caracteres y su hora de entrada y de salida (por ejemplo, T1 06:00–14:00, T2 14:00–22:00, T3 22:00–06:00). Si la hora de salida es menor que la de entrada, el turno termina al día siguiente. Un turno no se borra: se marca inactivo. Con «Asignar turno a personas» (o «Asignar personas» en cada turno) elija el turno, el rango de fechas, los días de la semana y las personas: la programación de cada semana se guarda sola y queda en el registro de cambios.' },
        { h: 'Horarios fijos' },
        { p: 'Para el personal que no rota por turnos (por ejemplo, de lunes a viernes de 08:00 a 17:00): «Horarios fijos» → «Asignar horario fijo», escriba el nombre del horario, la hora de entrada y de salida, los días y, si quiere, la vigencia, y elija las personas. La portería le aplica control de puntualidad igual que a los turnos. Los horarios no se borran: se desactivan. En las semanas en que la persona figure en la programación semanal, esa programación reemplaza el horario fijo. Cada cambio queda en el registro de cambios.' },
        { h: 'Programación semanal' },
        { ol: [
          'En «Programación semanal» elija la semana con las flechas o la fecha.',
          'Elija el turno en el «Pincel» y haga clic (o arrastre) sobre los días de cada persona. «D» es descanso y «Quitar» deja el día sin turno.',
          'Use «Aplicar patrón» para asignar un turno por día de la semana a varias personas, o «Copiar semana anterior».',
          'Revise la columna de horas: en rojo, quienes superan {maxSemanal} horas programadas en la semana (jornada máxima ordinaria de referencia).',
          'Oprima «Guardar semana». Si cambia un día que ya empezó (hoy o anteriores), la aplicación exige el motivo.'
        ] },
        { ul: [
          'La portería aplica a esta programación las mismas reglas de puntualidad de la sección de portería.',
          'Las celdas rayadas indican una ausencia registrada por Talento Humano.',
          'Si otra persona guarda la misma semana mientras usted la edita, la aplicación no sobrescribe: le pide recargar.',
          '«Excel por turnos» descarga, para el periodo que elija (hasta 92 días), una hoja por turno con quién está en cada turno día por día, una hoja de descansos y un resumen.'
        ] },
        { h: 'Permisos del personal' },
        { p: 'Registre permisos de ingreso tardío, salida anticipada (sin hora final), salida temporal o ingreso y salida fuera de horario para su personal. Elija siempre el motivo del catálogo (citas médicas sin diagnóstico, calamidad doméstica, votación, jurado, acudiente escolar, citaciones, luto, matrimonio, maternidad, paternidad, permisos no remunerados, entre otros): cada uno indica si es remunerado por ley, por acuerdo o no remunerado, su fundamento y el soporte esperado. Su solicitud no se aplica de inmediato: queda «Por autorizar» y se envía al Jefe de Recursos Humanos, que la autoriza o la rechaza con justificación. La portería solo aplica los permisos autorizados. Mientras esté pendiente, usted puede cancelar la solicitud. Un permiso no se borra: se anula con motivo.' },
        { h: 'Estadísticas y registro de cambios' },
        { ul: [
          '«Estadísticas» muestra, para el periodo elegido, la asistencia a los turnos programados (por turno, por día y por persona), las llegadas tarde, los días de ausencia, los permisos y las horas en planta según portería, con descarga en Excel.',
          '«Registro de cambios» conserva cada cambio de programación, turnos, permisos y ausencias, con el usuario verificado por el servidor, la hora y el motivo. Nadie puede modificarlo ni borrarlo.'
        ] },
        { nota: 'El Director de Seguridad Integral está por encima de esta programación: puede modificarla e inhabilitar el ingreso de cualquier persona. Las llegadas tarde desde {pendiente} minutos las decide el Director.' }
      ] },
      { id: 'th', titulo: 'Talento Humano', roles: ['Talento Humano', 'Administrador', 'Gobierno Corporativo'], bloques: [
        { h: 'Personal' },
        { p: 'Lista el personal propio de Avo Pak y a las personas de otras empresas que tienen jefe inmediato asignado, con filtros por clase, área, cargo, jefe inmediato y estado. «Ficha» muestra los datos de la persona (solo consulta), su programación de la semana, sus permisos y sus ausencias. Talento Humano no modifica los datos de las personas (los registra y corrige el Director de Seguridad Integral), salvo el número de uniforme: en la ficha o con «Números de uniforme».' },
        { h: 'Permisos' },
        { p: 'Registre permisos por horas del personal propio y de las personas con jefe inmediato asignado, aunque no estén a cargo del Jefe de Producción (ingreso tardío, salida anticipada, salida temporal, ingreso y salida fuera de horario). La portería los aplica al leer el QR. Las solicitudes de los jefes aparecen «Por autorizar»: oprima «Decidir», revise el motivo, su fundamento legal y el soporte esperado, y autorice o rechace (el rechazo exige justificación). Los permisos remunerados por ley solo se rechazan si no se cumplen los requisitos de aviso o soporte. Al autorizar una licencia de uno o más días se crea la ausencia correspondiente. Un permiso no se borra: se anula con motivo.' },
        { h: 'Vacaciones y ausencias' },
        { ol: [
          'En «Vacaciones y ausencias» oprima «Registrar ausencia», busque a la persona y elija el tipo.',
          'Indique desde y hasta (inclusive). Si se cruza con otra ausencia, la aplicación lo advierte.',
          'En «Detalle» escriba, si quiere, una referencia interna. No escriba diagnósticos ni datos de salud.',
          'Para cancelarla, use «Anular» con el motivo. Las ausencias no se borran.'
        ] },
        { nota: 'Incapacidades, licencias de maternidad o paternidad y demás asuntos de salud se registran como «Ausencia justificada (reservada)», sin la causa: los datos de salud son sensibles (artículo 5 de la Ley 1581 de 2012) y su soporte se conserva en Talento Humano.' },
        { p: 'Mientras la ausencia esté vigente (por ejemplo, en vacaciones) no se permite el ingreso: si la persona llega, el vigilante envía la solicitud al Director de Seguridad Integral, que verifica y aprueba o rechaza.' },
        { h: 'Estado en planta' },
        { p: 'Muestra, por defecto, a los operarios y al personal operativo: quién está en planta (adentro) y quién está fuera según los registros de portería, quién no ha llegado a su turno, quién salió, quién está programado más tarde y quién tiene ausencia, con filtros y descarga en Excel.' },
        { h: 'Programación de turnos' },
        { ul: [
          '«Todo lo programado, por persona»: para el periodo elegido (hasta 62 días) muestra a cada persona con los días con turno, los descansos, las horas programadas y los días sin programación; «Día por día» abre el detalle (turno u horario, hora, fuente y ausencia registrada). Filtre por jefe inmediato o por texto y descargue el Excel (resumen y detalle por día).',
          '«Semana por jefe inmediato»: la cuadrícula semanal de cada Jefe de Producción, solo consulta, con el Excel por turnos.'
        ] },
        { h: 'Horas según portería' },
        { ol: [
          'Elija el periodo (semana, quincena, mes o rango) y oprima «Calcular».',
          'Filtre por clase de personal, área o persona. Haga clic en una persona para ver el detalle por día.',
          'Descargue el Excel: hoja «Resumen», hoja «Detalle por día» y hoja «Información» con los parámetros y la huella del archivo.'
        ] },
        { ul: [
          'Las horas son el tiempo entre la entrada y la salida registradas en portería, divididas en diurnas ({diurno} a {nocturno}), nocturnas ({nocturno} a {diurno}) y en domingo o festivo de Colombia.',
          'No descuentan pausas ni califican horas extra o recargos: Talento Humano las valida antes de liquidar la nómina.',
          'Los registros incompletos (ingreso sin salida o salida sin ingreso) no suman horas hasta que se aclaren.'
        ] },
        { h: 'Estadísticas del personal' },
        { p: 'Composición del personal propio por clase y área, presencia en planta en el momento, asistencia a los turnos programados por jefe inmediato, días de ausencia por tipo y permisos por tipo del periodo, con descarga en Excel.' }
      ] },
      { id: 'consulta', titulo: 'Consulta y descargas (Analista y Gobierno Corporativo)', roles: ['Analista', 'Gobierno Corporativo', 'Administrador'], bloques: [
        { ul: [
          'Todas las listas tienen búsqueda o filtro de texto (sin importar tildes) y se descargan en Excel con lo filtrado.',
          'Cada descarga queda anotada en la bitácora con su huella SHA-256: permite demostrar después que el archivo no fue alterado.',
          'En los perfiles de consulta, las fichas se abren solo para leer y no aparecen botones para crear, aprobar, modificar o borrar.'
        ] }
      ] },
      { id: 'estadisticas', titulo: 'Estadísticas e indicadores', roles: ['Administrador', 'Gobierno Corporativo'], bloques: [
        { p: 'Elija el periodo (esta semana, semana anterior, este mes, mes anterior, últimos 30 o 90 días, u otro rango de hasta 120 días) y filtre por categoría, área, empresa, persona o anfitrión.' },
        { ul: [
          'Indicadores: ingresos, personas distintas, visitantes, ingresos negados, excepciones, novedades, visitas aprobadas, solicitudes decididas, inspecciones y marcaciones de ronda.',
          'Gráficas: ingresos por día y por hora, visitas recibidas por anfitrión, ingresos por categoría, horas en planta por área y por persona, novedades por tipo y por persona, ingresos negados por motivo, empresas con más ingresos, decisiones del Director, inspecciones y rondas.',
          'Cada gráfica tiene «Ver la tabla» y todo se descarga en un Excel con una hoja por indicador.'
        ] }
      ] },
      { id: 'datos', titulo: 'Protección de datos personales y seguridad de la información', roles: ['todos'], bloques: [
        { ul: [
          'Use los datos solo para el control de acceso y la seguridad de las instalaciones. No tome capturas ni comparta información de la aplicación por otros medios.',
          'Cada perfil ve solo lo que necesita: el rondero no ve personas ni movimientos; el Jefe de Producción solo ve a su personal a cargo; Talento Humano solo ve al personal propio.',
          'No registre datos de salud (diagnósticos, tratamientos, citas médicas) en permisos, justificaciones, ausencias ni observaciones; la aplicación advierte cuando detecta estas palabras.',
          'La fotografía de una persona solo se guarda con su autorización, para el cotejo visual en portería; por eso no se muestra al Jefe de Producción ni a Talento Humano (principio de finalidad, artículo 4 de la Ley 1581 de 2012).',
          'Cierre su sesión o su turno al terminar. Si pierde el celular o cree que alguien conoce su PIN, avise de inmediato al Director para bloquearlo.'
        ] }
      ] },
      { id: 'contingencia', titulo: 'Operación sin conexión y contingencias', roles: PORT.concat(['Rondero']), bloques: [
        { ul: [
          'Sin internet, la portería y las rondas siguen funcionando con los datos guardados en el celular; los registros se envían solos al volver la señal. El indicador superior muestra «Sin conexión» o los registros pendientes.',
          'Si aparece el aviso de datos sin actualizar por más de {minSinSincronizar} minutos, una inhabilitación reciente podría no reflejarse: conéctese o verifique por teléfono con el Director.',
          'Sin conexión no se pueden enviar solicitudes al Director: llámelo o escríbale por WhatsApp; mientras no haya aprobación, la persona no ingresa.',
          'No borre los datos del navegador ni desinstale la aplicación con registros pendientes: se perderían.'
        ] }
      ] },
      { id: 'integridad', titulo: 'Integridad de los registros', roles: ['todos'], bloques: [
        { ul: [
          'Los ingresos, salidas, inspecciones, turnos, marcaciones de ronda, verificaciones y la bitácora no se modifican; cada uno queda firmado por el servidor con el usuario y la hora del servidor.',
          'Solo el Director de Seguridad Integral puede borrar registros, y solo en las listas que lo permiten. El registro de cambios de la programación de planta y de las ausencias no lo puede modificar ni borrar nadie.',
          'Las fotografías de inspecciones y rondas conservan su huella SHA-256.'
        ] }
      ] }
    ],
    // Historial de versiones del manual (se muestra en la aplicación al Director, Analista y Gobierno Corporativo)
    cambios: [
      { version: '01', fecha: '2026-10-22', descripcion: 'Versión inicial del instructivo, acorde con la versión 1.0.0 de la aplicación: perfiles de solo consulta, Gobierno Corporativo, Jefe de Producción y Talento Humano; programación de planta; ausencias; horas en planta; salida anticipada sin hora final; alerta de salida; metas de ronda; estadísticas; idioma del menú.' },
      { version: '02', fecha: '2026-10-22', descripcion: 'Empresas (personas jurídicas) y catálogo de cargos; jefe inmediato en la ficha de la persona; usuarios creados desde una persona registrada y visibles solo para el Director; panel del Jefe de Producción por personal a cargo (turnos, asignación, estadísticas, Excel por turnos, ficha de consulta); Talento Humano con personal, permisos, programación, estadísticas y horas según portería; filtro en todas las listas; visitas por llegar; bloqueo de visitas de personas con ingreso autorizado; cierre de sesión al cambiar el perfil.' },
      { version: '03', fecha: '2026-10-24', descripcion: 'Consultas del Jefe de Producción y de Talento Humano sin índices compuestos; número de uniforme (Director, jefe inmediato y Talento Humano); jefe inmediato para cualquier tipo de persona; el Jefe de Producción solo ve personal habilitado; horarios fijos asignados por el jefe; Talento Humano con permisos y consulta de las personas con jefe inmediato y con todo lo programado por persona; búsqueda de Personas solo por los datos de la persona; «Usuarios» al final del menú; traducción completa de la pantalla al inglés.' },
      { version: '04', fecha: '2026-10-26', descripcion: 'El ingreso en un día no programado o de descanso, de cualquier persona con horario (personal propio, contratistas y demás), lo decide el Director de Seguridad Integral: el vigilante envía la solicitud y la persona no ingresa mientras no se apruebe. Se eliminó en ese caso la opción de registrar el ingreso pendiente de verificación.' },
      { version: '05', fecha: '2026-10-27', descripcion: 'Los permisos solicitados por el jefe inmediato se envían a Recursos Humanos («Por autorizar») y solo se aplican en portería cuando se autorizan; catálogo de motivos de permisos y licencias con su clase de remuneración, fundamento y soporte; licencias de día completo que crean la ausencia al autorizarse; las tarjetas de «Estado en planta» muestran a las personas de cada situación.' }
    ]
  };
})();
