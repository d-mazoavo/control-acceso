/* Conexión con Microsoft 365: inicio de sesión (MSAL) y SharePoint vía Microsoft Graph */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var U = AP.U;
  var GRAPH = 'https://graph.microsoft.com/v1.0';
  var BASE_SCOPES = ['User.Read', 'Sites.ReadWrite.All'];
  var MAIL_SCOPES = ['Mail.Send'];
  var PREFER = 'HonorNonIndexedQueriesWarningMayFailRandomly';

  function err(kind, message, extra) {
    var e = new Error(message);
    e[kind] = true;
    if (extra) Object.assign(e, extra);
    return e;
  }
  AP.mkErr = err;

  var pca = null, account = null, cfg = null;
  var siteId = null, listIds = null;

  function redirectUri() {
    var p = location.pathname.replace(/index\.html$/i, '');
    return location.origin + p;
  }

  var G = (AP.Graph = {
    name: 'm365',

    init: async function (config) {
      cfg = config;
      if (!window.msal) throw new Error('No se cargó la librería de autenticación.');
      if (/PEGAR_AQUI/.test(cfg.tenantId + cfg.clientId + cfg.sitioSharePoint)) {
        throw err('config', 'La aplicación aún no está configurada: complete tenantId, clientId y sitioSharePoint en config.js.');
      }
      pca = new msal.PublicClientApplication({
        auth: {
          clientId: cfg.clientId,
          authority: 'https://login.microsoftonline.com/' + cfg.tenantId,
          redirectUri: redirectUri(),
          postLogoutRedirectUri: redirectUri(),
          navigateToLoginRequestUrl: false
        },
        cache: { cacheLocation: 'localStorage' }
      });
      await pca.initialize();
      var resp = null;
      try { resp = await pca.handleRedirectPromise(); } catch (e) {
        console.warn('Respuesta de inicio de sesión con error', e);
        G.lastLoginError = e && (e.errorMessage || e.message);
      }
      if (resp && resp.account) pca.setActiveAccount(resp.account);
      account = pca.getActiveAccount() || pca.getAllAccounts()[0] || null;
      if (account) pca.setActiveAccount(account);
      siteId = await AP.Store.get('m365:siteId');
      listIds = await AP.Store.get('m365:listIds');
      return !!account;
    },

    me: function () {
      if (!account) return null;
      return { upn: String(account.username || '').toLowerCase(), nombre: account.name || account.username };
    },

    login: function () {
      return pca.loginRedirect({ scopes: BASE_SCOPES, prompt: 'select_account' });
    },
    relogin: function () {
      return pca.acquireTokenRedirect({ scopes: BASE_SCOPES, account: account });
    },
    logout: function () {
      return pca.logoutRedirect({ account: account });
    },

    token: async function (scopes, interactive) {
      if (!account) throw err('authRequired', 'Debe iniciar sesión.');
      try {
        var r = await pca.acquireTokenSilent({ scopes: scopes, account: account });
        return r.accessToken;
      } catch (e) {
        var code = (e && (e.errorCode || e.name)) || '';
        if (/network|endpoints_resolution|post_request_failed|no_network/i.test(code + ' ' + (e && e.message))) {
          throw err('offline', 'Sin conexión.');
        }
        if (interactive) {
          try {
            var p = await pca.acquireTokenPopup({ scopes: scopes, account: account });
            return p.accessToken;
          } catch (e2) {
            throw err('authRequired', 'No fue posible obtener el permiso solicitado: ' + (e2.errorMessage || e2.message));
          }
        }
        throw err('authRequired', 'La sesión expiró o requiere nueva autorización. Vuelva a iniciar sesión.', { cause: e });
      }
    },

    req: async function (method, url, body, opt) {
      opt = opt || {};
      var token = await G.token(opt.scopes || BASE_SCOPES, opt.interactive);
      var headers = Object.assign({ Authorization: 'Bearer ' + token }, opt.headers || {});
      var payload;
      if (body instanceof Blob) { payload = body; headers['Content-Type'] = opt.contentType || body.type || 'application/octet-stream'; }
      else if (body !== undefined && body !== null) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
      for (var attempt = 0; attempt < 4; attempt++) {
        var t0 = Date.now(), res;
        try {
          res = await fetch(/^https:/.test(url) ? url : GRAPH + url, { method: method, headers: headers, body: payload });
        } catch (e) {
          throw err('offline', 'Sin conexión con Microsoft 365.');
        }
        if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 3) {
          var ra = parseInt(res.headers.get('Retry-After') || '0', 10);
          await U.sleep(Math.min(30000, (ra || Math.pow(2, attempt + 1)) * 1000));
          continue;
        }
        if (!res.ok) {
          var j = null;
          try { j = await res.json(); } catch (e) { /* sin cuerpo */ }
          var m = (j && j.error && (j.error.message || j.error.code)) || ('Error ' + res.status);
          if (res.status === 401) throw err('authRequired', 'La sesión expiró. Vuelva a iniciar sesión.', { status: 401 });
          throw err('api', m, { status: res.status, code: j && j.error && j.error.code });
        }
        G.lastLatency = Date.now() - t0;
        // 202 (p. ej., envío de correo) y 204 llegan sin cuerpo
        var txt = await res.text();
        if (!txt) return null;
        var ct = res.headers.get('Content-Type') || '';
        if (ct.indexOf('json') >= 0) { try { return JSON.parse(txt); } catch (e) { return txt; } }
        return txt;
      }
    },

    site: async function () {
      if (siteId) return siteId;
      var s = cfg.sitioSharePoint.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      var i = s.indexOf('/');
      var host = i > 0 ? s.slice(0, i) : s;
      var path = i > 0 ? s.slice(i) : '';
      var r = await G.req('GET', '/sites/' + host + (path ? ':' + path : '') + '?$select=id,displayName,webUrl');
      siteId = r.id;
      await AP.Store.set('m365:siteId', siteId);
      return siteId;
    },

    lists: async function (force) {
      if (listIds && !force) return listIds;
      var sid = await G.site();
      var r = await G.req('GET', '/sites/' + sid + '/lists?$select=id,displayName,name&$top=500');
      var map = {};
      (r.value || []).forEach(function (l) { map[l.displayName] = l.id; if (l.name) map[l.name] = map[l.name] || l.id; });
      listIds = map;
      await AP.Store.set('m365:listIds', map);
      return map;
    },

    listPath: async function (name) {
      var ids = await G.lists();
      var id = ids[name];
      if (!id) { ids = await G.lists(true); id = ids[name]; }
      if (!id) throw err('api', 'No existe la lista ' + name + ' en el sitio. Ejecute la instalación desde la consola.', { status: 404, missingList: name });
      return '/sites/' + (await G.site()) + '/lists/' + id;
    },

    _norm: function (it) {
      var f = Object.assign({}, it.fields || {});
      f.id = String(it.id);
      f._etag = it.eTag || f['@odata.etag'];
      f._created = it.createdDateTime;
      f._modified = it.lastModifiedDateTime;
      f._createdBy = it.createdBy && it.createdBy.user && (it.createdBy.user.email || it.createdBy.user.displayName);
      f._modifiedBy = it.lastModifiedBy && it.lastModifiedBy.user && (it.lastModifiedBy.user.email || it.lastModifiedBy.user.displayName);
      delete f['@odata.etag'];
      return f;
    },

    _fieldsSelect: function (list, exclude) {
      var cols = ['Title'].concat(AP.SCHEMA[list].cols.map(function (c) { return c[0]; }));
      if (exclude) cols = cols.filter(function (c) { return exclude.indexOf(c) < 0; });
      return cols.join(',');
    },

    _page: async function (url) {
      var out = [];
      var next = url;
      while (next) {
        var r = await G.req('GET', next, null, { headers: { Prefer: PREFER } });
        (r.value || []).forEach(function (it) { out.push(G._norm(it)); });
        next = r['@odata.nextLink'] || null;
      }
      return out;
    },

    // Todos los elementos de una lista (excluyendo columnas pesadas si se indica)
    listAll: async function (list, opt) {
      opt = opt || {};
      var p = await G.listPath(list);
      return G._page(p + '/items?$top=500&$expand=fields($select=' + G._fieldsSelect(list, opt.exclude) + ')');
    },

    // Elementos cuya columna de fecha está en el rango [desde, hasta]
    listRange: async function (list, field, desde, hasta, opt) {
      opt = opt || {};
      var p = await G.listPath(list);
      var f = "fields/" + field + " ge '" + U.toDate(desde).toISOString() + "'";
      if (hasta) f += " and fields/" + field + " le '" + U.toDate(hasta).toISOString() + "'";
      return G._page(p + '/items?$top=500&$expand=fields($select=' + G._fieldsSelect(list, opt.exclude) + ')&$filter=' + encodeURIComponent(f));
    },

    findBy: async function (list, field, value) {
      var p = await G.listPath(list);
      var f = 'fields/' + field + " eq '" + String(value).replace(/'/g, "''") + "'";
      return G._page(p + '/items?$top=50&$expand=fields($select=' + G._fieldsSelect(list, ['Foto']) + ')&$filter=' + encodeURIComponent(f));
    },

    // Lee columnas puntuales (p. ej., Foto) de varios elementos mediante solicitudes agrupadas
    getFields: async function (list, ids, cols) {
      var p = await G.listPath(list);
      var out = {};
      var groups = U.chunk(ids, 20);
      for (var g = 0; g < groups.length; g++) {
        var body = {
          requests: groups[g].map(function (id, i) {
            return { id: String(i), method: 'GET', url: p + '/items/' + id + '?$select=id&$expand=fields($select=' + cols.join(',') + ')' };
          })
        };
        var r = await G.req('POST', '/$batch', body);
        (r.responses || []).forEach(function (x) {
          if (x.status === 200 && x.body) out[String(x.body.id)] = x.body.fields || {};
        });
      }
      return out;
    },

    _clean: function (list, fields, forUpdate) {
      var types = {};
      AP.SCHEMA[list].cols.forEach(function (c) { types[c[0]] = c[1]; });
      var o = {};
      Object.keys(fields).forEach(function (k) {
        if (k[0] === '_' || k === 'id') return;
        if (k !== 'Title' && !types[k]) return;
        var v = fields[k];
        if (v === undefined) return;
        var t = types[k];
        if (v === null || v === '') {
          if (t === 'datetime' || t === 'number' || t === 'bool') { if (forUpdate) o[k] = null; return; }
          if (!forUpdate) return;
          o[k] = ''; return;
        }
        if (t === 'number') v = Number(v);
        if (t === 'bool') v = !!v;
        if (t === 'datetime') v = U.toDate(v).toISOString();
        if (t === 'text' && typeof v !== 'string') v = String(v);
        if (t === 'text' && v.length > 255) v = v.slice(0, 255);
        o[k] = v;
      });
      return o;
    },

    create: async function (list, fields) {
      var p = await G.listPath(list);
      var sent = Date.now();
      var r = await G.req('POST', p + '/items', { fields: G._clean(list, fields, false) });
      if (r && r.createdDateTime) {
        var lat = G.lastLatency || 0;
        G.skewSeconds = Math.round((sent + lat / 2 - new Date(r.createdDateTime).getTime()) / 1000);
      }
      return G._norm(r);
    },

    update: async function (list, id, fields) {
      var p = await G.listPath(list);
      var r = await G.req('PATCH', p + '/items/' + id + '/fields', G._clean(list, fields, true));
      var o = Object.assign({}, r || {}); o.id = String(id); delete o['@odata.etag']; delete o['@odata.context'];
      return o;
    },

    remove: async function (list, id) {
      var p = await G.listPath(list);
      return G.req('DELETE', p + '/items/' + id);
    },

    // Sube una evidencia a la biblioteca "Documentos" del sitio. No sobrescribe archivos existentes.
    upload: async function (relPath, blob) {
      var sid = await G.site();
      var enc = relPath.split('/').map(encodeURIComponent).join('/');
      try {
        var r = await G.req('PUT', '/sites/' + sid + '/drive/root:/' + enc + ':/content?@microsoft.graph.conflictBehavior=fail', blob, { contentType: blob.type || 'image/jpeg' });
        return { path: relPath, webUrl: r.webUrl, id: r.id };
      } catch (e) {
        if (e.status === 409) {
          var m = await G.req('GET', '/sites/' + sid + '/drive/root:/' + enc + '?$select=id,webUrl');
          return { path: relPath, webUrl: m.webUrl, id: m.id, existed: true };
        }
        throw e;
      }
    },

    // URL temporal para mostrar una evidencia en pantalla (sin descargarla)
    fileUrl: async function (relPath) {
      var sid = await G.site();
      var enc = relPath.split('/').map(encodeURIComponent).join('/');
      var m = await G.req('GET', '/sites/' + sid + '/drive/root:/' + enc);
      return m['@microsoft.graph.downloadUrl'] || m.webUrl;
    },

    sendMail: async function (msg) {
      var body = {
        message: {
          subject: msg.subject,
          body: { contentType: 'HTML', content: msg.html },
          toRecipients: msg.to.map(function (a) { return { emailAddress: { address: a } }; }),
          ccRecipients: (msg.cc || []).map(function (a) { return { emailAddress: { address: a } }; }),
          attachments: (msg.attachments || []).map(function (a) {
            return { '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.type, contentBytes: a.base64, isInline: !!a.cid, contentId: a.cid || undefined };
          })
        },
        saveToSentItems: true
      };
      return G.req('POST', '/me/sendMail', body, { scopes: MAIL_SCOPES, interactive: true });
    },

    // ---------- Instalación: crea las listas y columnas que falten ----------
    provision: async function (log) {
      log = log || function () {};
      var sid = await G.site();
      log('Sitio encontrado: ' + cfg.sitioSharePoint);
      var ids = await G.lists(true);
      var names = Object.keys(AP.SCHEMA);
      for (var i = 0; i < names.length; i++) {
        var name = names[i], def = AP.SCHEMA[name];
        if (!ids[name]) {
          log('Creando lista ' + name + '…');
          var created = await G.req('POST', '/sites/' + sid + '/lists', {
            displayName: name, description: def.desc, list: { template: 'genericList' }
          });
          ids[name] = created.id;
        } else {
          log('La lista ' + name + ' ya existe; se verifican sus columnas.');
        }
        var existing = await G.req('GET', '/sites/' + sid + '/lists/' + ids[name] + '/columns?$select=name&$top=500');
        var have = {};
        (existing.value || []).forEach(function (c) { have[c.name] = true; });
        for (var j = 0; j < def.cols.length; j++) {
          var c = def.cols[j];
          if (have[c[0]]) continue;
          await G._createColumn(sid, ids[name], c, log);
        }
      }
      listIds = ids;
      await AP.Store.set('m365:listIds', ids);
      log('Estructura verificada.');
      return ids;
    },

    _createColumn: async function (sid, lid, c, log) {
      var name = c[0], type = c[1], o = c[2] || {};
      var def = { name: name, displayName: name };
      if (type === 'text') def.text = { maxLength: 255 };
      if (type === 'note') def.text = { allowMultipleLines: true, textType: 'plain', linesForEditing: 6 };
      if (type === 'datetime') def.dateTime = { format: 'dateTime', displayAs: 'standard' };
      if (type === 'bool') def.boolean = {};
      if (type === 'number') def.number = { decimalPlaces: 'none' };
      var attempts = [];
      if (o.uniq) attempts.push(Object.assign({}, def, { indexed: true, enforceUniqueValues: true }));
      if (o.idx) attempts.push(Object.assign({}, def, { indexed: true }));
      attempts.push(def);
      for (var a = 0; a < attempts.length; a++) {
        try {
          await G.req('POST', '/sites/' + sid + '/lists/' + lid + '/columns', attempts[a]);
          if (a > 0) log('  · ' + name + ' creada sin ' + (a === 1 && o.uniq ? 'restricción de valor único' : 'índice') + ' (configúrela manualmente si es necesario).');
          return;
        } catch (e) {
          if (a === attempts.length - 1) throw e;
        }
      }
    },

    status: async function () {
      var out = { site: false, lists: {} };
      await G.site(); out.site = true;
      var ids = await G.lists(true);
      Object.keys(AP.SCHEMA).forEach(function (n) { out.lists[n] = !!ids[n]; });
      return out;
    }
  });
})();
