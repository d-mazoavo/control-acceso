/* Horarios programados, permisos y puntualidad (reglas que se aplican sin conexión en el celular de portería) */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U;
  var H = (AP.Horario = {});

  function cfg() { return Object.assign({ minutosPendiente: 10, minutosAntelacionTurno: 30, minutosSalidaAntesDeFin: 0, horasMaxSinSalida: 14 }, (AP.CFG && AP.CFG.puntualidad) || {}); }
  H.cfg = cfg;

  function toMin(hm) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '')); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null; }
  H.toMin = toMin;
  // Día de la semana (0 = domingo) de una fecha 'AAAA-MM-DD' de Colombia
  function dow(ymd) { return new Date(ymd + 'T12:00:00-05:00').getUTCDay(); }
  function addYmd(ymd, n) { return U.ymd(new Date(new Date(ymd + 'T12:00:00-05:00').getTime() + n * 86400000)); }
  H.dow = dow;
  H.nombreDias = function (dias) {
    var set = String(dias || '').split(',').filter(Boolean);
    if (set.length === 7) return 'Todos los días';
    var nombres = {}; AP.CAT.dias.forEach(function (d) { nombres[d[0]] = d[1]; });
    return AP.CAT.dias.filter(function (d) { return set.indexOf(d[0]) >= 0; }).map(function (d) { return d[1]; }).join(', ');
  };

  // Horario de acceso libre: la persona entra y sale las veces que necesite dentro de los días y horas habilitados
  // (conductores, contratistas). No se mide llegada tarde ni salida antes de la hora; fuera del horario sí se controla la llegada.
  function esLibre(rec) { return !!(rec && rec.Modalidad === 'Libre'); }
  H.esLibre = esLibre;

  // Horarios activos de una persona
  H.deTokenOf = function (token) {
    return AP.Sync.horarios.filter(function (x) { return x.Token === token && x.Activo !== false; });
  };

  // ---------- Programación semanal de planta (Jefe de Producción) ----------
  // Cada semana (lunes a domingo) es un registro con { idPersona: { t: token, d: { 'AAAA-MM-DD': código } } } y la copia de
  // los turnos usados ({ código: { n: nombre, e: 'HH:MM', s: 'HH:MM' } }). Código 'D' = descanso. Para las fechas de una
  // semana en la que la persona figura, la programación de planta reemplaza su horario general.
  function jsonDe(t, def) { try { var v = JSON.parse(t || ''); return v && typeof v === 'object' ? v : def; } catch (e) { return def; } }
  H.jsonDe = jsonDe;
  H.lunes = function (ymd) { var d = dow(ymd); return addYmd(ymd, d === 0 ? -6 : 1 - d); };
  H.addYmd = addYmd;
  // Cada semana puede tener varios registros (uno por jefe inmediato): se combinan. La programación de un jefe solo se
  // aplica a las personas que lo tienen como jefe inmediato en su ficha (un jefe no puede programar a personal ajeno).
  var cachePlanta = { src: null, tok: null, idx: null };
  H.aplicaA = function (w, x) {
    if (!w.JefeId) return true;
    var per = AP.Sync.byToken && AP.Sync.byToken.get(x.t);
    return !(per && per.tipo === 'persona' && (per.rec.JefeId || '') !== w.JefeId);
  };
  function indicePlanta() {
    var src = AP.Sync.planta || [];
    if (cachePlanta.src === src && cachePlanta.tok === AP.Sync.byToken && cachePlanta.idx) return cachePlanta.idx;
    var idx = {};   // semana → { token → { d, turnos } }
    // Primero los registros sin jefe (versión anterior o del Director): la programación del jefe inmediato prevalece
    src.slice().sort(function (a, b) { return (a.JefeId ? 1 : 0) - (b.JefeId ? 1 : 0); }).forEach(function (w) {
      var datos = jsonDe(w.Datos, {}), turnos = jsonDe(w.Turnos, {}), porTok = idx[w.Semana] = idx[w.Semana] || {};
      Object.keys(datos).forEach(function (pid) { var x = datos[pid]; if (x && x.t && H.aplicaA(w, x)) porTok[x.t] = { d: x.d || {}, turnos: turnos }; });
    });
    cachePlanta = { src: src, tok: AP.Sync.byToken, idx: idx };
    return idx;
  }
  // Asignación de planta de la persona en una fecha: null = la semana no la incluye (rige su horario general);
  // { cod: '' | 'D' | código, turno } = la semana sí la incluye
  H.planta = function (token, ymd) {
    var w = indicePlanta()[H.lunes(ymd)];
    var x = w && w[token];
    if (!x) return null;
    var cod = x.d[ymd] || '';
    return { cod: cod, turno: cod && cod !== 'D' ? x.turnos[cod] || null : null };
  };
  // ¿La persona tiene horario general o programación de planta en los días cercanos?
  H.tieneHorario = function (token, now) {
    if (H.deTokenOf(token).length) return true;
    var hoy = U.ymd(now || new Date());
    return [-1, 0, 1].some(function (off) { return !!H.planta(token, addYmd(hoy, off)); });
  };

  // Jornadas (instancias con fecha) de la persona en los días cercanos a "now"
  H.instancias = function (token, now) {
    var hs = H.deTokenOf(token), out = [];
    var hoy = U.ymd(now);
    [-1, 0, 1].forEach(function (off) {
      var ymd = addYmd(hoy, off), wd = String(dow(ymd));
      var pl = H.planta(token, ymd);
      if (pl) {
        // Programación de planta: un turno ese día, o descanso / sin turno (sin jornada ese día)
        if (pl.turno && toMin(pl.turno.e) != null && toMin(pl.turno.s) != null) {
          var a1 = toMin(pl.turno.e), b1 = toMin(pl.turno.s);
          out.push({ rec: { Turno: pl.turno.n || pl.cod, HoraEntrada: pl.turno.e, HoraSalida: pl.turno.s, Modalidad: 'Turno', Planta: true }, ymd: ymd,
            start: U.fromLocal(ymd, pl.turno.e), end: U.fromLocal(b1 <= a1 ? addYmd(ymd, 1) : ymd, pl.turno.s) });
        }
        return;
      }
      hs.forEach(function (x) {
        if (x.VigenteDesde && ymd < x.VigenteDesde) return;
        if (x.VigenteHasta && ymd > x.VigenteHasta) return;
        if (String(x.Dias || '').split(',').indexOf(wd) < 0) return;
        var a = toMin(x.HoraEntrada), b = toMin(x.HoraSalida);
        if (a == null || b == null) return;
        var start = U.fromLocal(ymd, x.HoraEntrada);
        var end = U.fromLocal(b <= a ? addYmd(ymd, 1) : ymd, x.HoraSalida);
        out.push({ rec: x, ymd: ymd, start: start, end: end });
      });
    });
    return out;
  };

  // Jornada que corresponde al instante dado.
  // Ingreso: la que contiene el instante (con antelación) o, si no, la de la fecha de hoy (para medir llegada tardía o fuera de turno).
  // Salida (opt.salida): la jornada más reciente ya iniciada; si ya terminó, la salida es normal.
  H.jornada = function (token, now, opt) {
    var ins = H.instancias(token, now);
    if (!ins.length) return null;
    var ant = cfg().minutosAntelacionTurno * 60000, t = now.getTime(), hoy = U.ymd(now), best = null;
    if (opt && opt.salida) {
      ins.forEach(function (i) { if (i.start.getTime() - ant <= t && (!best || i.start > best.start)) best = i; });
      return best;
    }
    ins.forEach(function (i) {
      var dentro = t >= i.start.getTime() - ant && t <= i.end.getTime();
      if (!(dentro || i.ymd === hoy)) return;
      if (!best || (dentro && i.start > best.start) || (!dentro && !best.dentro && i.start > best.start)) { best = i; best.dentro = dentro; }
    });
    return best;
  };

  // Ausencia registrada por Talento Humano que cubre la fecha (vacaciones, permiso de día completo, licencia…)
  H.ausenciaVigente = function (token, now) {
    var t = now.getTime();
    return (AP.Sync.ausencias || []).filter(function (a) {
      return a.Token === token && a.Estado !== 'Anulada' && new Date(a.Desde).getTime() <= t && t <= new Date(a.Hasta).getTime();
    }).sort(function (a, b) { return a.Hasta < b.Hasta ? 1 : -1; })[0] || null;
  };

  // Permisos vigentes del instante, de los tipos indicados
  H.permisosVigentes = function (token, now, tipos) {
    var t = now.getTime();
    return AP.Sync.permisos.filter(function (p) {
      return p.Token === token && p.Estado !== 'Anulado' && (!tipos || tipos.indexOf(p.Tipo) >= 0) &&
        new Date(p.Desde).getTime() <= t && t <= H.finPermiso(p).getTime();
    }).sort(function (a, b) { return a.Hasta < b.Hasta ? 1 : -1; });
  };
  // Fin de vigencia de un permiso. La salida anticipada no lleva hora final (la persona no regresa): vale hasta el fin del día.
  H.finPermiso = function (p) {
    if (p.Hasta) return new Date(p.Hasta);
    return U.fromLocal(U.ymd(new Date(p.Desde)), '23:59');
  };
  var TIPOS_ENTRADA = ['Ingreso tardío', 'Ingreso y salida fuera de horario'];
  H.TIPOS_ENTRADA = TIPOS_ENTRADA;
  var TIPOS_SALIDA = ['Salida anticipada', 'Salida temporal (cita o diligencia)', 'Ingreso y salida fuera de horario'];

  function hm(d) { return U.fTime(d); }
  function descJornada(j) {
    var t = (j.rec.Turno ? j.rec.Turno + ' · ' : '') + j.rec.HoraEntrada + ' a ' + j.rec.HoraSalida;
    return esLibre(j.rec) ? t + ' (acceso libre)' : t;
  }

  // ¿La persona registrada ya tiene autorizado el ingreso con su credencial en ese día y hora? (se usa al registrar una
  // visita: si ya lo tiene, la visita no se registra y la persona entra leyendo su propio QR)
  H.cobertura = function (p, ini) {
    var token = p.Token, ymd = U.ymd(ini), t = ini.getTime();
    if (p.Estado !== 'Habilitado') return { cubre: false, inhabilitado: true };
    if (p.VigenciaHasta && p.VigenciaHasta < ymd) return { cubre: false, vencida: true };
    var aus = H.ausenciaVigente(token, ini);
    if (aus) return { cubre: false, ausencia: aus };
    var perm = H.permisosVigentes(token, ini, TIPOS_ENTRADA)[0];
    if (perm) return { cubre: true, desc: 'permiso «' + perm.Tipo + '» vigente hasta el ' + U.fDateTime(H.finPermiso(perm)) };
    if (!H.tieneHorario(token, ini)) return { cubre: true, permanente: true, desc: 'acceso con su credencial, sin restricción de horario' };
    var ant = cfg().minutosAntelacionTurno * 60000;
    var j = H.instancias(token, ini).filter(function (i) { return t >= i.start.getTime() - ant && t <= i.end.getTime(); })[0];
    if (j) return { cubre: true, libre: esLibre(j.rec), desc: (esLibre(j.rec) ? 'ingreso libre' : 'turno') + ' ' + descJornada(j) + ' del ' + U.fDate(j.start) };
    return { cubre: false };
  };

  // Evalúa el INGRESO de una persona con horario. Devuelve null si no hay horarios registrados (sin regla adicional).
  // ult = último movimiento permitido de la persona.
  H.evaluarIngreso = function (p, now, ult) {
    var token = p.Token, c = cfg();
    // Ausencia registrada por Talento Humano: el vigilante no autoriza; decide el Director (salvo permiso de ingreso vigente).
    // Al vigilante no se le muestra la clase de ausencia (minimización de datos).
    var aus = H.ausenciaVigente(token, now);
    if (aus && !H.permisosVigentes(token, now, TIPOS_ENTRADA).length) {
      return { nivel: 'deny', sinExcepcion: true, aprobacionDirector: true, tipoSolicitud: 'Ausencia registrada', novedad: 'Ingreso durante ausencia registrada por Talento Humano',
        etiqueta: 'AUSENCIA REGISTRADA — REQUIERE APROBACIÓN DEL DIRECTOR',
        detalle: 'Talento Humano registró una ausencia de esta persona hasta el ' + U.fDate(aus.Hasta) + '. El vigilante no puede autorizar el ingreso: envíe la solicitud al Director de Seguridad Integral.', horarioInfo: '' };
    }
    if (!H.tieneHorario(token, now)) return null;
    var j = H.jornada(token, now);
    var perm = H.permisosVigentes(token, now, TIPOS_ENTRADA)[0];
    var info = j ? descJornada(j) : '';
    if (perm) {
      return { nivel: 'ok', etiqueta: 'INGRESO AUTORIZADO — ' + perm.Tipo.toUpperCase(), detalle: 'Permiso vigente hasta las ' + hm(perm.Hasta) + (perm.AutorizadoPor ? ' (autoriza ' + perm.AutorizadoPor + ')' : '') + '.', permisoId: perm.id || perm.IdLocal, horarioInfo: info };
    }
    if (!j) {
      // Contratistas: en un día que no les fue programado el vigilante no puede autorizar; decide el Director
      if (p.Tipo === 'Contratista') {
        return { nivel: 'deny', sinExcepcion: true, aprobacionDirector: true, tipoSolicitud: 'Día no programado', novedad: 'Ingreso en día no programado',
          etiqueta: 'DÍA NO PROGRAMADO — REQUIERE APROBACIÓN DEL DIRECTOR',
          detalle: 'El contratista no tiene turno programado para hoy. El vigilante no puede autorizar el ingreso: envíe la solicitud al Director de Seguridad Integral, que decide.', horarioInfo: '' };
      }
      return { nivel: 'warn', registrable: true, novedad: 'Ingreso en día no programado', etiqueta: 'DÍA NO PROGRAMADO — INGRESO PENDIENTE',
        detalle: 'No tiene turno programado para hoy. Puede registrarse el ingreso, que queda pendiente de verificación por el Director de Seguridad Integral.', horarioInfo: '' };
    }
    // Acceso libre: dentro del horario habilitado entra cuantas veces necesite, sin medir llegada tarde.
    // Fuera de ese horario la llegada sí se controla: antes de la hora queda pendiente; después del cierre decide el Director.
    if (esLibre(j.rec)) {
      var antL = c.minutosAntelacionTurno * 60000, tL = now.getTime();
      if (tL >= j.start.getTime() - antL && tL <= j.end.getTime()) {
        return { nivel: 'ok', etiqueta: 'HABILITADO — ACCESO LIBRE EN SU HORARIO', detalle: 'Puede entrar y salir las veces que necesite hasta las ' + hm(j.end) + ' (' + info + ').', horarioInfo: info };
      }
      if (now > j.end) {
        return { nivel: 'deny', sinExcepcion: true, aprobacionDirector: true, tipoSolicitud: 'Fuera de turno', novedad: 'Ingreso fuera del horario de acceso', etiqueta: 'FUERA DE SU HORARIO DE ACCESO — REQUIERE APROBACIÓN DEL DIRECTOR',
          detalle: 'Su horario de acceso era ' + info + ' y ya terminó. Envíe la solicitud al Director de Seguridad Integral, que aprueba o rechaza el ingreso.', horarioInfo: info };
      }
      var faltan = Math.floor(j.start.getTime() / 60000) - Math.floor(tL / 60000);
      return { nivel: 'warn', registrable: true, novedad: 'Ingreso antes del horario de acceso (' + faltan + ' min antes)', etiqueta: 'ANTES DE SU HORARIO — FALTAN ' + faltan + ' MIN',
        detalle: 'Su horario de acceso inicia a las ' + j.rec.HoraEntrada + ' y el ingreso se habilita desde las ' + hm(new Date(j.start.getTime() - antL)) + '. Si lo deja ingresar, queda como novedad pendiente de verificación por el Director de Seguridad Integral.', horarioInfo: info };
    }
    // Reingreso dentro de la misma jornada (salió y regresa): no se mide como llegada tardía
    if (ult && ult.Sentido === 'Salida' && new Date(ult.FechaHora).getTime() >= j.start.getTime() - c.minutosAntelacionTurno * 60000 && now <= j.end) {
      var pt = AP.Sync.permisos.filter(function (x) { return x.Token === token && x.Estado !== 'Anulado' && x.Tipo === 'Salida temporal (cita o diligencia)' && new Date(x.Desde).getTime() <= new Date(ult.FechaHora).getTime() + 60000; }).sort(function (a, b) { return a.Hasta < b.Hasta ? 1 : -1; })[0];
      if (pt && now.getTime() > new Date(pt.Hasta).getTime() + 5 * 60000) {
        return { nivel: 'warn', registrable: true, novedad: 'Reingreso fuera del plazo del permiso', etiqueta: 'REINGRESO FUERA DE PLAZO — PENDIENTE', detalle: 'El permiso de salida temporal vencía a las ' + hm(pt.Hasta) + '.', horarioInfo: info };
      }
      return { nivel: 'ok', etiqueta: 'REINGRESO', detalle: 'Regresa a su jornada (' + info + ').', horarioInfo: info };
    }
    var delta = Math.floor(now.getTime() / 60000) - Math.floor(j.start.getTime() / 60000);
    // Minutos que faltan para la hora de entrada (por minuto de reloj, igual que la llegada tardía)
    var ant = Math.floor(j.start.getTime() / 60000) - Math.floor(now.getTime() / 60000);
    if (now > j.end) {
      return { nivel: 'deny', sinExcepcion: true, aprobacionDirector: true, tipoSolicitud: 'Fuera de turno', novedad: 'Ingreso fuera de turno', etiqueta: 'FUERA DE SU TURNO — REQUIERE APROBACIÓN DEL DIRECTOR',
        detalle: 'Su turno era ' + info + ' y ya terminó. Envíe la solicitud al Director de Seguridad Integral, que aprueba o rechaza el ingreso.', horarioInfo: info };
    }
    if (delta <= 0) {
      // Antes de la ventana habilitada (por defecto, 30 min antes de la entrada): alerta de llegada muy temprano
      if (ant > c.minutosAntelacionTurno) {
        var desde = new Date(j.start.getTime() - c.minutosAntelacionTurno * 60000);
        return { nivel: 'warn', registrable: true, novedad: 'Llegada muy temprano (' + ant + ' min antes del turno)', etiqueta: 'MUY TEMPRANO — FALTAN ' + ant + ' MIN PARA SU TURNO',
          detalle: 'Su turno inicia a las ' + j.rec.HoraEntrada + ' y el ingreso se habilita desde las ' + hm(desde) + '. Si lo deja ingresar, queda como novedad pendiente de verificación por el Director de Seguridad Integral.', horarioInfo: info };
      }
      return { nivel: 'ok', etiqueta: 'HABILITADO — A TIEMPO', detalle: 'Turno ' + info + '.', horarioInfo: info };
    }
    if (delta < c.minutosPendiente) {
      return { nivel: 'warn', registrable: true, novedad: 'Ingreso tardío (' + delta + ' min)', etiqueta: 'INGRESO PENDIENTE — LLEGÓ ' + delta + ' MIN TARDE',
        detalle: 'Turno ' + info + '. Se registra el ingreso y queda pendiente de verificación por el Director de Seguridad Integral.', horarioInfo: info };
    }
    return { nivel: 'deny', sinExcepcion: true, aprobacionDirector: true, tipoSolicitud: 'Llegada tardía', novedad: 'Llegada tardía (' + delta + ' min)',
      etiqueta: 'LLEGADA TARDÍA (' + delta + ' MIN) — REQUIERE APROBACIÓN DEL DIRECTOR',
      detalle: 'Turno ' + info + '. El vigilante no puede autorizar este ingreso: envíe la solicitud al Director de Seguridad Integral, que lo aprueba o lo rechaza.', horarioInfo: info };
  };

  // Evalúa la SALIDA. Sin horarios: salida normal.
  H.evaluarSalida = function (p, now) {
    var token = p.Token, c = cfg();
    var hs = H.deTokenOf(token);
    if (!H.tieneHorario(token, now)) return null;
    var j = H.jornada(token, now, { salida: true });
    var info = j ? descJornada(j) : '';
    // Acceso libre: la salida nunca se marca como no autorizada (sale y vuelve las veces que necesite)
    if ((j && esLibre(j.rec)) || (hs.length && hs.every(esLibre) && !(j && j.rec.Planta))) {
      return { nivel: 'ok', etiqueta: 'SALIDA — ACCESO LIBRE', detalle: 'Puede salir y volver a ingresar dentro de su horario de acceso' + (info ? ' (' + info + ')' : '') + '.', horarioInfo: info };
    }
    if (j && now.getTime() >= j.end.getTime() - c.minutosSalidaAntesDeFin * 60000) {
      return { nivel: 'ok', etiqueta: 'SALIDA AUTORIZADA', detalle: 'Finalizó su jornada (' + info + ').', horarioInfo: info };
    }
    var perm = H.permisosVigentes(token, now, TIPOS_SALIDA)[0];
    if (perm) {
      var detS = perm.Tipo === 'Salida anticipada'
        ? 'Salida anticipada autorizada desde las ' + hm(perm.Desde) + (perm.AutorizadoPor ? ' (autoriza ' + perm.AutorizadoPor + ')' : '') + '. No regresa en esta jornada.'
        : 'Permiso vigente hasta las ' + hm(H.finPermiso(perm)) + (perm.Tipo.indexOf('temporal') > 0 ? '; debe reingresar leyendo su QR.' : '.');
      return { nivel: 'ok', etiqueta: 'SALIDA AUTORIZADA — ' + perm.Tipo.toUpperCase(), detalle: detS, permisoId: perm.id || perm.IdLocal, horarioInfo: info };
    }
    return { nivel: 'deny', salidaNoAutorizada: true, novedad: 'Salida no autorizada', etiqueta: 'SALIDA NO AUTORIZADA',
      detalle: (j ? 'Su jornada termina a las ' + hm(j.end) + ' (' + info + '). ' : 'No tiene jornada programada hoy. ') + 'No tiene permiso de salida registrado.', horarioInfo: info };
  };
})();
