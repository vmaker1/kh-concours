/* 관리자 화면 — '문서·출력' 탭과 '인력·지급' 탭
 * admin.html 이 window.ADM 으로 D(전체 자료)·call·refresh 등을 넘겨 줍니다. */
var ADMX = (function () {
  'use strict';
  var A = function () { return window.ADM; };
  var $ = App.$, $$ = App.$$, esc = App.esc, toast = App.toast, modal = App.modal, busy = App.busy, confirmBox = App.confirmBox;
  var D = function () { return A().D; };
  var call = function (a, p) { return A().call(a, p); };
  var onErr = function (e) { A().onErr(e); };
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var GSTAT = null;
  function md(d) { var m = /(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); if (!m) return d || ''; var x = new Date(+m[1], +m[2] - 1, +m[3]); return (+m[2]) + '/' + (+m[3]) + '(' + WD[x.getDay()] + ')'; }
  function won(n) { return Math.round(+n || 0).toLocaleString('ko-KR'); }
  function L(opt) { var d = D(); d.today = (opt && opt.date) || App.today(); return d; }
  var CATS = [['시간표', '시간표'], ['현장', '현장 출력 (출석부·채점표·곡목표·동의서)'], ['공문', '공문'], ['확인서', '확인서·증명서'], ['인력', '심사위원·진행요원 서류'], ['결과', '결과표'], ['지급', '지급명세']];
  var EDITABLE = {
    gonggyeol: ['문서번호', '수신', '참조', '기관호칭', '요청대상', '요청일정'],
    judge_request: ['문서번호', '수신', '기관명', '호칭', '심사대상', '심사일시', '심사비'],
    judge_cert: ['번호', '성명', '소속', '심사부문', '심사일자'],
    award_cert: ['번호', '성명', '생년월일', '당시소속', '참가부문', '입상순위', '경연일시', '시상일'],
    award_cert_en: ['번호', '영문성명', '영문소속', '영문부문', '영문순위', '영문경연일']
  };
  function switchRow(key, label) {
    var on = D().cfg[key] === 'Y';
    return '<label class="row" style="gap:10px;font-weight:700"><span class="switch"><input type="checkbox" data-sw="' + key + '" ' + (on ? 'checked' : '') + '><span></span></span>' + esc(label) + '</label>';
  }
  function bindSwitches(root) {
    $$('[data-sw]', root).forEach(function (x) {
      x.addEventListener('change', function () { var v = {}; v[x.dataset.sw] = x.checked ? 'Y' : 'N'; call('setConfig', { values: v }).then(function () { toast(x.checked ? '켰어요' : '껐어요', 'ok'); A().refresh(); }).catch(onErr); });
    });
  }

  /* ================= 문서·출력 ================= */
  function docs() {
    var d = D(), reqs = (d.requests || []).filter(function (r) { return r.status !== '취소'; });
    var pm = {}; d.participants.forEach(function (p) { pm[p.id] = p; });
    var h = '<div class="card"><h2>출력물 만들기</h2><p class="small muted" style="margin-top:0">' +
      (App.DEMO ? '데모에서는 <b>워드(.docx)·엑셀</b>로 받아 볼 수 있어요. 실제 운영에서는 같은 양식이 <b>구글 문서·구글 시트</b>로 만들어져 드라이브 ‘콩쿠르 운영 시스템/출력물’ 폴더에 쌓입니다.' : '누르면 <b>구글 문서·구글 시트</b>로 만들어져 드라이브 ‘콩쿠르 운영 시스템/출력물’ 폴더에 저장돼요. 모양은 ‘양식’ 폴더의 구글 문서를 직접 고치면 다음 출력부터 반영됩니다.') + '</p>' +
      CATS.map(function (c) {
        var ks = Object.keys(FM.FORMS).filter(function (k) { return FM.FORMS[k].cat === c[0]; });
        return '<h3 style="margin:16px 0 8px">' + esc(c[1]) + '</h3><div class="grid g3">' + ks.map(function (k) {
          var F = FM.FORMS[k];
          return '<button class="scard" data-k="' + k + '" style="display:block;text-align:left;white-space:normal;min-height:70px;padding:12px 14px"><b>' + esc(F.name) + '</b> <span class="badge">' + (F.type === 'doc' ? '문서' : '시트') + '</span><div class="small muted" style="font-weight:500">' + esc(F.desc || (F.series ? '번호 자동 · 발급대장 기록' : '')) + '</div></button>';
        }).join('') + '</div>';
      }).join('') + '</div>';
    // 공결공문 신청
    h += '<div class="card"><div class="row"><h2 style="margin:0">공결공문 신청</h2><span class="sp"></span>' + switchRow('gonggyeolOpen', '참가자 신청 받기') + '</div>' +
      '<p class="small muted">참가자가 본인 조회 화면에서 신청하면 여기에 쌓여요. 골라서 공문을 만들면 번호가 붙고, 참가자는 같은 화면에서 PDF로 받습니다.</p>' +
      (reqs.length ? '<div class="scroll"><table><thead><tr><th><input type="checkbox" id="rqall"></th><th>신청</th><th>참가자</th><th>대상</th><th>수신 / 참조</th><th>상태</th><th>문서번호</th></tr></thead><tbody>' +
        reqs.sort(function (a, b) { return KC.cmpKo(b.createdAt, a.createdAt); }).map(function (r) {
          var p = pm[r.pid] || {}, doc = (d.docs || []).filter(function (x) { return x.docId === r.docId; })[0];
          return '<tr><td><input type="checkbox" data-rq="' + esc(r.reqId) + '" ' + (r.status === '발급' ? '' : '') + '></td><td class="small">' + esc(String(r.createdAt).slice(5, 16)) + '</td><td><b>' + esc(p.name || '?') + '</b><div class="small muted">' + esc(KC.groupLabel(p.groupKey || '')) + '</div></td>' +
            '<td>' + (r.target === '반주자' ? '반주자 ' + esc(r.accompName) : '본인') + '</td><td>' + esc(r.recipient) + (r.attn ? '<div class="small muted">참조 ' + esc(r.attn) + '</div>' : '') + (r.note ? '<div class="small" style="color:var(--accent)">“' + esc(r.note) + '”</div>' : '') + '</td>' +
            '<td><span class="badge ' + (r.status === '발급' ? 'ok' : r.status === '반려' ? 'bad' : r.status === '신청' ? 'warn' : '') + '">' + esc(r.status) + '</span></td><td class="small">' + esc(doc ? doc.docNo : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="row" style="margin-top:10px"><button class="pri" id="rqmake">고른 신청으로 공문 만들기</button><button id="rqrej">반려</button><span class="sp"></span><button id="rqadd">직접 추가</button></div>'
        : '<div class="empty">아직 신청이 없어요.</div><div class="row end"><button id="rqadd">직접 추가</button></div>') + '</div>';
    // 발급대장
    var docsList = (d.docs || []).slice().sort(function (a, b) { return KC.cmpKo(b.createdAt, a.createdAt); });
    h += '<div class="card"><h2>발급대장</h2>' + (docsList.length ? '<div class="scroll"><table><thead><tr><th>발급</th><th>종류</th><th>번호</th><th>제목</th><th></th></tr></thead><tbody>' +
      docsList.map(function (x) {
        var F = FM.FORMS[x.kind] || {};
        return '<tr' + (x.status === '취소' ? ' style="color:#999;text-decoration:line-through"' : '') + '><td class="small">' + esc(String(x.createdAt).slice(0, 16)) + '</td><td class="small">' + esc(F.name || x.kind) + '</td><td><b>' + esc(x.docNo) + '</b></td><td>' + esc(x.title) + '</td><td style="white-space:nowrap">' +
          (x.url ? '<a class="btn sm" href="' + esc(x.url) + '" target="_blank" rel="noopener">열기</a>' : '<button class="sm" data-dre="' + esc(x.docId) + '">워드</button>') +
          (x.status !== '취소' ? ' <button class="sm ghost" data-dcx="' + esc(x.docId) + '">취소</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">취소하면 그 번호는 비워 두고(재사용하지 않음) 다음 번호로 이어 갑니다. 공결 신청과 이어진 공문을 취소하면 신청은 ‘확인’ 상태로 돌아가요.</p>' : '<div class="empty">아직 발급한 공문·확인서가 없어요.</div>') + '</div>';
    // 양식 관리
    h += '<div class="card" id="tplcard"><h2>양식 관리</h2><div id="tplbody"><div class="muted">불러오는 중…</div></div></div>';
    A().view().innerHTML = h;
    $$('[data-k]').forEach(function (b) { b.addEventListener('click', function () { openBuild(b.dataset.k, {}); }); });
    bindSwitches(A().view());
    var all = $('#rqall'); if (all) all.addEventListener('change', function () { $$('[data-rq]').forEach(function (x) { x.checked = all.checked; }); });
    var picked = function () { return $$('[data-rq]').filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.rq; }); };
    var mk = $('#rqmake'); if (mk) mk.addEventListener('click', function () { var ids = picked(); if (!ids.length) return toast('신청을 골라 주세요', 'bad'); openBuild('gonggyeol', { requests: ids }); });
    var rj = $('#rqrej'); if (rj) rj.addEventListener('click', function () {
      var ids = picked(); if (!ids.length) return toast('신청을 골라 주세요', 'bad');
      var m = modal('<h2>반려</h2><label class="f" for="rjr">참가자에게 보일 사유</label><input id="rjr" placeholder="예: 수신처를 학교장으로 다시 신청해 주세요"><div class="row end" style="margin-top:12px"><button data-close>닫기</button><button class="pri" id="rjgo">반려</button></div>');
      $('#rjgo', m.el).addEventListener('click', function () { call('decideRequest', { reqIds: ids, status: '반려', reply: $('#rjr', m.el).value }).then(function () { m.close(); toast('반려했어요'); A().refresh(); }).catch(onErr); });
    });
    $('#rqadd').addEventListener('click', addRequest);
    $$('[data-dcx]').forEach(function (b) { b.addEventListener('click', function () { confirmBox('이 문서를 취소할까요? 발급대장에는 취소로 남아요.', '발급 취소', true).then(function (ok) { if (ok) call('updateDoc', { docId: b.dataset.dcx, status: '취소' }).then(function () { toast('취소했어요'); A().refresh(); }).catch(onErr); }); }); });
    $$('[data-dre]').forEach(function (b) { b.addEventListener('click', function () { var x = (d.docs || []).filter(function (y) { return y.docId === b.dataset.dre; })[0]; reDocx(x); }); });
    tplCard();
  }
  function reDocx(x) {
    var F = FM.FORMS[x.kind] || {}, f = {}, c = D().cfg; try { f = JSON.parse(x.fields || '{}'); } catch (e) { }
    var seal = { w: +c.sealSizeMm || 21, h: +c.sealSizeMm || 21, overlay: c.sealOverlay !== 'N', dx: +c.sealDxMm || -14, dy: +c.sealDyMm || -6 };
    if (x.kind === 'contract') { seal.w = seal.h = Math.round(seal.w * 0.68); seal.dx = -10; seal.dy = -9; }
    App.docxDownload({ file: F.file, fields: {}, pages: [{ fields: f, rows: f.__rows || [] }], seal: seal, title: x.title }, x.title).catch(function (e) { toast(e.message, 'bad'); });
  }
  function addRequest() {
    var d = D();
    var m = modal('<h2>공결 신청 직접 추가</h2><p class="small muted">전화·메일로 받은 신청을 넣을 때 써요.</p><div class="grid g2" style="gap:10px"><div style="grid-column:1/-1"><label class="f" for="arq">참가자 (이름 또는 접수번호)</label><input id="arq" list="arql"><datalist id="arql">' +
      d.participants.filter(KC.isActive).map(function (p) { return '<option value="' + esc(p.id + ' ' + p.name) + '">' + esc(KC.groupLabel(p.groupKey)) + '</option>'; }).join('') + '</datalist></div>' +
      '<div><label class="f" for="art">대상</label><select id="art"><option>본인</option><option>반주자</option></select></div><div><label class="f" for="ara">반주자 이름</label><input id="ara"></div>' +
      '<div><label class="f" for="arr">수신</label><input id="arr" placeholder="○○초등학교장"></div><div><label class="f" for="arx">참조</label><input id="arx"></div></div>' +
      '<div class="row end" style="margin-top:12px"><button data-close>닫기</button><button class="pri" id="argo">추가</button></div>', { wide: true });
    $('#argo', m.el).addEventListener('click', function () {
      var pid = String($('#arq', m.el).value).split(' ')[0], p = d.participants.filter(function (x) { return x.id === pid; })[0];
      if (!p) return toast('참가자를 목록에서 골라 주세요', 'bad');
      call('saveRequest', { request: { pid: pid, target: $('#art', m.el).value, accompName: $('#ara', m.el).value, recipient: $('#arr', m.el).value, attn: $('#arx', m.el).value, status: '확인' } })
        .then(function () { m.close(); toast('추가했어요', 'ok'); A().refresh(); }).catch(onErr);
    });
  }

  /* ---------- 출력 대화상자 ---------- */
  function openBuild(kind, preset) {
    var F = FM.FORMS[kind], d = D(), st = Object.assign({ date: App.today(), round: /score_rank|results/.test(kind) ? 'R2' : 'R1', edits: {} }, preset);
    var rounds = ['R1', 'R2'].filter(function (r) { return d.sessions.some(function (s) { return s.round === r; }); });
    var divs = [], gks = [];
    d.groupKeys.forEach(function (k) { var dv = k.split('|')[0]; if (divs.indexOf(dv) < 0) divs.push(dv); gks.push(k); });
    var needRound = /^(tt_public|tt_ops|tt_wall|att_group|att_perf|pieces|score_ox|score_rank|results)$/.test(kind);
    var needGroup = /^(att_group|att_perf|pieces|score_ox|score_rank|results|photo_agree)$/.test(kind);
    var people = /^(judge_cert|judge_request|pay_judge)$/.test(kind) ? (d.judgePeople || []).map(function (P) { return { id: P.staffId || P.key, label: P.name + (P.affiliation ? ' · ' + P.affiliation : '') + ' — ' + P.days.length + '일' }; })
      : /^(judge_agree)$/.test(kind) ? d.staff.filter(function (x) { return x.kind === 'judge'; }).map(function (x) { return { id: x.staffId, label: x.name + (x.submittedAt ? ' (제출)' : ' (미제출)') }; })
      : /^(contract|pledge|pay_staff)$/.test(kind) ? d.staff.filter(function (x) { return x.kind === 'staff'; }).map(function (x) { return { id: x.staffId, label: x.name + (x.contractAt ? ' (서명)' : ' (서명 전)') }; })
      : /^(award_cert|award_cert_en|pay_prize)$/.test(kind) ? FM.winners(d).map(function (w) { return { id: w.pid, label: w.p.name + ' · ' + KC.groupLabel(w.groupKey) + ' ' + w.award }; })
      : kind === 'score_ox' ? d.judges.filter(function (j) { return j.round === 'R1'; }).sort(function (a, b) { return KC.groupKeyCmp(String(a.groups).split(/[|,\s]/)[0], String(b.groups).split(/[|,\s]/)[0]) || (+a.seat || 99) - (+b.seat || 99); }).map(function (j) { return { id: j.judgeId, label: j.name + ' · ' + String(j.groups || '전체').replace(/\|/g, ' ') }; }) : null;
    if (people && !people.length) people = null;
    var pkey = /^(judge_cert|judge_request|pay_judge)$/.test(kind) ? 'people' : /^(judge_agree|contract|pledge|pay_staff)$/.test(kind) ? 'staffIds' : kind === 'score_ox' ? 'judgeIds' : 'pids';
    var oxDays = kind === 'score_ox' ? (function () { var m = {}; d.sessions.forEach(function (x) { if (x.round === 'R1' && x.date) m[x.date] = 1; }); d.judges.forEach(function (j) { if (j.round === 'R1') String(j.dates || '').split(/[,\s]+/).filter(Boolean).forEach(function (x) { m[x] = 1; }); }); return Object.keys(m).sort(); })() : [];
    if (people && !st[pkey]) st[pkey] = people.map(function (x) { return x.id; });
    var h = '<h2>' + esc(F.name) + '</h2><div class="grid g3" style="gap:10px">' +
      (needRound ? '<div><label class="f">라운드</label><select data-o="round">' + (rounds.length ? rounds : ['R1']).map(function (r) { return '<option value="' + r + '" ' + (st.round === r ? 'selected' : '') + '>' + esc(A().rname(r)) + '</option>'; }).join('') + '</select></div>' : '') +
      (needGroup ? '<div><label class="f">부문</label><select data-o="groupKey"><option value="">전체</option>' + divs.map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + ' (전체)</option>'; }).join('') + gks.map(function (k) { return '<option value="' + esc(k) + '">' + esc(KC.groupLabel(k)) + '</option>'; }).join('') + '</select></div>' : '') +
      (kind === 'score_rank' ? '<div><label class="f">심사위원별</label><select data-o="perJudge"><option value="">조마다 1장 (이름 빈칸)</option><option value="1">심사위원마다 1장씩</option></select></div>' : '') +
      (kind === 'tt_wall' ? '<div><label class="f">부문별 장</label><select data-o="wsplit"><option value="">같이 (예선에 부문이 둘 이상인 날)</option><option value="N">하루 한 장만</option></select></div>' : '') +
      (kind === 'score_ox' ? '<div><label class="f">심사일</label><select data-o="day"><option value="">전체 날짜</option>' + oxDays.map(function (x) { return '<option value="' + esc(x) + '">' + esc(FM.mdw(x)) + '</option>'; }).join('') + '</select></div>' : '') +
      (F.type === 'doc' ? '<div><label class="f">' + (F.series ? '발급일·시행일' : '작성일') + '</label><input type="date" data-o="date" value="' + esc(st.date) + '"></div>' : '') +
      (F.series ? '<div><label class="f">시작 번호</label><input data-o="startNo" inputmode="numeric" placeholder="자동"></div>' : '') +
      (kind === 'photo_agree' ? '<div><label class="f">반주자용 빈 양식 장수</label><input data-o="blank" inputmode="numeric" value="0"></div><div><label class="f">본선 진출자 이름 채우기</label><select data-o="blankOnly"><option value="">채움</option><option value="1">빈 양식만</option></select></div>' : '') +
      '</div>' +
      (people ? '<details style="margin-top:10px"' + (people.length <= 12 ? ' open' : '') + '><summary class="small" style="cursor:pointer;font-weight:700">대상 고르기 (' + people.length + ')</summary><div class="mlist" style="padding:8px;max-height:28vh">' +
        people.map(function (x) { return '<label class="row" style="gap:8px;padding:4px 0"><input type="checkbox" data-pp="' + esc(x.id) + '" ' + (st[pkey].indexOf(x.id) >= 0 ? 'checked' : '') + ' style="width:18px;height:18px;min-height:0">' + esc(x.label) + '</label>'; }).join('') + '</div></details>' : '') +
      (kind === 'award_cert' ? '<details style="margin-top:10px"><summary class="small" style="cursor:pointer;font-weight:700">지난 대회 입상자 직접 넣기</summary><p class="small muted">한 줄에 한 명: 이름, 생년월일6, 당시소속, 부문, 구분, 순위, 경연일(2024-04-11), 회차(73), 시상일(2024-05-09)</p><textarea data-o="manualText" rows="3" placeholder="전하람, 120716, 영동초등학교, 피아노, 초등부, 2위, 2024-04-11, 73, 2024-05-09"></textarea></details>' : '') +
      (kind === 'award_cert_en' ? '<p class="small muted" style="margin:10px 0 0">영문 이름·학교는 아래 표에서 직접 넣어 주세요. 설정의 <b>영문 사장명</b>도 확인하세요.</p>' : '') +
      '<div id="bprev" style="margin-top:12px"></div>' +
      '<div class="row" style="margin-top:14px;flex-wrap:wrap">' +
      (F.type === 'doc' && !App.DEMO ? '<label class="small row" style="gap:6px"><input type="checkbox" id="bsplit" style="width:18px;height:18px;min-height:0" ' + (/^(gonggyeol|contract|pledge|judge_agree)$/.test(kind) ? 'checked' : '') + '>사람별 파일로 (본인이 PDF로 받음)</label><label class="small row" style="gap:6px"><input type="checkbox" id="bpdf" style="width:18px;height:18px;min-height:0" checked>PDF도</label>' : '') +
      (F.series || /^(contract|pledge|judge_agree)$/.test(kind) ? '<label class="small row" style="gap:6px"><input type="checkbox" id="breg" style="width:18px;height:18px;min-height:0" checked>발급대장에 기록</label>' : '') +
      '<span class="sp"></span><button data-close>닫기</button><button class="pri" id="bpv">미리보기·인쇄</button>' +
      (F.type === 'doc' ? '<button id="bdocx">워드(.docx)로 받기</button>' : '<button id="bxls">엑셀로 받기</button>') +
      (!App.DEMO ? '<button id="bgo">' + (F.type === 'doc' ? '구글 문서로 만들기' : '구글 시트로 만들기') + '</button>' : '') + '</div>' +
      (/^pay_/.test(kind) ? '<div class="note small" style="margin-top:10px">구글 시트·엑셀에는 주민번호·계좌가 <b>가려서</b> 나가요. 송금·원천징수 신고에 쓸 원문은 <b>인력·지급</b> 탭의 ‘' + (kind === 'pay_staff' ? '인사팀 제출용' : '지급용 원문') + '’으로 받으세요 (키 비밀번호 필요, 내 컴퓨터에만 저장).</div>' : '');
    var m = modal(h, { wide: true });
    var data = null;
    function opts() {
      var o = { date: st.date, round: needRound ? st.round : '', groupKey: st.groupKey || '', perJudge: !!st.perJudge, dates: st.day ? [st.day] : null, split: st.wsplit !== 'N', sessions: st.sessions || null, startNo: +st.startNo || 0, edits: st.edits, requests: st.requests, blank: +st.blank || 0, blankOnly: !!st.blankOnly, en: st.en || {} };
      if (people) o[pkey] = st[pkey] && st[pkey].length ? st[pkey] : ['__none__'];
      if (st.manualText) o.manual = String(st.manualText).split('\n').map(function (ln) { var c = ln.split(',').map(function (x) { return x.trim(); }); return c[0] ? { name: c[0], birth: c[1], school: c[2], div: c[3], cat: c[4], award: c[5], date: c[6], edition: c[7], awardDate: c[8] } : null; }).filter(Boolean);
      if (kind === 'award_cert' && o.manual && o.manual.length && st.pids && !st.pids.length) o.pids = ['__none__'];
      return o;
    }
    function preview() {
      try { data = FM.build(kind, L(st), opts()); } catch (e) { $('#bprev', m.el).innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; data = null; return; }
      var n = data.count, ed = EDITABLE[kind];
      var hh = '<div class="row"><b>' + (F.type === 'doc' ? n + '장' : n + '개 탭') + '</b><span class="small muted">' + esc(data.title) + '</span></div>' + (data.warn.length ? '<div class="note warn small" style="margin-top:6px">' + data.warn.map(esc).join('<br>') + '</div>' : '');
      if (!n) hh += '<div class="empty">만들 내용이 없어요. 조건을 바꿔 보세요.</div>';
      else if (ed && data.pages) {
        hh += '<div class="scroll" style="margin-top:8px;max-height:40vh"><table class="small"><thead><tr><th>#</th>' + ed.map(function (k) { return '<th>' + esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          data.pages.map(function (pg, i) { return '<tr><td>' + (i + 1) + '</td>' + ed.map(function (k) { var v = pg.fields[k] == null ? '' : String(pg.fields[k]); return '<td>' + (/\n/.test(v) || v.length > 40 ? '<textarea data-ed="' + i + '|' + k + '" rows="2" style="min-width:220px;font-size:13px">' + esc(v) + '</textarea>' : '<input data-ed="' + i + '|' + k + '" value="' + esc(v) + '" style="min-height:32px;padding:3px 6px;font-size:13px;min-width:' + (k.length > 3 ? 140 : 90) + 'px">') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div><p class="small muted">칸을 고치면 그대로 문서에 들어가요.</p>';
      } else if (data.lines) hh += '<style>' + TT.CSS + '</style><div style="margin-top:8px;max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:10px;background:#f6f3f4;padding:10px">' + TT.wallHTML(data.pages.map(function (pg) { return { bookmark: pg.fields.날짜, lines: pg.lines }; })) + '</div>';
      else if (data.pages) hh += '<p class="small muted" style="margin:6px 0 0">' + data.pages.slice(0, 12).map(function (pg) { return esc(pg.fields.성명 || pg.fields.날짜 || pg.fields.구분 || ''); }).filter(Boolean).join(', ') + (data.pages.length > 12 ? ' …' : '') + '</p>';
      else if (data.sheets) hh += '<p class="small muted" style="margin:6px 0 0">' + data.sheets.slice(0, 14).map(function (s) { return esc(s.name) + (s.rows ? ' (' + s.rows.length + ')' : ''); }).join(' · ') + (data.sheets.length > 14 ? ' …' : '') + '</p>';
      $('#bprev', m.el).innerHTML = hh;
      $$('[data-ed]', m.el).forEach(function (x) {
        x.addEventListener('change', function () {
          var p = x.dataset.ed.split('|'), i = +p[0], k = p[1];
          st.edits[i] = st.edits[i] || {}; st.edits[i][k] = x.value;
          if (kind === 'award_cert_en' && /^영문(성명|소속)$/.test(k)) { var pid = (data.register[i] || {}).refId; st.en = st.en || {}; st.en[pid] = st.en[pid] || {}; st.en[pid][k === '영문성명' ? 'nameEn' : 'schoolEn'] = x.value; }
        });
      });
    }
    $$('[data-o]', m.el).forEach(function (x) { if (x.dataset.o === 'groupKey' && st.groupKey) x.value = st.groupKey; x.addEventListener('change', function () { st[x.dataset.o] = x.value; st.edits = {}; preview(); }); });
    $$('[data-pp]', m.el).forEach(function (x) { x.addEventListener('change', function () { st[pkey] = $$('[data-pp]', m.el).filter(function (y) { return y.checked; }).map(function (y) { return y.dataset.pp; }); st.edits = {}; preview(); }); });
    preview();
    var reg = function () { var r = $('#breg', m.el); return r && r.checked; };
    var bd = $('#bdocx', m.el); if (bd) bd.addEventListener('click', function () {
      if (!data || !data.count) return toast('만들 내용이 없어요', 'bad');
      busy(bd, true);
      var after = reg() && data.register.length && App.DEMO ? call('registerDocs', { items: data.register.map(function (r) { return { kind: r.kind, series: r.series, docNo: r.docNo, title: r.title, target: r.target, refId: r.refId, reqId: r.reqId, fields: r.fields }; }) }) : Promise.resolve();
      after.then(function () { return App.docxDownload(data); }).then(function () { toast('워드 파일을 받았어요', 'ok'); if (reg() && App.DEMO) { m.close(); A().refresh(); } })
        .catch(function (e) { onErr(e); }).finally(function () { busy(bd, false); });
    });
    var bx = $('#bxls', m.el); if (bx) bx.addEventListener('click', function () { if (!data || !data.count) return toast('만들 내용이 없어요', 'bad'); try { App.sheetDownload(data); } catch (e) { toast(e.message, 'bad'); } });
    // 미리보기·인쇄: 번호가 붙는 문서는 '인쇄'를 누를 때 발급대장에 한 번만 기록
    $('#bpv', m.el).addEventListener('click', function () {
      if (!data || !data.count) return toast('만들 내용이 없어요', 'bad');
      var d0 = data, willReg = !!(reg() && d0.register && d0.register.length);
      openPreview(d0, F, willReg, function () {
        if (!willReg || d0.__reg) return Promise.resolve();
        return call('registerDocs', { items: d0.register.map(function (r) { return { kind: r.kind, series: r.series, docNo: r.docNo, title: r.title, target: r.target, refId: r.refId, reqId: r.reqId, fields: r.fields }; }) })
          .then(function () { d0.__reg = true; toast('발급대장에 ' + d0.register.length + '건 기록했어요', 'ok'); A().refresh(); });
      });
    });
    var bg = $('#bgo', m.el); if (bg) bg.addEventListener('click', function () {
      if (!data || !data.count) return toast('만들 내용이 없어요', 'bad');
      busy(bg, true);
      var sp = $('#bsplit', m.el), pd = $('#bpdf', m.el);
      call('gas.export', { data: App.slim(data), register: !!reg(), split: !!(sp && sp.checked), pdf: !!(pd && pd.checked) })
        .then(function (r) { m.close(); showFiles(r, data); if (reg()) A().refresh(); })
        .catch(function (e) { busy(bg, false); onErr(e); });
    });
  }
  // 출력물 미리보기 — 워드 양식은 채운 모양 그대로, 시트는 탭마다 표 한 쪽. 여기서 바로 인쇄
  function openPreview(data, F, willReg, beforePrint) {
    var isDoc = F.type === 'doc';
    var pm = modal('<div class="pvh"><h2>' + esc(F.name) + ' 미리보기</h2><span class="small muted">' + esc(data.title) + ' · ' + data.count + (isDoc ? '장' : '개 탭') + '</span><span class="sp"></span>' +
      (willReg ? '<span class="small muted">인쇄하면 발급대장에 기록돼요</span>' : '') +
      '<button class="pri" id="pvp" disabled>인쇄</button><button id="pvd">' + (isDoc ? '워드로 받기' : '엑셀로 받기') + '</button><button data-close>닫기</button></div>' +
      '<div class="pvb" id="pvb"><div class="loading" style="color:#fff">미리보기를 만드는 중…</div></div>', { wide: true });
    pm.el.classList.add('pv');
    var body = $('#pvb', pm.el), pr = $('#pvp', pm.el);
    if (isDoc) App.previewDocx(data, body).then(function () { pr.disabled = false; }).catch(function (e) { body.innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; });
    else { body.innerHTML = App.sheetPreviewHTML(data); pr.disabled = false; }
    pr.addEventListener('click', function () {
      busy(pr, true);
      beforePrint().then(function () { if (isDoc) App.printDocxPreview(body); else App.printHTML(App.sheetPreviewHTML(data)); })
        .catch(onErr).finally(function () { busy(pr, false); });
    });
    $('#pvd', pm.el).addEventListener('click', function () {
      if (isDoc) App.docxDownload(data).then(function () { toast('워드 파일을 받았어요', 'ok'); }).catch(onErr);
      else try { App.sheetDownload(data); } catch (e) { toast(e.message, 'bad'); }
    });
  }
  function showFiles(r, data) {
    var files = r.files || [];
    modal('<h2>만들었어요</h2><p class="small muted">드라이브 ‘콩쿠르 운영 시스템/출력물’ 폴더에 저장됐어요.</p><div class="mlist" style="padding:6px 10px">' + files.map(function (f) {
      return '<div class="row" style="border-bottom:1px solid var(--line);padding:8px 0"><span>' + esc(f.name) + (f.combined ? ' <span class="badge">묶음</span>' : '') + '</span><span class="sp"></span><a class="btn sm pri" href="' + esc(f.url) + '" target="_blank" rel="noopener">열기</a>' + (f.pdfUrl ? '<a class="btn sm" href="' + esc(f.pdfUrl) + '" target="_blank" rel="noopener">PDF</a>' : '') + '</div>';
    }).join('') + '</div>' + (r.registered ? '<p class="small">발급대장에 ' + r.registered.length + '건 기록했어요.</p>' : '') + '<div class="row end"><button data-close class="pri">닫기</button></div>', { wide: true });
  }

  /* ---------- 양식 관리 ---------- */
  function tplCard() {
    var box = $('#tplbody'); if (!box) return;
    var keys = Object.keys(FM.FORMS).filter(function (k) { return FM.FORMS[k].file && !FM.FORMS[k].lines; });
    if (App.DEMO) {
      box.innerHTML = '<p class="small">실제 운영에서는 [양식 설치]를 한 번 누르면 아래 기본 양식이 <b>구글 문서·구글 시트</b>로 바뀌어 드라이브 ‘콩쿠르 운영 시스템/양식’ 폴더에 들어가요. 그 문서를 열어 글꼴·문구·여백을 고치면 다음 출력부터 그대로 나옵니다. <b>{{성명}}</b>처럼 중괄호로 된 칸 이름만 지우지 마세요.</p>' +
        '<div class="grid g3">' + keys.map(function (k) { return '<div class="panel"><b>' + esc(FM.FORMS[k].name) + '</b><div class="row" style="margin-top:6px"><a class="btn sm" href="templates/' + esc(FM.FORMS[k].file) + '" download>기본 양식 받기</a>' + (/\.docx$/.test(FM.FORMS[k].file) ? '<button class="sm ghost" data-tf="' + k + '">칸 목록</button>' : '') + '</div></div>'; }).join('') + '</div>' +
        '<p class="small muted">칸 규칙: <b>{{이름}}</b> 한 번 채움 · <b>{{줄.이름}}</b> 그 줄을 사람·조 수만큼 반복 · <b>{{직인}} {{서명}}</b> 그림 자리(줄 끝에). 직인은 데모에서 ‘견본’ 그림이 찍혀요.</p>';
      bindTf(box);
      return;
    }
    call('gas.status', {}).then(function (s) {
      GSTAT = s;
      var t = s.templates || {}, missing = keys.filter(function (k) { return !t[k] || t[k].missing; });
      box.innerHTML = (s.driveApi ? '' : '<div class="note bad small">Apps Script에 <b>Drive API</b> 서비스가 꺼져 있어요. 편집기 왼쪽 ‘서비스 +’에서 Drive API를 추가한 뒤 다시 배포해 주세요.</div>') +
        '<div class="row" style="margin-bottom:10px"><a class="btn sm" href="' + esc(s.tplFolder) + '" target="_blank" rel="noopener">양식 폴더 열기</a><a class="btn sm" href="' + esc(s.outFolder) + '" target="_blank" rel="noopener">출력물 폴더 열기</a><span class="sp"></span>' +
        (missing.length ? '<button class="pri" id="tinst">양식 설치 (' + missing.length + '개)</button>' : '<span class="badge ok">양식 모두 설치됨</span>') + '<button class="ghost" id="treinst">기본 양식으로 다시 설치</button></div>' +
        '<div class="grid g3">' + keys.map(function (k) { var x = t[k]; return '<div class="panel"><b>' + esc(FM.FORMS[k].name) + '</b><div class="row" style="margin-top:6px">' + (x && !x.missing ? '<a class="btn sm" href="' + esc(x.url) + '" target="_blank" rel="noopener">구글에서 고치기</a>' : '<span class="badge warn">미설치</span>') + (/\.docx$/.test(FM.FORMS[k].file) ? '<button class="sm ghost" data-tf="' + k + '">칸 목록</button>' : '') + '</div></div>'; }).join('') + '</div>' +
        '<hr><div class="row"><b>직인 이미지</b> ' + (s.seal ? '<span class="badge ok">등록됨</span><button class="sm ghost" id="sealv">보기</button>' : '<span class="badge warn">없음 — 공문·확인서에 직인이 안 찍혀요</span>') + '<span class="sp"></span><label class="btn" style="cursor:pointer">직인 PNG 올리기<input type="file" id="sealf" accept="image/png" hidden></label></div>' +
        '<p class="small muted">배경이 투명한 PNG를 쓰세요. 직인 파일은 드라이브 ‘제출서류(비공개)/직인’에만 보관되고 홈페이지(깃허브)에는 올라가지 않아요. 위치·크기는 설정 → 문서·공문에서 조정합니다.</p>';
      bindTf(box);
      var go = function (replace, btn) {
        var list = replace ? keys : missing; busy(btn, true);
        Promise.all(list.map(function (k) { var f = FM.FORMS[k].file; return fetch('templates/' + f).then(function (r) { return r.arrayBuffer(); }).then(function (b) { var u = new Uint8Array(b), s2 = ''; for (var i = 0; i < u.length; i++) s2 += String.fromCharCode(u[i]); return { key: k, name: f, title: FM.FORMS[k].name, type: /\.docx$/.test(f) ? 'doc' : 'sheet', b64: btoa(s2) }; }); }))
          .then(function (files) { return call('gas.installTemplates', { files: files, replace: replace }); })
          .then(function (r) { toast('양식 ' + r.installed.filter(function (x) { return !x.skipped; }).length + '개를 설치했어요', 'ok'); tplCard(); })
          .catch(function (e) { busy(btn, false); onErr(e); });
      };
      var ti = $('#tinst'); if (ti) ti.addEventListener('click', function () { go(false, ti); });
      $('#treinst').addEventListener('click', function (e) { confirmBox('모든 양식을 기본 양식으로 다시 설치할까요?\n직접 고친 양식은 휴지통으로 가요(30일 안에 되살릴 수 있음).', '다시 설치', true).then(function (ok) { if (ok) go(true, e.target); }); });
      $('#sealf').addEventListener('change', function (e) {
        var f = e.target.files[0]; e.target.value = ''; if (!f) return;
        var rd = new FileReader(); rd.onload = function () { call('gas.setSeal', { b64: String(rd.result).split(',')[1], mime: f.type }).then(function () { toast('직인을 등록했어요', 'ok'); tplCard(); }).catch(onErr); }; rd.readAsDataURL(f);
      });
      var sv = $('#sealv'); if (sv) sv.addEventListener('click', function () { call('gas.sealPreview', {}).then(function (r) { modal('<h2>직인</h2><div style="text-align:center"><img alt="직인" style="width:120px" src="data:image/png;base64,' + r.b64 + '"></div><div class="row end"><button data-close>닫기</button></div>'); }).catch(onErr); });
    }).catch(function (e) { box.innerHTML = '<div class="note bad small">' + esc(e.message) + '</div>'; });
  }
  function bindTf(box) {
    $$('[data-tf]', box).forEach(function (b) { b.addEventListener('click', function () {
      var f = FM.FORMS[b.dataset.tf].file;
      fetch('templates/' + f).then(function (r) { return r.arrayBuffer(); }).then(DF.fieldsOf).then(function (list) {
        modal('<h2>' + esc(FM.FORMS[b.dataset.tf].name) + ' — 칸 목록</h2><p class="small muted">구글 문서에서 이 이름 그대로 {{ }} 안에 쓰면 값이 들어가요.</p><div class="chips">' + list.map(function (x) { return '<span class="badge">{{' + esc(x) + '}}</span>'; }).join(' ') + '</div><div class="row end" style="margin-top:12px"><button data-close>닫기</button></div>');
      }).catch(function (e) { toast(e.message, 'bad'); });
    }); });
  }

  /* ================= 인력·지급 ================= */
  function staffLink(x) { return location.href.replace(/admin\.html.*$/, '') + 'staff.html?t=' + encodeURIComponent(x.token); }
  function steps(x) {
    var judge = x.kind === 'judge', b = function (ok, t) { return '<span class="badge ' + (ok ? 'ok' : '') + '" style="font-size:12px">' + t + '</span>'; };
    var idb = !x.idFile ? b(false, '신분증') : (x.idCheck === 'ok' || x.idCheck === 'admin') ? b(true, '신분증 ✓주민번호') : '<span class="badge ' + (x.idCheck === 'norrn' ? 'bad' : 'warn') + '" style="font-size:12px">신분증 ' + (x.idCheck === 'norrn' ? '주민번호 안 보임' : '확인 필요') + '</span>';
    return '<div class="chips">' + b(!!x.address, '정보') + b(!!x.accountMask, '계좌') + (D().cfg.collectRrn !== 'N' ? b(!!x.rrnMask, '주민번호') : '') + (D().cfg.collectIdCopy !== 'N' ? idb : '') + b(!!x.bankFile, '통장') +
      b(!!x.agreeAt, judge ? '동의·서약' : '동의') + (judge ? '' : b(!!x.pledgeAt, '보안서약') + b(!!x.contractAt, '계약')) + b(!!x.sign, '서명') + '</div>';
  }
  function staffTab() {
    var d = D(), staff = d.staff.filter(function (x) { return !/삭제/.test(x.status); }).sort(function (a, b) { return KC.cmpKo(a.kind + a.name, b.kind + b.name); });
    var work = {}; d.work.forEach(function (w) { (work[w.staffId] = work[w.staffId] || []).push(w); });
    var linked = {}; d.judges.forEach(function (j) { if (j.staffId) linked[j.staffId] = 1; });
    var h = '<div class="card"><div class="row"><h2 style="margin:0">심사위원 · 진행요원</h2><span class="sp"></span><button id="sfjud">심사위원 명단에서 불러오기</button><button class="pri" id="sfadd">사람 추가</button></div>' +
      '<p class="small muted">사람마다 <b>개인 링크</b>를 보내면, 본인이 휴대폰 뒷 4자리로 들어와 소속·주소·계좌·주민번호를 넣고 신분증·통장 사진을 올린 뒤 동의·서약·계약에 서명해요. 사진 속 글자는 자동으로 읽어 칸을 채웁니다.</p>' +
      (staff.length ? '<div class="scroll"><table><thead><tr><th>구분</th><th>이름</th><th>소속·직함 / 근무</th><th>진행</th><th></th></tr></thead><tbody>' + staff.map(function (x) {
        var ws = (work[x.staffId] || []).sort(function (a, b) { return KC.cmpKo(a.date, b.date); });
        return '<tr><td><span class="badge ' + (x.kind === 'judge' ? 'acc' : '') + '">' + (x.kind === 'judge' ? '심사위원' : '진행요원') + '</span></td><td><b>' + esc(x.name) + '</b><div class="small muted">' + esc(App.phone4(x.phone)) + '</div></td>' +
          '<td class="small">' + (x.kind === 'judge' ? esc([x.affiliation, x.title].filter(Boolean).join(' · ')) + (linked[x.staffId] ? '' : ' <span class="badge warn">심사 배정 없음</span>') : (ws.length ? ws.map(function (w) { return md(w.date); }).join(' ') + ' <span class="muted">(' + ws.length + '일)</span>' : '<span class="badge warn">근무일 없음</span>')) + '</td>' +
          '<td>' + (x.submittedAt ? '<span class="badge ok">제출</span> ' : '') + steps(x) + '</td><td style="white-space:nowrap"><button class="sm" data-lk="' + esc(x.staffId) + '">링크</button>' + (x.kind === 'staff' ? '<button class="sm" data-wk="' + esc(x.staffId) + '">근무일</button>' : '') + '<button class="sm ghost" data-ed="' + esc(x.staffId) + '">수정</button><button class="sm ghost" data-fl="' + esc(x.staffId) + '">서류</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">아직 없어요. [심사위원 명단에서 불러오기]를 누르면 심사위원 탭의 명단으로 만들어져요.</div>') + '</div>';
    // 상금
    var groups = {}; d.groups.forEach(function (g) { groups[g.groupKey] = g; });
    var pz = {}; d.prizes.forEach(function (x) { pz[x.pid] = x; });
    var wins = FM.winners(d), r2keys = Object.keys(d.results.R2 || {});
    h += '<div class="card"><div class="row"><h2 style="margin:0">입상자 상금</h2><span class="sp"></span>' + switchRow('prizeOpen', '입상자 계좌 입력 받기') + '</div>' +
      '<p class="small muted">켜 두면 입상자가 본인 조회 화면에서 수령인·은행·계좌·주민번호를 넣고 통장 사본을 올려요(통장 글자 자동 인식). 결과 공개(본선) 뒤에만 보입니다. 마감일·시상식 안내는 설정에서.</p>' +
      (r2keys.length ? '<details><summary class="small" style="cursor:pointer;font-weight:700">부문별 상금표</summary><div class="grid g2" style="gap:8px;margin-top:8px">' + r2keys.map(function (k) { return '<div><label class="f">' + esc(KC.groupLabel(k)) + '</label><input data-pzt="' + esc(k) + '" value="' + esc((groups[k] || {}).prizes || '') + '" placeholder="' + esc(d.cfg.prizeDefault || '1위=1000000,2위=500000,3위=300000') + '"></div>'; }).join('') + '</div><div class="row end" style="margin-top:8px"><button id="pztsave">상금표 저장</button></div></details>' : '') +
      (wins.length ? '<div class="scroll" style="margin-top:8px"><table><thead><tr><th>부문</th><th>순위</th><th>이름</th><th class="n">상금</th><th>수령 정보</th><th>시상식</th></tr></thead><tbody>' + wins.map(function (w) {
        var x = pz[w.pid] || {}, amt = x.amount !== undefined && x.amount !== '' ? +x.amount : KC.prizeAmount(d.cfg, groups[w.groupKey], w.award);
        return '<tr><td class="small">' + esc(KC.groupLabel(w.groupKey)) + '</td><td>' + esc(w.award) + '</td><td><b>' + esc(w.p.name) + '</b></td><td class="n"><input data-pza="' + esc(w.pid) + '" value="' + (amt || '') + '" inputmode="numeric" style="width:110px;min-height:32px;padding:3px 6px;text-align:right"></td>' +
          '<td class="small">' + (x.submittedAt ? '<span class="badge ok">제출</span> ' + esc((x.holderType === '보호자' ? '보호자 ' : '') + x.holder + ' · ' + x.bank + ' ' + x.accountMask) : '<span class="badge">미제출</span>') +
          '<div class="chips" style="margin-top:4px">' + (x.bankFile ? '<button class="sm ghost" data-pfr="' + esc(x.bankFile) + '">통장</button>' : (x.submittedAt ? '<span class="badge warn">통장 없음</span>' : '')) +
          (x.familyFile ? '<button class="sm ghost" data-pfr="' + esc(x.familyFile) + '">주민번호 서류</button>' + (x.idCheck === 'ok' || x.idCheck === 'admin' ? '<span class="badge ok">✓주민번호</span>' : '<button class="sm" data-pid-ok="' + esc(w.pid) + '">' + (x.idCheck === 'norrn' ? '주민번호 안 보임 — 확인' : '주민번호 확인') + '</button>') : (x.submittedAt ? '<span class="badge warn">주민번호 서류 없음</span>' : '')) + '</div></td><td class="small">' + esc(x.attend || '') + (x.attendCount ? ' ' + esc(x.attendCount) + '명' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div><div class="row end" style="margin-top:8px"><button id="pzsave">상금 저장</button></div>' : '<div class="empty">본선 입상이 정해지면 여기에 나와요.</div>') + '</div>';
    // 지급명세
    h += '<div class="card"><h2>지급명세</h2><div class="grid g3">' + [['pay_judge', '심사비', '심사일 × 1일 심사비, 기타소득 8.8%', '지급용 원문'], ['pay_prize', '상금', '순위 경쟁 상금, 기타소득 4.4%', '지급용 원문'], ['pay_staff', '진행요원 인건비', '근로시간 + 주휴, 시급 ' + won(d.cfg.hourlyWage) + '원', '인사팀 제출용']].map(function (x) {
      return '<div class="panel"><b>' + x[1] + '</b><div class="small muted">' + x[2] + '</div><div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="sm" data-pay="' + x[0] + '">명세 만들기</button><button class="sm pri" data-hr="' + x[0] + '">' + x[3] + '</button></div></div>';
    }).join('') + '</div><p class="small muted">‘명세 만들기’는 주민번호·계좌를 가린 채 구글 시트(또는 엑셀)로 만들어요. 원문(주민번호·계좌 그대로)은 키 비밀번호로 풀어 <b>이 컴퓨터에만</b> 엑셀로 저장합니다 — 심사비·상금은 사무국이 송금·원천징수 신고할 때 쓰는 <b>지급용</b>, 진행요원 인건비만 <b>인사팀 제출용</b>이에요. 다른 사람에게 보낼 때는 파일에 암호를 걸어 주세요.</p></div>';
    // 개인정보 보호
    var hasKey = !!d.cfg.pubKey;
    h += '<div class="card"><h2>개인정보 보호</h2><div class="row"><b>암호화 키</b> ' + (hasKey ? '<span class="badge ok">설정됨</span>' : '<span class="badge bad">없음 — 주민번호·계좌를 받을 수 없어요</span>') + '<span class="sp"></span><button ' + (hasKey ? 'class="ghost"' : 'class="pri"') + ' id="kgen">' + (hasKey ? '키 새로 만들기' : '암호화 키 만들기') + '</button><button class="ghost" id="ktest">키 비밀번호 확인</button></div>' +
      '<p class="small muted">주민번호·계좌번호는 입력한 사람의 화면에서 이 키로 잠가서 저장해요. 구글시트에는 알아볼 수 없는 글자만 남고, 키 비밀번호를 아는 담당자만 정산할 때 풀 수 있습니다. <b>키 비밀번호를 잊으면 이미 받은 번호는 다시 받아야 해요.</b> 비밀번호는 시트·메일에 적지 말고 담당자끼리만 나누세요.</p>' +
      '<hr><div class="row"><b>신분증·통장 사본</b> <span class="badge ok">필수</span></div><p class="small muted" style="margin-top:4px">돈을 내보내기 전 본인 확인용이에요. 심사위원·진행요원은 <b>신분증(주민번호 13자리가 보이는 주민등록증·운전면허증)</b>과 <b>통장 사본</b>, 입상자는 <b>통장 사본</b>과 <b>주민등록등본(또는 주민등록증·운전면허증)</b>을 올려야 제출이 끝나요. 여권·학생증 등은 쓸 수 없다고 화면에 안내되고, 사진에서 주민번호가 읽히면 ‘✓주민번호’, 안 읽히면 ‘확인 필요’로 표시돼요. 그때는 [서류]에서 사진을 보고 확인해 주세요.</p>' +
      '<hr><div class="row"><b>제출 서류 파일 정리</b><span class="sp"></span><button data-pg="staff">심사위원·진행요원 사본 지우기</button><button data-pg="prize">입상자 사본 지우기</button></div><p class="small muted">정산이 끝나면 신분증·통장·가족관계 사본 파일을 지워 주세요(드라이브에서 완전히 삭제). 암호화된 번호는 세법상 보관기간(5년) 동안 남깁니다.</p></div>';
    A().view().innerHTML = h;
    bindSwitches(A().view());
    $('#sfadd').addEventListener('click', function () { editStaff({ kind: 'staff' }); });
    $('#sfjud').addEventListener('click', importJudges);
    $$('[data-ed]').forEach(function (b) { b.addEventListener('click', function () { editStaff(d.staff.filter(function (x) { return x.staffId === b.dataset.ed; })[0]); }); });
    $$('[data-lk]').forEach(function (b) { b.addEventListener('click', function () { linkBox(d.staff.filter(function (x) { return x.staffId === b.dataset.lk; })[0]); }); });
    $$('[data-wk]').forEach(function (b) { b.addEventListener('click', function () { editWork(d.staff.filter(function (x) { return x.staffId === b.dataset.wk; })[0]); }); });
    $$('[data-fl]').forEach(function (b) { b.addEventListener('click', function () { filesBox(d.staff.filter(function (x) { return x.staffId === b.dataset.fl; })[0]); }); });
    var pts = $('#pztsave'); if (pts) pts.addEventListener('click', function () { call('saveGroups', { groups: $$('[data-pzt]').map(function (x) { return { groupKey: x.dataset.pzt, prizes: x.value }; }) }).then(function () { toast('상금표를 저장했어요', 'ok'); A().refresh(); }).catch(onErr); });
    $$('[data-pfr]').forEach(function (b) { b.addEventListener('click', function () { if (!/^drive:/.test(b.dataset.pfr)) return toast('데모에서는 파일을 열 수 없어요'); call('gas.fileLink', { ref: b.dataset.pfr }).then(function (r) { window.open(r.url, '_blank', 'noopener'); }).catch(onErr); }); });
    $$('[data-pid-ok]').forEach(function (b) { b.addEventListener('click', function () { confirmBox('서류에 입상자 주민등록번호 13자리가 다 보이는 걸 확인했나요?', '확인함').then(function (ok) { if (ok) call('savePrizes', { rows: [{ pid: b.dataset.pidOk, idCheck: 'admin' }] }).then(function () { toast('확인으로 표시했어요', 'ok'); A().refresh(); }).catch(onErr); }); }); });
    var pzs = $('#pzsave'); if (pzs) pzs.addEventListener('click', function () { call('savePrizes', { rows: $$('[data-pza]').map(function (x) { return { pid: x.dataset.pza, amount: x.value.replace(/\D/g, '') }; }) }).then(function () { toast('상금을 저장했어요', 'ok'); A().refresh(); }).catch(onErr); });
    $$('[data-pay]').forEach(function (b) { b.addEventListener('click', function () { openBuild(b.dataset.pay, {}); }); });
    $$('[data-hr]').forEach(function (b) { b.addEventListener('click', function () { hrExport(b.dataset.hr); }); });
    $('#kgen').addEventListener('click', function () { keyGen(hasKey); });
    $('#ktest').addEventListener('click', function () { PRIV = null; askPass('키 비밀번호 확인', true).then(function (pr) { if (pr) toast('맞아요. 키를 풀 수 있어요.', 'ok'); }); });
    $$('[data-pg]').forEach(function (b) { b.addEventListener('click', function () { purge(b.dataset.pg); }); });
  }
  function editStaff(x) {
    x = x || {};
    var m = modal('<h2>' + (x.staffId ? '정보 고치기' : '사람 추가') + '</h2><div class="grid g2" style="gap:10px">' +
      '<div><label class="f">구분</label><select id="sk"><option value="judge" ' + (x.kind === 'judge' ? 'selected' : '') + '>심사위원</option><option value="staff" ' + (x.kind !== 'judge' ? 'selected' : '') + '>진행요원</option></select></div>' +
      '<div><label class="f">이름</label><input id="sn" value="' + esc(x.name || '') + '"></div><div><label class="f">휴대폰 (링크 확인용)</label><input id="sp" value="' + esc(x.phone || '') + '" inputmode="tel"></div>' +
      '<div><label class="f">이메일</label><input id="se" value="' + esc(x.email || '') + '"></div><div><label class="f">소속 (심사위원)</label><input id="sa" value="' + esc(x.affiliation || '') + '"></div>' +
      '<div><label class="f">직함·호칭 (예: 교수, 단원)</label><input id="st" value="' + esc(x.title || '') + '"></div><div><label class="f">심사 요청 공문 수신 (예: 서울시립교향악단장)</label><input id="so" value="' + esc(x.orgHead || '') + '"></div>' +
      '<div><label class="f">시급 (진행요원, 비우면 기본 ' + won(D().cfg.hourlyWage) + '원)</label><input id="sw" value="' + esc(x.wage || '') + '" inputmode="numeric"></div><div style="grid-column:1/-1"><label class="f">메모</label><input id="sm" value="' + esc(x.note || '') + '"></div></div>' +
      '<div class="row" style="margin-top:12px">' + (x.staffId ? '<button class="danger" id="sdel">삭제</button>' : '') + '<span class="sp"></span><button data-close>닫기</button><button class="pri" id="ssave">저장</button></div>', { wide: true });
    $('#ssave', m.el).addEventListener('click', function () {
      var o = { staffId: x.staffId || '', kind: $('#sk', m.el).value, name: $('#sn', m.el).value, phone: $('#sp', m.el).value, email: $('#se', m.el).value, affiliation: $('#sa', m.el).value, title: $('#st', m.el).value, orgHead: $('#so', m.el).value, wage: $('#sw', m.el).value.replace(/\D/g, ''), note: $('#sm', m.el).value };
      if (!o.name) return toast('이름을 넣어 주세요', 'bad');
      call('saveStaff', { staff: [o] }).then(function () { m.close(); toast('저장했어요', 'ok'); A().refresh(); }).catch(onErr);
    });
    var del = $('#sdel', m.el); if (del) del.addEventListener('click', function () { confirmBox(x.name + '님을 지울까요? 근무일도 함께 지워져요. (올린 서류 파일은 먼저 정리해 주세요)', '삭제', true).then(function (ok) { if (ok) call('removeStaff', { staffIds: [x.staffId] }).then(function () { m.close(); A().refresh(); }).catch(onErr); }); });
  }
  function importJudges() {
    var d = D(), have = {};
    d.staff.forEach(function (x) { if (x.kind === 'judge') have[x.name + '|' + (x.affiliation || '')] = x.staffId; });
    var people = (d.judgePeople || []).filter(function (P) { return !P.staffId; });
    if (!people.length) return toast('새로 불러올 심사위원이 없어요 (모두 연결됨)');
    var rows = people.map(function (P) { return { kind: 'judge', name: P.name, affiliation: P.affiliation }; });
    call('saveStaff', { staff: rows }).then(function (ids) {
      var byName = {}; people.forEach(function (P, i) { P.judgeIds.forEach(function (jid) { byName[jid] = ids[i]; }); });
      var J = d.judges.map(function (j) { return byName[j.judgeId] ? Object.assign({}, j, { staffId: byName[j.judgeId] }) : j; });
      return call('saveJudges', { judges: J });
    }).then(function () { toast(people.length + '명을 불러왔어요. 휴대폰 번호를 넣은 뒤 링크를 보내 주세요.', 'ok'); A().refresh(); }).catch(onErr);
  }
  function linkBox(x) {
    var url = staffLink(x), cfg = D().cfg;
    var msg = '[' + (cfg.shortTitle || cfg.title) + '] ' + x.name + '님, ' + (x.kind === 'judge' ? '심사위원 위촉과 심사비 지급' : '진행요원 근로계약과 급여 지급') + '에 필요한 정보를 아래 링크에서 입력해 주세요. 휴대폰 뒷 4자리로 본인 확인을 합니다.\n' + url + '\n문의 ' + (cfg.phone || cfg.contact || '');
    var m = modal('<h2>' + esc(x.name) + '님 개인 링크</h2>' + (x.phone ? '' : '<div class="note warn small">휴대폰 번호가 없으면 링크만으로 열려요. 번호를 먼저 넣는 걸 권해요.</div>') +
      '<label class="f">보낼 문자</label><textarea id="lmsg" rows="5">' + esc(msg) + '</textarea><div class="row" style="margin-top:10px"><button class="ghost" id="lnew">링크 새로 만들기</button><span class="sp"></span><button data-close>닫기</button><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">열어 보기</a><button class="pri" id="lcp">문자 복사</button></div>');
    $('#lcp', m.el).addEventListener('click', function () { var t = $('#lmsg', m.el); t.select(); (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(function () { toast('복사했어요', 'ok'); }).catch(function () { document.execCommand('copy'); toast('복사했어요', 'ok'); }); });
    $('#lnew', m.el).addEventListener('click', function () { confirmBox('예전 링크는 더 이상 열리지 않아요. 새로 만들까요?', '새로 만들기').then(function (ok) { if (ok) call('resetStaffLink', { staffId: x.staffId }).then(function () { m.close(); A().refresh(); toast('새 링크를 만들었어요', 'ok'); }).catch(onErr); }); });
  }
  function editWork(x) {
    var rows = D().work.filter(function (w) { return w.staffId === x.staffId; }).sort(function (a, b) { return KC.cmpKo(a.date, b.date); }).map(function (w) { return Object.assign({}, w); });
    var m = modal('<h2>' + esc(x.name) + ' 근무일</h2><p class="small muted">예정 시각은 근로계약서(근로일별 근로시간)에, 실제 출퇴근 시각은 인건비 계산에 쓰여요. 휴게는 비우면 8시간 넘으면 ' + esc(D().cfg.defaultBreakMin) + '분, 4시간 넘으면 30분.</p><div id="wkt"></div>' +
      '<div class="row" style="margin-top:8px"><button id="wadd">하루 추가</button><input id="wbulk" placeholder="여러 날: 2027-03-23, 2027-03-24" style="flex:1;min-width:200px"><button id="wbadd">한꺼번에 추가</button></div>' +
      '<div class="row end" style="margin-top:12px"><button data-close>닫기</button><button class="pri" id="wsave">저장</button></div>', { wide: true });
    var draw = function () {
      $('#wkt', m.el).innerHTML = '<div class="scroll"><table class="small"><thead><tr><th>날짜</th><th>예정 시작</th><th>예정 끝</th><th>실제 출근</th><th>실제 퇴근</th><th>휴게(분)</th><th>담당</th><th></th></tr></thead><tbody>' + rows.map(function (w, i) {
        var inp = function (k, t, wd) { return '<td><input data-w="' + i + '|' + k + '" type="' + t + '" value="' + esc(w[k] || '') + '" style="min-height:32px;padding:3px 6px;width:' + wd + 'px"></td>'; };
        return '<tr>' + inp('date', 'date', 140) + inp('planStart', 'time', 100) + inp('planEnd', 'time', 100) + inp('start', 'time', 100) + inp('end', 'time', 100) + inp('breakMin', 'text', 60) + inp('role', 'text', 90) + '<td><button class="sm ghost" data-wx="' + i + '">빼기</button></td></tr>';
      }).join('') + '</tbody></table></div>';
      $$('[data-w]', m.el).forEach(function (e) { e.addEventListener('change', function () { var p = e.dataset.w.split('|'); rows[+p[0]][p[1]] = e.value; }); });
      $$('[data-wx]', m.el).forEach(function (b) { b.addEventListener('click', function () { rows.splice(+b.dataset.wx, 1); draw(); }); });
    };
    draw();
    var last = function () { return rows[rows.length - 1] || { planStart: D().cfg.workStart || '08:30', planEnd: D().cfg.workEnd || '17:00' }; };
    $('#wadd', m.el).addEventListener('click', function () { var l = last(); rows.push({ staffId: x.staffId, date: '', planStart: l.planStart, planEnd: l.planEnd, role: l.role || '' }); draw(); });
    $('#wbadd', m.el).addEventListener('click', function () { var l = last(); $('#wbulk', m.el).value.split(/[,\s]+/).map(KC.normDate).filter(function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v); }).forEach(function (dt) { rows.push({ staffId: x.staffId, date: dt, planStart: l.planStart, planEnd: l.planEnd, role: l.role || '' }); }); draw(); });
    $('#wsave', m.el).addEventListener('click', function () { call('saveWork', { staffIds: [x.staffId], rows: rows.map(function (w) { return Object.assign({}, w, { staffId: x.staffId }); }) }).then(function (n) { m.close(); toast(n + '일 저장했어요', 'ok'); A().refresh(); }).catch(onErr); });
  }
  function filesBox(x) {
    var item = function (label, ref) {
      if (!ref) return '<div class="row"><span>' + label + '</span><span class="sp"></span><span class="badge">없음</span></div>';
      var btn = /^drive:/.test(ref) ? '<button class="sm" data-fref="' + esc(ref) + '">열기</button>' : /^data:image/.test(ref) ? '<img alt="" src="' + esc(ref) + '" style="height:40px">' : '<span class="small muted">' + esc(ref.replace(/^demo:/, '(데모) ')) + '</span>';
      return '<div class="row" style="border-bottom:1px solid var(--line);padding:6px 0"><span>' + label + '</span><span class="sp"></span>' + btn + '</div>';
    };
    var chk = x.idCheck === 'ok' ? '<span class="badge ok">글자 인식으로 주민번호 확인됨</span>' : x.idCheck === 'admin' ? '<span class="badge ok">담당자가 확인함</span>' : x.idCheck === 'norrn' ? '<span class="badge bad">사진에서 주민번호를 못 찾음</span>' : x.idFile ? '<span class="badge warn">아직 확인 안 됨</span>' : '';
    var m = modal('<h2>' + esc(x.name) + ' 제출 서류</h2>' + item('신분증 사본', x.idFile) + (x.idFile ? '<div class="row" style="padding:6px 0">' + chk + '<span class="sp"></span>' + (x.idCheck === 'ok' || x.idCheck === 'admin' ? '' : '<button class="sm pri" id="idok">주민번호 13자리 보이는 신분증 맞음</button>') + '</div>' : '') +
      item('통장 사본', x.bankFile) + item('서명', x.sign) +
      '<p class="small" style="margin-top:10px">계좌 ' + esc(x.bank || '') + ' ' + esc(x.accountMask || '-') + ' · 예금주 ' + esc(x.holder || '-') + (x.holder && x.holder !== x.name ? ' <b style="color:var(--bad)">(본인 이름과 다름)</b>' : '') + ' · 주민번호 ' + esc(x.rrnMask || '-') + '</p>' +
      '<p class="small muted">주민등록증·운전면허증처럼 주민번호 13자리가 다 보이는 것만 인정해요. 여권·학생증·사원증이면 다시 올려 달라고 연락해 주세요.</p><div class="row end"><button data-close>닫기</button></div>');
    $$('[data-fref]', m.el).forEach(function (b) { b.addEventListener('click', function () { call('gas.fileLink', { ref: b.dataset.fref }).then(function (r) { window.open(r.url, '_blank', 'noopener'); }).catch(onErr); }); });
    var ok = $('#idok', m.el); if (ok) ok.addEventListener('click', function () { call('saveStaff', { staff: [{ staffId: x.staffId, idCheck: 'admin' }] }).then(function () { m.close(); toast('확인으로 표시했어요', 'ok'); A().refresh(); }).catch(onErr); });
  }

  /* ---------- 암호화 키 · 인사팀 제출용 ---------- */
  var PRIV = null;
  function askPass(title, fresh) {
    return new Promise(function (res) {
      if (!D().cfg.privKeyEnc) { toast('암호화 키가 아직 없어요', 'bad'); return res(null); }
      if (PRIV && !fresh) return res(PRIV);
      var m = modal('<h2>' + esc(title) + '</h2><label class="f" for="kp">키 비밀번호</label><input id="kp" type="password" autocomplete="off"><div class="row end" style="margin-top:12px"><button data-close>취소</button><button class="pri" id="kgo">확인</button></div>', { onClose: function () { res(PRIV); } });
      var go = function () { var b = $('#kgo', m.el); busy(b, true); KCrypto.unlock(D().cfg.privKeyEnc, $('#kp', m.el).value).then(function (k) { PRIV = k; m.close(); }).catch(function (e) { busy(b, false); toast(e.message, 'bad'); }); };
      $('#kgo', m.el).addEventListener('click', go);
      $('#kp', m.el).addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    });
  }
  function keyGen(has) {
    var m = modal('<h2>암호화 키 ' + (has ? '새로 만들기' : '만들기') + '</h2>' + (has ? '<div class="note bad small">새 키를 만들면 <b>지금까지 받은 주민번호·계좌는 풀 수 없게</b> 돼요. 키 비밀번호를 잊었을 때만 쓰고, 그 경우 다시 입력을 받아야 합니다.</div>' : '') +
      '<label class="f" for="k1">키 비밀번호 (8자 이상)</label><input id="k1" type="password" autocomplete="new-password"><label class="f" for="k2" style="margin-top:8px">한 번 더</label><input id="k2" type="password" autocomplete="new-password">' +
      '<p class="small muted">관리자 로그인 비밀번호와 다르게 정하고, 정산 담당자만 알게 해 주세요.</p><div class="row end"><button data-close>취소</button><button class="pri" id="kmk">만들기</button></div>');
    $('#kmk', m.el).addEventListener('click', function (e) {
      var a = $('#k1', m.el).value, b = $('#k2', m.el).value;
      if (a !== b) return toast('두 비밀번호가 달라요', 'bad');
      busy(e.target, true);
      KCrypto.genKeys(a).then(function (k) { return call('setConfig', { values: { pubKey: k.pub, privKeyEnc: k.privEnc } }); })
        .then(function () { PRIV = null; m.close(); toast('암호화 키를 만들었어요', 'ok'); A().refresh(); })
        .catch(function (err) { busy(e.target, false); toast(err.message, 'bad'); });
    });
  }
  function hrExport(kind) {
    var data;
    try { data = FM.build(kind, L({}), {}); } catch (e) { return toast(e.message, 'bad'); }
    var hrLabel = kind === 'pay_staff' ? '인사팀 제출용' : '지급용 원문';
    askPass(hrLabel + ' — 키 비밀번호').then(function (priv) {
      if (!priv) return;
      var sh = data.sheets[0], fk = data.fullKeys || {}, refs = data.refs || [];
      var jobs = [];
      sh.rows.forEach(function (row, i) {
        var ref = refs[i]; if (!ref) return;
        Object.keys(fk).forEach(function (col) { var encv = ref[fk[col]]; if (encv) jobs.push(KCrypto.decrypt(priv, encv).then(function (v) { row[+col] = v; })); });
      });
      Promise.all(jobs).then(function () {
        sh.head = sh.head.map(function (h) { return h.replace('(가림)', ''); });
        App.writeXlsx([{ name: sh.name, rows: [[sh.title + ' (' + hrLabel + ' — 주민번호·계좌 포함)'], [sh.note || ''], []].concat([sh.head]).concat(sh.rows) }], App.safeName(sh.title) + '_' + hrLabel.replace(/\s/g, '') + '.xlsx');
        toast('이 컴퓨터에 저장했어요. 보낸 뒤에는 파일을 지워 주세요.', 'ok');
      });
    });
  }
  function purge(who) {
    var d = D(), ids = who === 'prize' ? d.prizes.filter(function (x) { return x.bankFile || x.familyFile; }).map(function (x) { return x.pid; }) : d.staff.filter(function (x) { return x.idFile || x.bankFile; }).map(function (x) { return x.staffId; });
    if (!ids.length) return toast('지울 파일이 없어요');
    confirmBox(ids.length + '명의 사본 파일을 완전히 지울까요? 정산이 끝났을 때만 하세요. 되돌릴 수 없어요.', '지우기', true).then(function (ok) {
      if (!ok) return;
      (App.DEMO ? call('clearFiles', { who: who, ids: ids }).then(function (r) { return { removed: r.length }; }) : call('gas.purge', { who: who, ids: ids }))
        .then(function (r) { toast('파일 ' + r.removed + '개를 지웠어요', 'ok'); A().refresh(); }).catch(onErr);
    });
  }

  return { docs: docs, staff: staffTab, openBuild: openBuild };
})();
