/*
 * Textos institucionales y de protección de datos personales.
 * Deben ser revisados y aprobados por el responsable de protección de datos
 * y el área jurídica antes de la puesta en producción. Si se modifican,
 * actualice también "versionAutorizacion" en config.js.
 */
window.AP_TEXTOS = {
  avisoPrivacidad: function (c) {
    var r = c.responsable;
    return '' +
      'De conformidad con la Ley 1581 de 2012 y sus normas reglamentarias, ' + r.razonSocial +
      ' (NIT ' + r.nit + '), con domicilio en ' + r.domicilio + ', en calidad de Responsable del tratamiento, ' +
      'recolecta sus datos de identificación y contacto, los de su vehículo y el registro de fecha y hora de ingreso y salida, ' +
      'con la finalidad exclusiva de controlar el acceso a sus instalaciones, proteger a las personas, los bienes y la cadena de suministro, ' +
      'y atender los requerimientos de las autoridades y de los programas de seguridad a los que la compañía pertenece. ' +
      'La fotografía, cuando se recolecte, se emplea únicamente para el cotejo visual de identidad por el personal de seguridad; ' +
      'su suministro es facultativo y puede optarse por la verificación con documento de identidad. No se realiza reconocimiento facial automatizado. ' +
      'Como titular, usted puede conocer, actualizar, rectificar y solicitar la supresión de sus datos, solicitar prueba de la autorización, ' +
      'ser informado del uso dado a sus datos, revocar la autorización y presentar quejas ante la Superintendencia de Industria y Comercio, ' +
      'en los términos del artículo 8 de la Ley 1581 de 2012. Canal de atención: ' + r.correoDatos + '.' +
      (r.politicaUrl ? ' Política de tratamiento: ' + r.politicaUrl + '.' : '');
  },

  // Lo que el vigilante pregunta al visitante antes de registrar su ingreso.
  confirmacionVisitante:
    '¿Autoriza a Avo Pak S.A.S. a tratar sus datos personales para el control de acceso y la seguridad de las instalaciones, ' +
    'conforme al aviso de privacidad exhibido en portería?',

  autoridad:
    'A los servidores públicos en ejercicio de sus funciones no se les condiciona el ingreso a la autorización de datos. ' +
    'Regístrelos e informe de inmediato al Director de Seguridad Integral, quien diligencia el formato AP-SG-FT-002.',

  salidaNoSeImpide:
    'La salida de una persona nunca se impide ni se condiciona. Regístrela y reporte la novedad al supervisor.',

  salidaNoAutorizada:
    'La persona no tiene autorización de salida. NO la retenga ni le impida el paso: su libertad de locomoción no puede restringirse por el personal de vigilancia. ' +
    'Registre el hecho, que queda marcado como novedad, y repórtelo de inmediato al Director de Seguridad Integral o al supervisor.',

  salidaSinQR:
    'La salida se registra leyendo el QR de la persona. Si no puede presentarlo, la salida no se impide: regístrela por excepción, ' +
    'indicando quién la autoriza y el motivo. Queda marcada para revisión de la Dirección de Seguridad Integral.',

  sinExcepcion:
    'Este ingreso no puede autorizarse por excepción en portería. Solo el Director de Seguridad Integral puede levantar la denegación, ' +
    'una vez verifique, registrando el permiso o la modificación correspondiente. Repórtele la novedad.',

  excepcion:
    'El ingreso por excepción exige la autorización expresa de quien tenga competencia (Director de Seguridad Integral o quien este designe). ' +
    'Queda registrado y es objeto de revisión.',

  // Lo que acepta el vigilante al definir su PIN personal (primer ingreso o restablecimiento).
  versionAvisoVigilante: 'AUT-PIN-01',
  avisoVigilante: function (c) {
    var r = c.responsable;
    return '' +
      'El usuario y el PIN que usted define son personales e intransferibles. Todo registro de ingreso, salida, negación o inspección ' +
      'que se haga mientras su turno esté abierto en este celular quedará asociado a su nombre, con fecha y hora. ' +
      'No comparta su PIN, no lo anote en lugar visible y cierre su turno al terminar. Si cree que otra persona lo conoce, ' +
      'informe a su supervisor para que se solicite el restablecimiento. ' +
      r.razonSocial + ' trata su nombre, documento, empresa, usuario y los registros de su turno con la finalidad de identificar ' +
      'a quién corresponde cada actuación en la aplicación de control de acceso y conservar su trazabilidad, conforme a la Ley 1581 de 2012. ' +
      'El PIN no se conserva en claro: solo se guarda una huella criptográfica que no permite leerlo. ' +
      'Puede ejercer los derechos del artículo 8 de la Ley 1581 de 2012 en ' + r.correoDatos + '.';
  },

  pieExportacion:
    'Documento generado por la aplicación de control de acceso de la Dirección de Seguridad Integral. ' +
    'Información reservada — Ley 1581 de 2012. La huella SHA-256 del archivo queda registrada en la bitácora.'
};
