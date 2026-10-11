/* Almacenamiento local del dispositivo (IndexedDB), con respaldo en memoria si no está disponible. */
(function () {
  'use strict';
  var AP = (window.AP = window.AP || {});
  var DB_NAME = 'avopak-acceso';
  var DB_VER = 1;
  var STORES = ['kv', 'outbox'];
  var dbp = null;
  var mem = { kv: new Map(), outbox: new Map() };
  var useMem = false;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        if (!window.indexedDB) throw new Error('sin IndexedDB');
        var req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
          if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { useMem = true; resolve(null); };
        req.onblocked = function () { useMem = true; resolve(null); };
      } catch (e) { useMem = true; resolve(null); }
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      if (!db || useMem) return fn(null);
      return new Promise(function (resolve, reject) {
        var t;
        try { t = db.transaction(store, mode); } catch (e) { useMem = true; return resolve(fn(null)); }
        var os = t.objectStore(store);
        var out;
        var r = fn(os);
        if (r && typeof r.onsuccess !== 'undefined') r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  var S = (AP.Store = {
    isMemory: function () { return useMem; },
    get: function (key) {
      return tx('kv', 'readonly', function (os) { return os ? os.get(key) : null; })
        .then(function (v) { return useMem ? clone(mem.kv.get(key)) : v; })
        .catch(function () { return clone(mem.kv.get(key)); });
    },
    set: function (key, val) {
      mem.kv.set(key, clone(val));
      return tx('kv', 'readwrite', function (os) { return os ? os.put(val, key) : null; }).catch(function () { useMem = true; });
    },
    del: function (key) {
      mem.kv.delete(key);
      return tx('kv', 'readwrite', function (os) { return os ? os.delete(key) : null; }).catch(function () {});
    },
    // ---- Cola de registros pendientes de sincronizar ----
    outboxAll: function () {
      return tx('outbox', 'readonly', function (os) { return os ? os.getAll() : null; })
        .then(function (v) { return useMem ? Array.from(mem.outbox.values()).map(clone) : (v || []); })
        .catch(function () { return Array.from(mem.outbox.values()).map(clone); })
        .then(function (arr) { return arr.sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; }); });
    },
    outboxPut: function (item) {
      mem.outbox.set(item.id, clone(item));
      return tx('outbox', 'readwrite', function (os) { return os ? os.put(item) : null; }).catch(function () { useMem = true; });
    },
    outboxDel: function (id) {
      mem.outbox.delete(id);
      return tx('outbox', 'readwrite', function (os) { return os ? os.delete(id) : null; }).catch(function () {});
    },
    clearAll: function () {
      mem.kv.clear(); mem.outbox.clear();
      return Promise.all(STORES.map(function (s) {
        return tx(s, 'readwrite', function (os) { return os ? os.clear() : null; }).catch(function () {});
      }));
    }
  });

  function clone(v) {
    if (v === undefined || v === null) return v;
    try { return structuredClone(v); } catch (e) { return v; }
  }
  S._open = open;
})();
