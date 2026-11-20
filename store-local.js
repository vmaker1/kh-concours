/* 브라우저 데모·테스트용 저장소 — 구글시트 대신 localStorage(또는 메모리)에 저장 */
var KCLocalStore = (function () {
  function create(opts) {
    opts = opts || {};
    var key = opts.key || 'kc_demo_db';
    var ls = null;
    try { if (opts.persist !== false && typeof localStorage !== 'undefined') ls = localStorage; } catch (e) { ls = null; }
    var data = null, cache = {};
    function load() {
      if (data) return data;
      try { data = ls ? JSON.parse(ls.getItem(key) || 'null') : null; } catch (e) { data = null; }
      if (!data) data = {};
      Object.keys(KC.SCHEMA).forEach(function (t) { if (!data[t]) data[t] = []; });
      return data;
    }
    function save() { if (ls) { try { ls.setItem(key, JSON.stringify(data)); } catch (e) { } } }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function norm(t, o) { var r = {}; KC.SCHEMA[t].forEach(function (k) { r[k] = o[k] == null ? '' : String(o[k]); }); return r; }
    var store = {
      all: function (t) { if (ls) data = null; return clone(load()[t] || []); },
      upsert: function (t, keyField, rows) {
        var d = load(), arr = d[t], idx = {};
        arr.forEach(function (r, i) { idx[r[keyField]] = i; });
        rows.forEach(function (r) {
          var k = String(r[keyField]);
          if (k in idx) { var o = arr[idx[k]]; Object.keys(r).forEach(function (f) { if (KC.SCHEMA[t].indexOf(f) >= 0) o[f] = r[f] == null ? '' : String(r[f]); }); }
          else { idx[k] = arr.length; arr.push(norm(t, r)); }
        });
        save();
      },
      replaceWhere: function (t, pred, rows) {
        var d = load();
        d[t] = d[t].filter(function (r) { return !pred(r); }).concat(rows.map(function (r) { return norm(t, r); }));
        save();
      },
      append: function (t, rows) { var d = load(); rows.forEach(function (r) { d[t].push(norm(t, r)); }); if (t === 'Logs' && d[t].length > 500) d[t] = d[t].slice(-500); save(); },
      withLock: function (fn) { return fn(); },
      now: function () {
        var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
      },
      uid: function () { return 'xxxxxxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); }); },
      ver: function () { if (ls) data = null; var d = load(); if (!d.__ver) { d.__ver = String(Date.now()); save(); } return d.__ver; },
      bump: function () { var d = load(); d.__ver = String(Date.now()) + String(Math.floor(Math.random() * 1000)); save(); },
      cacheGet: function (k) { var c = load().__cache || {}; return c[k] || null; },
      cachePut: function (k, v) { var d = load(); d.__cache = d.__cache || {}; d.__cache[k] = v; save(); },
      reset: function () { data = {}; Object.keys(KC.SCHEMA).forEach(function (t) { data[t] = []; }); save(); },
      isEmpty: function () { return !load().Participants.length && !load().Config.length; }
    };
    return store;
  }
  return { create: create };
})();
if (typeof module !== 'undefined') module.exports = KCLocalStore;
