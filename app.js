/* 콩쿠르 운영 시스템 — 화면 공용 스크립트 (API 연결, 데모 모드, 도우미, 인쇄 양식) */
var App = (function () {
  var CFG = window.KC_CONFIG || {};
  // 연습 모드: 실제 운영 주소에서도 ?practice=1 로 열면 이 브라우저 안에서만 돌아가는 연습판 (운영DB는 건드리지 않음)
  var PRACTICE = false;
  try {
    if (/[?&]practice=1(&|$)/.test(location.search)) localStorage.setItem('kc_practice', '1');
    if (/[?&]practice=0(&|$)/.test(location.search)) localStorage.removeItem('kc_practice');
    PRACTICE = !!CFG.apiUrl && localStorage.getItem('kc_practice') === '1';
  } catch (e) { }
  var DEMO = !CFG.apiUrl || PRACTICE;
  var DB_KEY = PRACTICE ? 'kc_practice_db_v1' : 'kc_demo_db_v5';
  var demoStore = null;

  /* ---------- 데모 모드 ---------- */
  var SUR = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모남궁'.split('');
  var GIV = ['서연', '민준', '하은', '지우', '서윤', '도윤', '하린', '예준', '지민', '수아', '시우', '유나', '주원', '채원', '건우', '다은', '은우', '서아', '현우', '윤서', '지호', '예린', '선우', '소율', '우진', '가은', '하율', '태윤', '수빈', '라엘', '세빈', '가원', '준혁', '윤재', '혜진', '진호', '수린', '시온', '은율', '하랑'];
  var SCH = { '초등부': ['예일초', '목운초', '잠일초', '숭신초', '신용산초', '매탄초'], '중등부': ['예원학교', '선화예술중', '계원예술중', '서울예중'], '고등부': ['서울예고', '선화예고', '계원예고', '경기예고'], '대학일반부': ['한국예술종합학교', '서울대', '연세대', '이화여대'] };
  // 연습판에 기본 설정만 (참가자·심사위원 없이) — 실제 75회 신청자 엑셀·심사위원 명단을 직접 넣어 보는 용도
  function seedEmpty(st) {
    st.reset();
    st.upsert('Config', 'key', [
      { key: 'title', value: '제75회 이화경향음악콩쿠르 (연습)' }, { key: 'adminPassword', value: 'admin' }, { key: 'deskPin', value: '0000' },
      { key: 'manager', value: '담당자' }, { key: 'pubKey', value: DEMO_KEY.pub }, { key: 'privKeyEnc', value: DEMO_KEY.privEnc }, { key: 'applyEnd', value: '2026-02-26' }
    ]);
  }
  function seedDemo(st) {
    var rnd = (function () { var x = 76; return function () { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; })();
    var pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
    var plan = [['피아노', '초등부', 26], ['피아노', '중등부', 22], ['바이올린', '초등부', 14], ['성악', '고등부', 18], ['성악', '대학일반부', 14]];
    // 성악 곡목 예시 (실제 운영: 신청서의 예선 2곡·본선 3곡이 그대로 들어옴)
    var IT = [['G. Giordani', 'Caro mio ben'], ['F. P. Tosti', 'Ideale'], ['S. Donaudy', 'Vaghissima sembianza'], ['A. Caldara', 'Sebben, crudele'], ['G. Paisiello', 'Nel cor più non mi sento'], ['G. F. Händel', 'Alma mia']];
    var DE = [['F. Schubert', 'An die Musik'], ['R. Schumann', 'Widmung'], ['R. Strauss', 'Zueignung'], ['F. Schubert', 'Die Forelle'], ['L. v. Beethoven', 'Ich liebe dich'], ['J. Brahms', 'Wiegenlied']];
    var AR = [['W. A. Mozart', 'Voi che sapete <Le nozze di Figaro>'], ['G. Donizetti', 'Una furtiva lagrima <L\'elisir d\'amore>'], ['G. Puccini', 'O mio babbino caro <Gianni Schicchi>'], ['G. Verdi', 'Caro nome <Rigoletto>'], ['W. A. Mozart', 'Non più andrai <Le nozze di Figaro>'], ['G. Bizet', 'Votre toast <Carmen>']];
    var KR = [['김순남', '산유화'], ['최영섭', '그리운 금강산'], ['김동진', '가고파'], ['장일남', '비목'], ['현제명', '산들바람'], ['조두남', '그리움']];
    var song = function (round, kind, country, a) { var x = pick(a); return { round: round, kind: kind, country: country, composer: x[0], title: x[1] }; };
    var vocalPieces = function (cat) {
      var p1 = cat === '고등부' ? [song('R1', '이태리 가곡', '이태리', IT), song('R1', '독일 가곡', '독일', DE)] : [song('R1', '가곡', pick(['이태리', '독일']), pick([IT, DE])), song('R1', '아리아', '', AR)];
      return JSON.stringify(p1.concat([song('R2', '가곡', pick(['이태리', '독일']), pick([IT, DE])), song('R2', '아리아', '', AR), song('R2', '한국가곡', '한국', KR)]));
    };
    var rows = [], id = 7001;
    plan.forEach(function (pl) {
      for (var i = 0; i < pl[2]; i++) {
        var yr = pl[1] === '초등부' ? '15' : pl[1] === '중등부' ? '12' : pl[1] === '고등부' ? '09' : '05';
        var m = ('0' + (1 + Math.floor(rnd() * 12))).slice(-2), d = ('0' + (1 + Math.floor(rnd() * 28))).slice(-2);
        var ph = '010' + String(20000000 + Math.floor(rnd() * 79999999));
        rows.push({
          address: pick(['서울 강남구 테헤란로', '서울 마포구 월드컵로', '경기 성남시 분당구', '경기 고양시 일산동구', '인천 연수구 송도', '서울 송파구 올림픽로', '경기 용인시 수지구', '부산 해운대구 센텀', '대구 수성구 범어동', '광주 서구 상무대로', '대전 유성구 대학로', '경남 창원시 성산구', '전북특별자치도 전주시', '충남 천안시 서북구']),
          id: String(id++), name: pick(SUR) + pick(GIV), birth: yr + m + d, gender: rnd() < .55 ? '여성' : '남성',
          phone: ph, guardianName: pick(SUR) + pick(GIV), guardianPhone: '010' + String(20000000 + Math.floor(rnd() * 79999999)),
          school: pick(SCH[pl[1]]), grade: (1 + Math.floor(rnd() * (pl[1] === '초등부' ? 6 : 3))) + '학년',
          division: pl[0], category: pl[1], payStatus: rnd() < .9 ? '입금 확인' : '입금 대기', appliedAt: '2026-02-' + d + ' 1' + Math.floor(rnd() * 9) + ':00:00',
          pieces: pl[0] === '성악' ? vocalPieces(pl[1]) : ''
        });
        // 74회 엑셀처럼 '성악(여)' · '대학·일반부'로 들어와도 같은 부문으로 묶이는지 보여 주는 예
        if (pl[0] === '성악' && pl[1] === '대학일반부' && i % 2) { var lr = rows[rows.length - 1]; lr.division = '성악(' + (lr.gender === '여성' ? '여' : '남') + ')'; lr.category = '대학·일반부'; }
      }
    });
    st.reset();
    st.upsert('Config', 'key', [
      { key: 'title', value: '제75회 이화경향음악콩쿠르 (' + (PRACTICE ? '연습' : '데모') + ')' }, { key: 'adminPassword', value: 'admin' }, { key: 'deskPin', value: '0000' },
      { key: 'publishR1Schedule', value: 'Y' }, { key: 'notice', value: '데모 화면입니다. 실제 참가자 정보가 아닌 가상 데이터예요.' },
      { key: 'calendarNote', value: '*전국연합학력평가(고등학생) : 3월 26일(목) — 예시 메모' }
    ]);
    var tk = KC.handle({ action: 'login', params: { role: 'admin', secret: 'admin' } }, st).data.token;
    var H = function (a, p) { var r = KC.handle({ action: a, params: p, token: tk }, st); if (!r.ok) console.warn(a, r.error); return r.data; };
    H('importParticipants', { rows: rows });
    // 시간표 설계(75회 방식)로 예선 계획을 세우고 '계획대로 조편성'
    var L = H('adminLoad', {});
    var paid = function (k) { return L.participants.filter(function (p) { return p.groupKey === k && KC.isPaid(p) && KC.isActive(p); }).length; };
    var G = [['피아노|초등부', 200, 10], ['피아노|중등부', 200, 12], ['바이올린|초등부', 200, 15], ['성악|고등부(남)', 180, 18], ['성악|고등부(여)', 180, 18], ['성악|대학일반부(남)', 180, 18], ['성악|대학일반부(여)', 180, 18]];
    H('saveGroups', { groups: G.map(function (x) { return { groupKey: x[0], perSec: String(x[1]), groupSize: String(x[2]) }; }) });
    var blk = function (k, more) { var x = G.filter(function (g) { return g[0] === k; })[0]; return Object.assign({ groupKey: k, count: paid(k), perSec: x[1], size: x[2] }, more || {}); };
    H('savePlan', { round: 'R1', days: [
      { date: '2026-03-25', start: '11:00', piano: 'Y', venue: '이화여고 유관순기념관', blocks: [blk('피아노|중등부')] },
      { date: '2026-03-26', start: '10:40', piano: 'Y', venue: '이화여고 유관순기념관', blocks: [blk('피아노|초등부')] },
      { date: '2026-03-27', start: '09:30', piano: 'Y', venue: '이화여고 유관순기념관', blocks: [blk('바이올린|초등부'), blk('성악|고등부(남)', { pmOnly: true }), blk('성악|고등부(여)')], note: '오후 성악 심사위원 교체' },
      { date: '2026-03-30', start: '09:30', piano: 'Y', venue: '이화여고 유관순기념관', blocks: [blk('성악|대학일반부(남)'), blk('성악|대학일반부(여)', { pmOnly: true })] }
    ] });
    H('applyPlan', { round: 'R1', farAfternoon: true });
    var J = [];
    ['김예선', '이예선', '박예선', '최예선', '정예선'].forEach(function (n, i) { J.push({ name: n, affiliation: '데모대학교', pin: '100' + (i + 1), round: 'R1', groups: '피아노', seat: String(i + 1) }); });
    ['강심사', '조심사', '윤심사', '장심사', '임심사'].forEach(function (n, i) { J.push({ name: n, affiliation: '데모음대', pin: '200' + (i + 1), round: 'R1', groups: '바이올린, 성악', seat: String(i + 1) }); });
    ['한본선', '오본선', '서본선', '신본선', '권본선', '황본선', '안본선'].forEach(function (n, i) { J.push({ name: n, affiliation: '데모예술대', pin: '700' + (i + 1), round: 'R2', groups: '전체', seat: String(i + 1) }); });
    H('saveJudges', { judges: J });
    // 인력(심사위원 위촉·진행요원 계약) 예시 — 개인정보 암호화 키는 데모용 (키 비밀번호 demo1234)
    H('setConfig', { values: { pubKey: DEMO_KEY.pub, privKeyEnc: DEMO_KEY.privEnc, gonggyeolOpen: 'Y', manager: '담당자', eventPeriod: '' } });
    var sid = H('saveStaff', { staff: [
      { kind: 'judge', name: '김예선', affiliation: '데모대학교', title: '교수', phone: '010-2000-0001', email: 'judge1@example.com' },
      { kind: 'judge', name: '한본선', affiliation: '데모시립교향악단', orgHead: '데모시립교향악단장', title: '단원', phone: '010-2000-0002' },
      { kind: 'staff', name: '진행일', phone: '010-3000-0001' }, { kind: 'staff', name: '진행이', phone: '010-3000-0002' }, { kind: 'staff', name: '진행삼', phone: '010-3000-0003' }] });
    var JJ = H('adminLoad', {}).judges.map(function (j) { return j.name === '김예선' ? Object.assign({}, j, { staffId: sid[0] }) : j.name === '한본선' ? Object.assign({}, j, { staffId: sid[1] }) : j; });
    H('saveJudges', { judges: JJ });
    var W = [];
    ['2026-03-25', '2026-03-26', '2026-03-27', '2026-03-30'].forEach(function (d, i) {
      W.push({ staffId: sid[2], date: d, planStart: '08:30', planEnd: '17:00', role: '대기실' });
      if (i % 2 === 0) W.push({ staffId: sid[3], date: d, planStart: '08:30', planEnd: '17:00', role: '접수' });
      if (i >= 2) W.push({ staffId: sid[4], date: d, planStart: '12:30', planEnd: '17:30', role: '무대' });
    });
    H('saveWork', { rows: W });
  }
  var DEMO_KEY = {"pub": "MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA4sDkPariOy8JDz2h80kt0xj_6nx2DTSVkMnYcBYlqMdwwnWAghClNYVwP8wItekFFOVT32ocTn_BBSPOE0zbpWJvBsM1prauM75LJSKgPeO1JHy5kDfgKeQaOI_H3DTWEucrRYGx3kTcD9JBKMLknyctiWVwrgYJkbmb2kB9NI_3Q4G3NLwg9-X89l8tcvsOGDMjp_gXhiC9ULabiqlrbcqJHjm9QxJ5xnhskctKLp0WcFo1clT2jNe6FsP2zBgiBF3foRO4Nci0I09sAppzk8GbyEIFoC20e2ddbJdL4gWwIb_7RBTrD-kQWdyA_qpCVqEwnWAvooycpe5Nt1YFPU3jy2xpc7ozfjVcDnR3PVsQS-zZNvmK2SNPAFJKc1JvVQkJXrDJva9XYBHXPJ3pmepWh5KMvUOwLQO8HmRG5vsUwEDtPOgF03UZyJ72IthJr3YnYFp-Zdfm5CgXuBQLB_lPn4QovJzWkLR7TzITFFRda6Y9iJB9rhcLLrYzRjMlAgMBAAE", "privEnc": "K1.bK0kmsyfROr-4kFsV3wg3w.uyA3kkNLuj3q71c4.d3P-K-JSEQ1H8IqmMWC4NCuzLtQRjN4KnTAVMiHGYR8sIg9QBrUO9Ii8xsTtmfy2KYwClwwrPbrY2PxArUmGdIe97HUcFT5jf9nUBnVTyMjheUIvOXtV4iIVALuPbJVhGGNPIKkPYRHjHM4bgm3Quv7QflbNkuOgbGz4c5Ur32WSGDdXOilbCAT9W530JD4RchmFu76cxl4MGLrv8vbNXurHG2ePwSS_Fgqsi6F1056QXq56emsXzvMoSZiTChdTcA_34S8UQfolw8TysNGOFaxhtSUNElHPTU06jHd1DLw8i_LqfWcAGGfa2SpcS3YmbDAcEfJ00vFQJB0XNp3bbSzkoyUBLaxxmBJ_PXI3xC2gZ5uCz1tSKTIjPP2Z2NZdP2IqKDSyuobK4UOSrIZcbK5ly6ngFzr0jCliGnfgu3Dioi1dcK09rvb-FaqlEtEUDAryYzfPltykeDTO3nDbIn1HvTf0Pgqdv8xrfpT_LFUH3zR6ojE3aJ6PfoW35HqGX1ElH_YOEGjqjsfKOBBSkkLO0bnBM6bJsZKiA0Sf7SjuDXN-cJZy0fu4V0lhxn6aTYLtP8yB8gxaazq7SVx1JiFouRntJhPIcYTGahJ7atax7BbiJqS38K1bjSIcr9Xqn2Xgs-ZF4zHUQE-fNEUxX12nO4hDHWntPocAbTKrMNXs9JtjWfgSVJfXgPvZfBrl26nrmGnwTuRkuWj1M6jp-JYj93_Aw2RWmBwUFRjg7C1_GMdXsYvVrCb5rFp-eA5eRZJFDQYNTV8EzwmE9YbcJSl3-6y7TtEPOZbO55Ecv3gBLl29aJrob1r1Oi_9pFUFXUz-BKc_txMTgV8SwdKfKwllwc5pu0OM-FBGTESgJo72faY2ady4cB8ihK4XPcClSuATNI3T2W7XuV2q9wfgivDqGgNnRMIRf2mMQ1SqhEbw_ChVd-PjcWRwsqtELAgyWONXThr_Cp6E4tPLHimG_bANb6WjfY8-zNkWY-z3Z19tXEPWY0fRlVb4b0EFDEN8aZzzttBd-B0GlZmC5XzCjIUqdTL5--cJEtb4oQuTa4r60m_TVLKOTMhIpLoHmCVL95q4Zm2Hqj4SwE0ivum0NsoW6zooBADCSrVxu_OossxHROY5fGvTCO-Gakrb84XixqiZjGja2tHWwlLR_8VDNHsflQhzV2WS7xIDycsn6MbHBhwrxXdwb7bL--Vv_QkyDS-JqMS42Gvj9EtQeBIDrPE_oTZANV8HmAvpjwlneC1SoB-nSv8Nljo7IGYnH6dCbxYGpgM8g6H6l7VMiSdUirfA24hacTu53TyOvOfqfvsHs-vLJGluHFPZn0RsZUTOBPdMeIj9iKm7-JjehNXR5YPQiFRkJVGKe7F9GZ3NQz1yE5QCMRp2Sot3x6GzmovFadFy_XDdrAD65QdbgW-wKg1UX_2gQppl3riuyVA221sHY9j3jR57kBaHfczwbPkwPgWP5GJXFfEoEj1GsX2mYdjY8_iuh0-gC9CRGFAvS8JQbr2oOh5aTPTe5BydWyYiVpwVDQrWsJe1chZWKfA_P-sfoYvbY0DRK2n132i49UnIt4JXMkhTlS-Hrff7MDo2r0SWVPjPHrrhLLZecMDFY5Izvp7rK7W03zxunms_WESj96Fe_5fuGeOZIx9eXdqepKH8wZlnRn0m9S34ID56R-PMZeOteXsMWgKCgbG9Zvv1IK3RLsk-t7jki7ArLlkKbjeu2Eu73ilXUmtvFnVf08TXfvoxktdJ1_7eZlW5Lui_7aPj62myx5_k0ly-m6bdr67Q52sQW4RaUiC1MECNvzETnF9lDaUEt2dbmWQPokfcR5YsfVxxKH8jucwzZsv0Uo9WA3cDARxMDOo1NwYDMBRVpx-wZaql9X3Q9dFX6CKrsaUYVtV6DZFawfWZelwxRdfPmTu7i-dOhubvayXmPKU2tWpnAjx_5ILuHetgo40ZGGLXLTd5cmTXKol0tlVFwpw1BuR_oOYrnqwJqyfbBJfkOf-TzL8AMYiNXIjFd-k_MLY-1tHymxeY5R7uD8JI8BYsOJoKOPMS5zvJJilio74OflTVnwYVPtCPp6ZjnWXLkq4N9NFtsjxoh3AIB-FFmNZXWfD7u-I9gUsGmrpe2ogCNBm_1-nngzftkwQuqZGj3rdWnf-sZejwYRh1LJtX1xXE0oeDkMHtVWBRfGDZQm341zV87y-Dpi5nRoh4XZ4X4tJJ_wHIk-hX3UOfP4169Os6BakgmRQAcOUSOhD8fsu0QjT4Gycxbg0vXMfHOlTP4LQqtxTSvfwgH4W5g0u1GkTIg0G9PxdRpGMG0chkO8l5Zp65fVvI1j0mzNGCoGxoqAz0WkA953uOEZGv9MO4OM3ljsybSWiFZpPVhqTg11Y0jFvsJdGd7eHb1cxmIbMaqA"};
  function store() {
    if (!demoStore) { demoStore = KCLocalStore.create({ key: DB_KEY }); if (demoStore.isEmpty()) seedDemo(demoStore); }
    return demoStore;
  }
  function resetDemo(empty) { var st = store(); if (empty) seedEmpty(st); else seedDemo(st); }
  // 연습 끝내기: wipe = 이 브라우저에 남은 연습 자료(실제 명단을 넣었을 수도 있음)까지 지움
  function endPractice(wipe) {
    try {
      if (wipe) { localStorage.removeItem('kc_practice_db_v1'); ['admin', 'desk', 'judge', 'participant', 'staff'].forEach(function (r) { localStorage.removeItem('kc_tk_' + r + '_demo'); }); }
      localStorage.removeItem('kc_practice');
    } catch (e) { }
    location.href = location.pathname;
  }

  /* ---------- API ---------- */
  function tokenKey(role) { return 'kc_tk_' + role + (DEMO ? '_demo' : ''); }
  function getToken(role) { try { return sessionStorage.getItem(tokenKey(role)); } catch (e) { return null; } }
  function setToken(role, t) { try { if (t) sessionStorage.setItem(tokenKey(role), t); else sessionStorage.removeItem(tokenKey(role)); } catch (e) { } }
  function api(action, params, role) {
    var req = { action: action, params: params || {}, token: role ? getToken(role) : null };
    var p;
    if (DEMO && /^gas\./.test(action)) p = demoGas(req);
    else if (DEMO) p = new Promise(function (res) { setTimeout(function () { res(KC.handle(JSON.parse(JSON.stringify(req)), store())); }, 60); });
    else p = fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.', network: true }; });
    return p.then(function (r) {
      if (!r.ok) { var e = new Error(r.error); e.needLogin = !!r.needLogin; e.network = !!r.network; if (r.needLogin && role) setToken(role, null); throw e; }
      return r.data;
    });
  }

  /* ---------- DOM 도우미 ---------- */
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg, kind) {
    var box = $('#toast'); if (!box) { box = document.createElement('div'); box.id = 'toast'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    var d = document.createElement('div'); d.className = kind || ''; d.textContent = msg; box.appendChild(d);
    setTimeout(function () { d.remove(); }, kind === 'bad' ? 5000 : 2600);
  }
  function modal(html, opts) {
    opts = opts || {};
    var bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal ' + (opts.wide ? 'wide' : '') + ' fade" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(bg);
    var close = function () { bg.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('click', function (e) { if (e.target === bg && !opts.sticky) close(); });
    $$('[data-close]', bg).forEach(function (b) { b.addEventListener('click', close); });
    var first = $('input,select,textarea', bg); if (first) setTimeout(function () { first.focus(); }, 30);
    return { el: bg.firstChild, close: close };
  }
  function confirmBox(msg, okLabel, danger) {
    return new Promise(function (res) {
      var m = modal('<h2>확인</h2><p style="white-space:pre-line">' + esc(msg) + '</p><div class="row end"><button data-close>취소</button><button class="' + (danger ? 'danger' : 'pri') + '" id="cfok">' + esc(okLabel || '확인') + '</button></div>', { onClose: function () { res(false); } });
      $('#cfok', m.el).addEventListener('click', function () { res(true); m.close(); });
    });
  }
  function busy(btn, on) { if (!btn) return; if (on) { btn.dataset.t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '처리 중…'; } else { btn.disabled = false; if (btn.dataset.t) btn.innerHTML = btn.dataset.t; } }

  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function fmtDate(d, withYear) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); if (!m) return d || '';
    var dt = new Date(+m[1], +m[2] - 1, +m[3]);
    return (withYear ? m[1] + '년 ' : '') + (+m[2]) + '월 ' + (+m[3]) + '일(' + WD[dt.getDay()] + ')';
  }
  function fmtBirth(b) { b = String(b || ''); return b.length === 6 ? b.slice(0, 2) + '.' + b.slice(2, 4) + '.' + b.slice(4) : b; }
  function phone4(p) { p = String(p || '').replace(/\D/g, ''); return p ? '***-' + p.slice(-4) : ''; }
  function today() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  function applyTheme(color) { if (color && /^#[0-9a-f]{6}$/i.test(color)) document.documentElement.style.setProperty('--accent', color); }
  function demoBar() {
    if (!DEMO) return;
    var d = document.createElement('div'); d.className = 'demo-bar';
    var pins = '관리자 <b>admin</b> · 현장 PIN <b>0000</b>';
    if (PRACTICE) {
      d.innerHTML = '<b>연습 모드</b> · 실제 운영DB와 따로, <u>이 브라우저에만</u> 저장돼요 · ' + pins +
        ' <span class="db-btns"><button data-db="fill">가상 자료로 채우기</button><button data-db="empty">비우고 시작</button><button data-db="end">연습 끝내기</button></span>';
    } else {
      d.innerHTML = '<b>데모 모드</b> · 이 브라우저 안에서만 저장되는 가상 데이터예요. ' + pins + ' · 예선 심사 PIN <b>1001~1005</b>(피아노) <b>2001~2005</b>(바이올린·성악) · 본선 심사 PIN <b>7001~7007</b>';
    }
    document.body.insertBefore(d, document.body.firstChild);
    var on = function (k, fn) { var b = d.querySelector('[data-db="' + k + '"]'); if (b) b.addEventListener('click', fn); };
    on('fill', function () { confirmBox('연습 자료를 지우고 가상 참가자·조편성·심사위원으로 다시 채울까요?', '다시 채우기', true).then(function (ok) { if (ok) { resetDemo(false); location.reload(); } }); });
    on('empty', function () { confirmBox('연습 자료를 모두 비울까요? 기본 설정만 남아요. 그다음 참가자 탭에서 신청자 엑셀을, 심사위원 탭에서 명단을 넣어 연습하면 돼요.', '비우기', true).then(function (ok) { if (ok) { resetDemo(true); location.reload(); } }); });
    on('end', function () {
      var m = modal('<h2>연습 끝내기</h2><p>실제 운영 화면으로 돌아가요. 연습하면서 넣은 자료(실제 명단을 넣었다면 그것도)는 이 브라우저에 남아 있어요.</p>' +
        '<div class="row end" style="margin-top:12px"><button data-close>취소</button><button id="pk">남겨 두고 끝내기</button><button class="pri" id="pw">지우고 끝내기</button></div>');
      $('#pk', m.el).addEventListener('click', function () { endPractice(false); });
      $('#pw', m.el).addEventListener('click', function () { endPractice(true); });
    });
  }
  /* ---------- 시각 입력: 브라우저 시계 칸(오전/오후·시계 아이콘 때문에 잘려 보임) 대신 24시 'HH:MM' 글자 칸 ----------
   * 화면에 생기는 input[type=time]을 모두 글자 칸(.tm)으로 바꾸고, 다 쓰면(change) '930' '1330' '13시30분' '오후 1:30'도 13:30처럼 맞춰 줌 */
  function normT(v) {
    v = String(v || '').trim(); if (!v) return '';
    var pm = /오후|pm/i.test(v), am = /오전|am/i.test(v), h, m;
    var x = v.replace(/오전|오후|am|pm|\s/gi, '');
    var a = /^(\d{1,2})\s*[:시.]\s*(\d{1,2})?\s*분?$/.exec(x);
    if (a) { h = +a[1]; m = +(a[2] || 0); }
    else if (/^\d{1,4}$/.test(x)) { if (x.length <= 2) { h = +x; m = 0; } else { h = +x.slice(0, x.length - 2); m = +x.slice(-2); } }
    else return v;
    if (pm && h < 12) h += 12; if (am && h === 12) h = 0;
    if (h > 23 || m > 59) return v;
    return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
  }
  function fixTimeInputs() {
    var els = document.querySelectorAll('input[type=time]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], v = el.value;
      el.type = 'text'; el.classList.add('tm'); el.setAttribute('inputmode', 'numeric'); el.setAttribute('maxlength', '8'); el.setAttribute('autocomplete', 'off');
      if (!el.placeholder) el.placeholder = '09:50';
      el.value = v;
    }
  }
  try {
    new MutationObserver(fixTimeInputs).observe(document.documentElement, { childList: true, subtree: true });
    // 다른 처리보다 먼저(capture) 시각을 맞춰서, 저장하는 쪽은 늘 'HH:MM'을 받게
    document.addEventListener('change', function (e) { var t = e.target; if (t && t.classList && t.classList.contains('tm')) { var n = normT(t.value); if (n !== t.value) t.value = n; t.classList.toggle('bad', !!t.value && !/^\d{2}:\d{2}$/.test(t.value)); } }, true);
  } catch (e) { }

  // 운영 화면 로그인 아래에 붙이는 '연습 모드로 열기' 안내 (운영 주소에서만)
  function practiceLink() {
    if (DEMO) return '';
    return '<p class="small muted" style="text-align:center;margin-top:14px"><a href="?practice=1">연습 모드로 열기</a> — 실제 운영DB와 따로, 이 브라우저에서만 조편성·채점 등을 시험해 볼 수 있어요.</p>';
  }

  /* ---------- 로그인 화면 ---------- */
  function loginView(target, role, title, hint, onDone) {
    var numeric = role !== 'admin';
    target.innerHTML = '<div class="wrap narrow" style="padding-top:48px;padding-bottom:48px"><div class="card fade"><h2>' + esc(title) + '</h2><p class="muted small">' + esc(hint || '') + '</p>' +
      '<form id="lf"><div class="field"><label class="f" for="lp">' + (numeric ? 'PIN' : '비밀번호') + '</label><input id="lp" type="password" ' + (numeric ? 'inputmode="numeric" autocomplete="one-time-code"' : 'autocomplete="current-password"') + ' required></div>' +
      '<button class="pri big" style="width:100%">들어가기</button></form></div></div>';
    $('#lf', target).addEventListener('submit', function (e) {
      e.preventDefault();
      var b = $('button', target); busy(b, true);
      api('login', { role: role, secret: $('#lp', target).value }).then(function (r) { setToken(role, r.token); onDone(r); })
        .catch(function (err) { toast(err.message, 'bad'); busy(b, false); });
    });
  }

  /* ---------- 엑셀 ---------- */
  var FIELD_SYNONYMS = {
    id: ['번호', '접수번호', '신청번호', '참가번호', 'no', 'No'], name: ['이름', '성명', '참가자명', '참가자', '성 명'],
    birth: ['생년 월일', '생년월일', '생일', '생년'], gender: ['성별'], phone: ['휴대폰 번호', '휴대폰번호', '휴대폰', '핸드폰', '연락처', '휴대전화'],
    guardianName: ['보호자 성명', '보호자명', '보호자 이름', '보호자'], guardianPhone: ['보호자 휴대폰번호', '보호자 휴대폰', '보호자 연락처', '보호자 전화번호', '보호자 번호'],
    email: ['이메일', 'email', 'E-mail'], zip: ['우편번호', '우편 번호'], address: ['주소 1', '주소1', '주소', '기본주소'], address2: ['주소 2', '주소2', '상세주소', '상세 주소'], school: ['학교', '소속', '학교명'], grade: ['학년'], division: ['지원 부문', '지원부문', '부문', '악기', '참가부문'],
    category: ['지원 구분', '지원구분', '구분', '참가구분', '학년구분'], payStatus: ['결제 상태', '결제상태', '입금상태', '입금 여부'],
    appliedAt: ['신청일', '신청일시', '접수일'], status: ['신청상태', '신청 상태', '상태'], teacher: ['사사선생님', '사사 선생님', '지도교사', '지도 선생님'], note: ['비고']
  };
  var FIELD_LABEL = { id: '접수번호', name: '이름', birth: '생년월일', gender: '성별', phone: '휴대폰', guardianName: '보호자 이름', guardianPhone: '보호자 휴대폰', email: '이메일', zip: '우편번호', address: '주소', address2: '상세 주소', school: '학교', grade: '학년', division: '지원 부문', category: '지원 구분', payStatus: '결제 상태', appliedAt: '신청일', status: '신청 상태', teacher: '사사 선생님', note: '비고' };
  function readWorkbook(file) {
    return file.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array', cellDates: false });
      return wb.SheetNames.map(function (n) { return { name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }) }; });
    });
  }
  function findHeaderRow(rows, must) {
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var r = rows[i].map(function (x) { return String(x).replace(/\s+/g, ' ').trim(); });
      if (must.every(function (m) { return r.some(function (c) { return c.indexOf(m) >= 0; }); })) return i;
    }
    return -1;
  }
  function autoMap(header) {
    var h = header.map(function (x) { return String(x).replace(/\s+/g, ' ').trim(); });
    var map = {};
    Object.keys(FIELD_SYNONYMS).forEach(function (f) {
      var syn = FIELD_SYNONYMS[f], idx = -1;
      syn.some(function (sy) { idx = h.indexOf(sy); return idx >= 0; });
      if (idx < 0) syn.some(function (sy) { idx = h.findIndex(function (c) { return c.replace(/\s/g, '') === sy.replace(/\s/g, ''); }); return idx >= 0; });
      if (f === 'guardianName' && idx >= 0 && /휴대|연락|번호|이메일|관계/.test(h[idx])) idx = -1;
      map[f] = idx;
    });
    return map;
  }
  // 곡목 열을 라운드·곡별로 묶기: '예선 가곡 국가 / 예선 가곡 작곡가 / 예선 가곡 곡명', '본선 한국가곡 곡명' …
  // → [{round:'R1', kind:'가곡', country, composer, title}, …] (머리글 순서대로 ①②③)
  var PIECE_RE = /^(예선|본선|1차|2차)\s*(.*?)\s*(국가|작곡가|곡명|작품명|곡\s*제목)$/;
  function piecesFrom(header, row) {
    var map = {}, order = [];
    header.forEach(function (h, i) {
      var m = PIECE_RE.exec(String(h).replace(/\s+/g, ' ').trim());
      if (!m) return;
      var round = (m[1] === '본선' || m[1] === '2차') ? 'R2' : 'R1', kind = m[2] || '곡';
      var key = round + '|' + kind;
      if (!map[key]) { map[key] = { round: round, kind: kind, country: '', composer: '', title: '' }; order.push(key); }
      var v = String(row[i] == null ? '' : row[i]).trim(); if (v === '0') v = '';
      var f = m[3] === '국가' ? 'country' : m[3] === '작곡가' ? 'composer' : 'title';
      map[key][f] = v;
    });
    var arr = order.map(function (k) { return map[k]; }).filter(function (x) { return x.title || x.composer; });
    arr.sort(function (a, b) { return a.round === b.round ? 0 : a.round < b.round ? -1 : 1; });
    return arr.length ? JSON.stringify(arr) : '';
  }
  function hasPieceColumns(header) { return header.some(function (h) { return PIECE_RE.test(String(h).replace(/\s+/g, ' ').trim()); }); }
  // 곡목 표시용 HTML (①②③ 번호 + 구분 + 국가 / 작곡가 / 곡명)
  function piecesHTML(list, opts) {
    opts = opts || {};
    if (!list || !list.length) return opts.empty || '';
    var mark = '①②③④⑤⑥';
    return '<ol class="pcs' + (opts.cls ? ' ' + opts.cls : '') + '">' + list.map(function (x, i) {
      return '<li><span class="pn">' + mark.charAt(i) + '</span><span>' + (x.kind ? '<em>' + esc(x.kind) + (x.country ? ' · ' + esc(x.country) : '') + '</em> ' : (x.country ? '<em>' + esc(x.country) + '</em> ' : '')) +
        (x.composer ? '<b>' + esc(x.composer) + '</b> ' : '') + esc(x.title) + '</span></li>';
    }).join('') + '</ol>';
  }
  function writeXlsx(sheets, filename) {
    var wb = XLSX.utils.book_new();
    sheets.forEach(function (s) {
      var ws = XLSX.utils.aoa_to_sheet(s.rows);
      ws['!cols'] = (s.rows[0] || []).map(function (h, i) {
        var w = String(h).length;
        s.rows.slice(1, 60).forEach(function (r) { w = Math.max(w, String(r[i] == null ? '' : r[i]).length); });
        return { wch: Math.min(40, w + 2) };
      });
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31).replace(/[\\\/\?\*\[\]:]/g, ' '));
    });
    XLSX.writeFile(wb, filename);
  }

  /* ---------- 인쇄 ---------- */
  function printHTML(html, opt) {
    var root = $('#print-root'); if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = (opt && opt.landscape ? '<style>@media print { @page { size: A4 landscape; margin: 10mm; } }</style>' : '') + html;
    setTimeout(function () { window.print(); }, 120);
  }
  function qrSvg(text, cell) {
    if (typeof qrcode === 'undefined') return '<div style="width:34mm;height:34mm;border:1px solid #000;display:grid;place-items:center;font-size:8pt">QR</div>';
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: cell || 4, margin: 0, scalable: true });
  }
  // 접수증 1장
  function receiptHTML(info, v, round) {
    round = round || 'R1';
    var r = (v.rounds || {})[round] || {}, se = r.session;
    var rname = r.name || (round === 'R2' ? '본선' : '예선');
    var when = se ? fmtDate(se.date, true) + ' · ' + esc(se.label) : '일정 공지 전';
    var times = se ? '추첨 ' + esc(se.drawTime) + ' / 경연 시작 ' + esc(se.startTime) + (se.endTime ? ' (예상 종료 ' + esc(se.endTime) + ')' : '') : '';
    return '<div class="receipt">' +
      '<div class="rh"><div><div style="font-size:10pt">' + esc(info.organizer || '') + '</div><b>' + esc(info.title || '') + '</b></div><span>' + esc(rname) + ' 접수증</span></div>' +
      '<div class="rb"><table>' +
      '<tr><th>접수번호</th><td><b>' + esc(v.id) + '</b></td></tr>' +
      '<tr><th>성명</th><td><b style="font-size:13pt">' + esc(v.name) + '</b> <span style="font-size:10pt">(' + esc(fmtBirth(v.birth)) + ')</span></td></tr>' +
      '<tr><th>부문</th><td>' + esc(v.groupLabel) + '</td></tr>' +
      '<tr><th>학교·학년</th><td>' + esc(v.school) + ' ' + esc(v.grade) + '</td></tr>' +
      '<tr><th>' + esc(rname) + ' 일시</th><td><b>' + when + '</b><br>' + times + '</td></tr>' +
      '<tr><th>장소</th><td>' + esc(se ? se.venue : info.venue || '') + '</td></tr>' +
      '</table><div class="qr">' + qrSvg('KC:' + v.token) + '현장 확인용 QR<br>' + esc(v.token) + '</div></div>' +
      '<div class="order"><div>경연순번 (추첨 후 기입)</div><div>본인 확인 (진행요원)</div></div>' +
      '<div class="rn">' + esc(info.receiptNote || '') + '<br>문의: ' + esc(info.contact || '') + '</div></div>';
  }


  /* ---------- 구글 드라이브 연동 (gas.*) — 데모에서는 브라우저 안에서 흉내 ---------- */
  function demoGas(req) {
    var a = req.action, p = req.params || {}, st = store();
    var H = function (action, params, token) { return KC.handle({ action: action, params: params, token: token }, st); };
    return new Promise(function (res) {
      setTimeout(function () {
        if (a === 'gas.upload') {
          var ref = p.kind === 'sign' ? 'data:image/png;base64,' + String(p.b64).replace(/^data:[^,]+,/, '') : 'demo:' + String(p.fileName || p.kind + '.jpg').slice(0, 100);
          var r = p.who === 'prize' ? H('prizeAttach', { name: p.name, birth: p.birth, phone4: p.phone4, id: p.id, pid: p.pid, kind: p.kind, ref: ref })
            : H('staffAttach', { t: p.t, phone4: p.phone4, kind: p.kind, ref: ref });
          if (!r.ok) return res(r);
          return res({ ok: true, data: { ok: true, ocrError: p.ocr ? '데모에서는 글자 인식(OCR)을 하지 않아요. 실제 운영에서는 구글 드라이브가 사진 속 글자를 읽어 칸을 채워 줍니다.' : '' } });
        }
        if (a === 'gas.status') return res({ ok: true, data: { demo: true, templates: {} } });
        if (a === 'gas.pdf') return res(H('myDoc', p));
        res({ ok: false, error: '데모 모드에서는 구글 문서·시트를 만들 수 없어요. 워드·엑셀로 받기를 눌러 주세요.', demo: true });
      }, 80);
    });
  }

  /* ---------- 파일 ---------- */
  function downloadBlob(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function b64ToBlob(b64, mime) { var bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime || 'application/octet-stream' }); }
  function safeName(t) { return String(t || '문서').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim(); }
  // 사진은 긴 변 2000px JPEG로 줄여서 올림 (휴대폰 사진 10MB → 0.5MB 안팎, 글자 인식에는 충분)
  function fileToData(file, maxPx) {
    maxPx = maxPx || 2000;
    return new Promise(function (res, rej) {
      if (!file) return rej(new Error('파일을 골라 주세요.'));
      if (file.size > 15 * 1024 * 1024) return rej(new Error('파일이 너무 커요 (15MB까지).'));
      var rd = new FileReader();
      rd.onerror = function () { rej(new Error('파일을 읽지 못했어요.')); };
      rd.onload = function () {
        var url = rd.result;
        if (!/^image\/(jpeg|png|webp|gif)/.test(file.type)) return res({ b64: url.split(',')[1], mime: file.type || 'application/pdf', name: file.name });
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, maxPx / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          res({ b64: c.toDataURL('image/jpeg', 0.86).split(',')[1], mime: 'image/jpeg', name: file.name.replace(/\.\w+$/, '') + '.jpg' });
        };
        img.onerror = function () { res({ b64: url.split(',')[1], mime: file.type, name: file.name }); };
        img.src = url;
      };
      rd.readAsDataURL(file);
    });
  }
  var SEAL = null;
  function sampleSeal() {
    if (SEAL) return Promise.resolve(SEAL);
    return fetch('templates/sample_seal.png').then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (b) {
      if (!b) return null; var u = new Uint8Array(b), s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); SEAL = btoa(s); return SEAL;
    }).catch(function () { return null; });
  }
  /* 워드(.docx)로 받기 — 데모·비상용. 직인은 '견본' 그림 */
  function docxDownload(data, name) {
    if (typeof DF === 'undefined' || typeof JSZip === 'undefined') return Promise.reject(new Error('워드 만들기 도구(lib/jszip)가 없어요.'));
    return Promise.all([fetch('templates/' + data.file).then(function (r) { if (!r.ok) throw new Error('양식 파일을 찾지 못했어요: ' + data.file); return r.arrayBuffer(); }), data.seal ? sampleSeal() : null])
      .then(function (x) {
        var images = {}; if (x[1] && data.seal) { images.직인 = Object.assign({ data: x[1] }, data.seal); }
        if (data.lines) return DF.linesDocx(x[0], data, { type: 'blob' });
        return DF.fill(x[0], { fields: data.fields, pages: data.pages, images: images }, { type: 'blob' });
      }).then(function (blob) { downloadBlob(blob, safeName(name || data.title) + '.docx'); });
  }
  function sheetDownload(data, name) {
    var list = FM.toAOA(data);
    if (!list.length) throw new Error('만들 내용이 없어요.');
    writeXlsx(list.map(function (x) { return { name: x.name, rows: x.aoa }; }), safeName(name || data.title) + '.xlsx');
  }
  // 서버로 보낼 때 암호문·참조 자료는 빼고, 양식이 없을 때를 대비해 표 모양(aoa)을 붙임
  function slim(data) {
    var o = {}; Object.keys(data).forEach(function (k) { if (k !== 'refs' && k !== 'fullKeys') o[k] = data[k]; });
    if (data.type === 'sheet' && !data.generic) o.aoa = FM.toAOA(data);
    return o;
  }
  function myDocDownload(params) {
    return api('gas.pdf', params).then(function (r) {
      if (r.b64) { downloadBlob(b64ToBlob(r.b64, 'application/pdf'), r.name); return; }
      // 데모: 저장해 둔 칸 값으로 워드 파일을 다시 만듦
      var f = {}; try { f = JSON.parse(r.fields || '{}'); } catch (e) { }
      var F = FM.FORMS[r.kind] || {};
      return docxDownload({ file: F.file, fields: {}, pages: [{ fields: f, rows: f.__rows || [] }], seal: { w: 21, h: 21, overlay: true, dx: -14, dy: -6 }, title: r.title }, r.title);
    });
  }

  // 머리글 왼쪽 위: 로고 + 회차 없는 이름. 내장 SVG 로고는 글자색(흰색)으로 칠함, 그 밖의 이미지는 그대로
  function brandHTML(b, subHTML) {
    b = b || {};
    var lg = b.logo ? (/^img\/[\w.-]+\.svg$/.test(b.logo)
      ? '<span class="blogo" aria-hidden="true" style="-webkit-mask-image:url(' + b.logo + ');mask-image:url(' + b.logo + ')"></span>'
      : '<img class="blogo img" src="' + esc(b.logo) + '" alt="">') : '';
    return '<div class="brand">' + lg + '<div class="bt">' + esc(b.name || '') + (subHTML ? '<small>' + subHTML + '</small>' : '') + '</div></div>';
  }

  return {
    brandHTML: brandHTML,
    normT: normT, DEMO: DEMO, PRACTICE: PRACTICE, practiceLink: practiceLink, endPractice: endPractice, api: api, getToken: getToken, setToken: setToken, resetDemo: resetDemo, store: store,
    $: $, $$: $$, esc: esc, toast: toast, modal: modal, confirmBox: confirmBox, busy: busy,
    fmtDate: fmtDate, fmtBirth: fmtBirth, phone4: phone4, today: today, applyTheme: applyTheme, demoBar: demoBar,
    loginView: loginView, readWorkbook: readWorkbook, findHeaderRow: findHeaderRow, autoMap: autoMap, piecesFrom: piecesFrom, hasPieceColumns: hasPieceColumns, piecesHTML: piecesHTML,
    FIELD_LABEL: FIELD_LABEL, writeXlsx: writeXlsx, printHTML: printHTML, qrSvg: qrSvg, receiptHTML: receiptHTML,
    downloadBlob: downloadBlob, b64ToBlob: b64ToBlob, fileToData: fileToData, docxDownload: docxDownload, sheetDownload: sheetDownload, slim: slim, myDocDownload: myDocDownload, safeName: safeName
  };
})();
