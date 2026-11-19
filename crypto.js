/* 개인정보 암호화 — 주민등록번호·계좌번호는 입력한 사람의 브라우저에서 암호화해 저장합니다.
 * 서버(구글시트)에는 'E1.…' 암호문과 가린 값(900101-1******)만 남고, 풀 수 있는 사람은
 * 관리자 키 비밀번호를 아는 사람뿐입니다. (표준 Web Crypto: RSA-OAEP 3072 + AES-GCM 256, 키 보호 PBKDF2-SHA256)
 *   KCrypto.genKeys(비밀번호) → { pub, privEnc }        설정에 저장 (pubKey / privKeyEnc)
 *   KCrypto.encrypt(pub, '900101-1234567') → 'E1.…'
 *   KCrypto.unlock(privEnc, 비밀번호) → 개인키 / KCrypto.decrypt(개인키, 'E1.…') → 원문 */
var KCrypto = (function () {
  'use strict';
  var C = (typeof window !== 'undefined' && window.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
  var subtle = C && C.subtle;
  var ITER = 250000;
  function enc(s) { return new TextEncoder().encode(s); }
  function dec(b) { return new TextDecoder().decode(b); }
  function b64(buf) { var u = new Uint8Array(buf), s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(t) { t = String(t).replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; var s = atob(t), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function rnd(n) { var u = new Uint8Array(n); C.getRandomValues(u); return u; }
  function ok() { if (!subtle) throw new Error('이 브라우저에서는 암호화를 쓸 수 없어요. 최신 크롬·사파리·엣지에서 https 주소로 열어 주세요.'); }

  function passKey(pass, salt) {
    return subtle.importKey('raw', enc(pass), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function genKeys(pass) {
    ok();
    if (!pass || String(pass).length < 8) return Promise.reject(new Error('키 비밀번호는 8자 이상으로 정해 주세요.'));
    var pair, salt = rnd(16), iv = rnd(12), pub;
    return subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt'])
      .then(function (p) { pair = p; return subtle.exportKey('spki', p.publicKey); })
      .then(function (spki) { pub = b64(spki); return subtle.exportKey('pkcs8', pair.privateKey); })
      .then(function (pk) { return passKey(pass, salt).then(function (k) { return subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, pk); }); })
      .then(function (ct) { return { pub: pub, privEnc: 'K1.' + b64(salt) + '.' + b64(iv) + '.' + b64(ct) }; });
  }
  function encrypt(pub, text) {
    ok();
    if (!pub) return Promise.reject(new Error('사무국의 암호화 설정이 아직 안 되어 있어요. 사무국에 문의해 주세요.'));
    var aes, iv = rnd(12), wrapped;
    return subtle.importKey('spki', unb64(pub), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
      .then(function (pk) {
        return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']).then(function (k) { aes = k; return subtle.exportKey('raw', k); })
          .then(function (raw) { return subtle.encrypt({ name: 'RSA-OAEP' }, pk, raw); });
      })
      .then(function (w) { wrapped = w; return subtle.encrypt({ name: 'AES-GCM', iv: iv }, aes, enc(String(text))); })
      .then(function (ct) { return 'E1.' + b64(wrapped) + '.' + b64(iv) + '.' + b64(ct); });
  }
  function unlock(privEnc, pass) {
    ok();
    var p = String(privEnc || '').split('.');
    if (p[0] !== 'K1' || p.length !== 4) return Promise.reject(new Error('암호화 키가 설정되지 않았어요.'));
    return passKey(pass, unb64(p[1]))
      .then(function (k) { return subtle.decrypt({ name: 'AES-GCM', iv: unb64(p[2]) }, k, unb64(p[3])); })
      .catch(function () { throw new Error('키 비밀번호가 맞지 않아요.'); })
      .then(function (pk) { return subtle.importKey('pkcs8', pk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']); });
  }
  function decrypt(priv, token) {
    var p = String(token || '').split('.');
    if (p[0] !== 'E1' || p.length !== 4) return Promise.resolve('');
    return subtle.decrypt({ name: 'RSA-OAEP' }, priv, unb64(p[1]))
      .then(function (raw) { return subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']); })
      .then(function (k) { return subtle.decrypt({ name: 'AES-GCM', iv: unb64(p[2]) }, k, unb64(p[3])); })
      .then(dec).catch(function () { return '(복호화 실패)'; });
  }

  /* 입력 확인·가리기 */
  function rrnDigits(v) { return String(v || '').replace(/\D/g, ''); }
  function rrnValid(v) {
    var d = rrnDigits(v);
    if (d.length !== 13 || !/[1-8]/.test(d[6])) return false;
    var mm = +d.slice(2, 4), dd = +d.slice(4, 6);
    return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;   // 2020년 10월 이후 발급번호는 검증번호 규칙이 없어 형식만 확인
  }
  function rrnFormat(v) { var d = rrnDigits(v); return d.length === 13 ? d.slice(0, 6) + '-' + d.slice(6) : String(v || ''); }
  function maskRrn(v) { var d = rrnDigits(v); return d.length >= 7 ? d.slice(0, 6) + '-' + d[6] + '******' : ''; }
  function maskAccount(v) {
    var s = String(v || '').replace(/[^\d-]/g, '');
    var n = 0, total = s.replace(/\D/g, '').length;
    return s.split('').map(function (c) { if (c === '-') return c; n++; return n > 3 && n <= total - 4 ? '*' : c; }).join('');
  }
  return { genKeys: genKeys, encrypt: encrypt, unlock: unlock, decrypt: decrypt, rrnValid: rrnValid, rrnFormat: rrnFormat, maskRrn: maskRrn, maskAccount: maskAccount, available: function () { return !!subtle; } };
})();
if (typeof module !== 'undefined') module.exports = KCrypto;
