/* =====================================================================
 * 콩쿠르 운영 시스템 — 핵심 로직 (core.js)
 * 구글 Apps Script(서버)와 브라우저 데모 모드가 같은 코드를 함께 씁니다.
 * 저장소(store)만 바꿔 끼우는 구조: 구글시트 ↔ 브라우저 localStorage
 *
 * 흐름: 접수 → 입금대조 → 조편성·시간표 → 본인조회·접수증 → 현장 출석·추첨
 *       → 심사위원 채점(예선 O/X, 본선 등위) → 자동집계 → 결과 공개
 * ===================================================================== */
var KC = (function () {
  'use strict';

  var SCHEMA = {
    Config: ['key', 'value'],
    Groups: ['groupKey', 'division', 'category', 'sort', 'r1Cutline', 'awardCount', 'note', 'perSec', 'groupSize', 'perSec2', 'groupSize2', 'awardNote', 'prizes'],
    Participants: ['id', 'name', 'birth', 'gender', 'phone', 'guardianName', 'guardianPhone', 'email', 'zip', 'address', 'region',
      'school', 'grade', 'division', 'category', 'groupKey', 'appliedAt', 'payStatus', 'payMemo',
      'teacher', 'pieces', 'piecesAt', 'token', 'status', 'note'],
    Sessions: ['sessionId', 'round', 'groupKey', 'no', 'label', 'date', 'drawTime', 'startTime', 'endTime',
      'venue', 'perSec', 'locked', 'current'],
    Entries: ['entryId', 'round', 'pid', 'sessionId', 'seq', 'drawNo', 'attend', 'checkinAt', 'pass', 'note', 'award'],
    Judges: ['judgeId', 'name', 'affiliation', 'pin', 'round', 'groups', 'seat', 'staffId', 'dates', 'phone', 'dayInfo', 'note'],
    Scores: ['scoreId', 'round', 'pid', 'sessionId', 'judgeId', 'value', 'comment', 'updatedAt'],
    Submissions: ['subId', 'sessionId', 'judgeId', 'submittedAt'],
    Logs: ['time', 'actor', 'action', 'detail'],
    // 수정 기록: 누가 언제 무엇을 어떻게 바꿨는지 (곡목은 바뀌기 전·후 그대로, 연락처·주소처럼 개인 정보는 '바뀜'만)
    History: ['hid', 'time', 'actor', 'pid', 'round', 'field', 'before', 'after', 'note'],
    // 시간표 설계: 날짜(경연일) 하루가 한 줄. blocks = 그날 들어갈 부문 목록(JSON)
    Plan: ['dayId', 'round', 'date', 'start', 'amEnd', 'pmStart', 'lunchMin', 'gap', 'breaks', 'venue', 'piano', 'note', 'blocks', 'endBy', 'restEvery', 'restMin'],
    // 심사위원·진행요원 — 본인이 링크로 들어와 정보 입력. 주민번호·계좌번호는 브라우저에서 암호화된 값(E1.…)만 저장
    Staff: ['staffId', 'kind', 'name', 'affiliation', 'title', 'orgHead', 'phone', 'email', 'birth', 'zip', 'address',
      'bank', 'holder', 'accountMask', 'accountEnc', 'rrnMask', 'rrnEnc', 'idFile', 'bankFile', 'sign', 'idCheck',
      'agreeAt', 'pledgeAt', 'contractAt', 'submittedAt', 'token', 'status', 'wage', 'nameEn', 'note', 'updatedAt'],
    // 진행요원 근무일 — plan(예정, 계약서 근로일별 근로시간) / start·end(실제, 인건비)
    Work: ['workId', 'staffId', 'date', 'planStart', 'planEnd', 'start', 'end', 'breakMin', 'role', 'note'],
    // 입상자 상금 수령 정보
    Prizes: ['pid', 'holderType', 'holder', 'relation', 'bank', 'accountMask', 'accountEnc', 'rrnMask', 'rrnEnc',
      'bankFile', 'familyFile', 'idCheck', 'attend', 'attendCount', 'mailAddress', 'agreeAt', 'submittedAt', 'amount', 'status', 'note'],
    // 참가자 신청 (공결공문 등)
    Requests: ['reqId', 'pid', 'kind', 'recipient', 'attn', 'target', 'accompName', 'note', 'status', 'reply', 'docId', 'createdAt', 'decidedAt'],
    // 발급대장 — 공문·확인서 번호와 만든 파일
    Docs: ['docId', 'kind', 'series', 'docNo', 'title', 'target', 'refId', 'fileId', 'pdfId', 'url', 'createdAt', 'status', 'fields'],
    // 지난 회차 — 회차마다 한 줄(인원 통계 JSON). 명단은 Archive에, purgeAt(접수 마지막 날 + 3년)이 지나면 지우고 통계만 남김
    Seasons: ['no', 'label', 'year', 'first', 'last', 'total', 'active', 'people', 'stats', 'purgeAt', 'purgedAt', 'source', 'createdAt'],
    // 이름 검색용 최소 명단 — 연락처·주소·보호자·곡목은 넣지 않음
    Archive: ['aid', 'no', 'name', 'birth', 'gender', 'division', 'category', 'groupKey', 'school', 'grade', 'region', 'status', 'prior', 'result', 'far']
  };
  var KEYS = {
    Config: 'key', Groups: 'groupKey', Participants: 'id', Sessions: 'sessionId', Entries: 'entryId',
    Judges: 'judgeId', Scores: 'scoreId', Submissions: 'subId', Plan: 'dayId',
    Staff: 'staffId', Work: 'workId', Prizes: 'pid', Requests: 'reqId', Docs: 'docId', Seasons: 'no', Archive: 'aid', History: 'hid'
  };

  var DEFAULT_CONFIG = {
    title: '제75회 이화경향음악콩쿠르',   // 해마다 회차만 바꿔 주세요 (2026년 = 75회, 2027년 = 76회)
    shortTitle: '이화경향음악콩쿠르',
    brandLogo: '',           // 화면 왼쪽 위 로고: 비우면 자동(이화경향 → 이화경향 BI), none = 없음, 이미지 주소도 가능
    organizer: '경향신문사',
    contact: '경향신문 문화사업국 02-3701-1602',
    venue: '이화여자고등학교',
    themeColor: '#8a1c3c',
    fee: '200000',
    adminPassword: '',       // 책임 관리자 비밀번호 — 처음 로그인할 때 해시로 바뀌어 저장됨 (시트에서 안 보임)
    planAbsorb: '2',          // '계획대로 조편성'에서 계획과 대상이 이만큼(명) 다르면 마지막 조에 넣고/빼고 시각 다시 계산 (0이면 안 함)
    ownerName: '',           // 책임 관리자 이름 (기록용, 비우면 담당자 이름)
    admins: '',              // 다른 관리자들 [{id,name,h,on,last}] — 설정 › 관리자 계정에서 관리 (비밀번호는 해시)
    loginLock: '',           // 로그인 실패 기록 (여러 번 틀리면 잠깐 막음)
    deskPin: '',
    // 라운드 설정 — mode: ox(O/X 개수) | rank(등위, 낮을수록 상위) | score(점수, 높을수록 상위)
    r1Name: '예선', r1Mode: 'ox', r1Judges: '5', r1Max: '1', r1Drop: '0',
    r2Name: '본선', r2Mode: 'rank', r2Judges: '7', r2Max: '5', r2Drop: '1',
    perSec: '200',          // 1인 배당시간(초) 3분20초
    drawLeadMin: '30',      // 경연 시작 몇 분 전에 추첨하는지
    // 시간표 설계 기본값 (75회 방식)
    roundMin: '5',          // 조 경연시간을 몇 분 단위로 올림 (20명×3분20초=66분40초 → 70분)
    sessionGap: '10',       // 조와 조 사이 쉬는 시간(분)
    amEnd: '12:00',         // 오전 조가 이 시각 전에 끝나도록 조 인원을 줄임
    pmStart: '13:00',       // 오후 첫 조 시작 (점심 최소 lunchMin 분 보장)
    lunchMin: '60',
    minGap: '5',            // 조 사이가 이보다 짧으면 경고 (75회: 보통 10분, 본선 작은 조 5분)
    breakMin: '15',         // 조 사이가 이 이상 비면 시간표에 '쉬는 시간'으로 표시
    maxRunMin: '',          // 쉬지 않고(15분 이상 쉼 없이) 이어지는 최대 시간(분) — 넘으면 경고, 비우면 안 봄
    midScoreMin: '20',      // 점심 앞뒤로 부문이 바뀌면(중간채점) 점심을 이만큼 더 길게 권함
    // 부문·구분별 1인 시간 기본값 (75회 실제) — 부문별 기준에 값이 없을 때 씀. '부문 구분=분:초', 구분 없으면 부문 전체
    perSecTable: '피아노=3:20, 바이올린=3:20, 첼로 초등부=3:30, 첼로=3:00, 비올라=3:00, 플루트=3:00, 클라리넷=3:00, 성악=3:00',
    perSecTable2: '피아노 초등부=7:00, 피아노 중등부=8:00, 피아노 고등부=20:00, 바이올린 초등부=7:00, 바이올린 중등부=13:00, 바이올린 고등부=17:00, 첼로 초등부=7:00, 첼로 중등부=10:00, 첼로 고등부=20:00, 비올라 초등부=5:00, 비올라 중등부=7:00, 비올라 고등부=15:00, 플루트 초등부=5:00, 플루트 중등부=5:30, 플루트 고등부=7:30, 클라리넷 초등부=5:00, 클라리넷 중등부=8:00, 클라리넷 고등부=8:00, 성악 고등부=5:00, 성악 대학일반부=10:00',
    minGroupSize: '6',      // 오전 마감 전에 이보다 적게 들어가면 그냥 점심으로 넘김
    dayLatest: '18:00',     // 이보다 늦게 끝나면 경고
    calendarNote: '',       // 달력형 시간표 아래 메모 (예: 전국연합학력평가 일정)
    pubCountR1: 'N',        // 공개용 시간표에 인원 표시 — 예선은 안 적음
    pubCountR2: 'Y',        // 본선 배포용은 조별 인원 적음
    // ── 홈페이지 공지사항 양식 (기존 방식 병행) — {대회명} {부문} {구분} {본선일자} {문의시작} {인터뷰마감} 은 자동으로 채워짐
    noticeR1Body: '{대회명} 참가자 여러분께 감사드립니다.\n부문별 예선 조편성과 소집 시간, 경연 참관 및 참가자 유의사항을 아래와 같이 공지합니다.\n*경연장\n- 이화여고 백주년기념관(서울 중구 정동)\n   도로명 주소 : 서울시 중구 정동길 26 이화여자고등학교 백주년기념관\n- 예·본선 경연장에는 주차 공간이 없습니다. 주변 유료 주차장을 이용해 주시기 바랍니다.\n*경연 참관 안내\n- 예·본선은 공개로 진행됩니다. (참관은 해당 경연 시작 10분 전까지 오셔야 합니다.)\n*참가자 유의사항\n- 참가자들은 각 부문 조별 ‘연주 순서 추첨’ 시간까지 경연장에 도착해야 합니다. 도착이 늦어 연주 순서 추첨을 못하면 경연에 참가하지 못하거나 불이익을 받을 수 있습니다.\n- 복장은 교복을 제외한 자유복으로 제한합니다. 교복은 상의 또는 하의만 입어도 경연 참가가 허락되지 않습니다.\n{부문안내}\n*본선 진출자 명단은 해당 부문 경연이 모두 끝난 날 집계 후 저녁 시간에 이화경향음악콩쿠르 홈페이지를 통해 공지합니다.\n*경연 시작 시간은 진행 상황에 따라 변경될 수 있습니다.\n(성명은 가나다 순, 동명이인의 경우 출생 연월(예시 1209**)으로 표기했습니다.)',
    noticeDivisionLines: '성악=부득이하게 곡을 변경하셔야 하는 경우에는 현장에 오셔서 말씀해 주시길 바랍니다.', // 부문별 추가 안내 (부문=문구, 줄마다 하나)
    noticeFinalistBody: '{대회명} {부문} {구분} 본선 진출자를 아래와 같이 발표합니다.\n\n{명단}\n\n*본선 안내\n1. 일시 : {본선일자} (경연 시간은 추후 홈페이지에 공지합니다.)\n2. 장소 : 이화여고 백주년기념관 (예선과 같은 장소)\n3. 준비물\n- 재학생 : 재학증명서 1부, 학생증(또는 여권) 사본 1부\n- 졸업생·홈스쿨·휴학생 : 여권 또는 신분증 사본 1부\n*유의사항\n- 제출한 서류는 반환하지 않습니다.\n- 예선 채점은 점수제가 아닌 O⦁X 방식입니다.\n- 예선 심사평은 없으며, 예선 결과 문의는 {문의시작} 이후에 받습니다.\n*촬영 및 영상 활용 동의서(반주자 포함)를 출력해 작성한 뒤 본선 당일 지참해 주시기 바랍니다.',
    noticeFinalGuideBody: '{대회명} {부문} 부문 본선 진출을 축하드립니다.\n*경연일 : {본선일자}\n*소집시간 : 아래 부문별 조편성과 시간표를 확인해 주시기 바랍니다.\n*경연장소 : 이화여고 백주년기념관 (예선 장소와 동일)\n*주의사항\n- 조별 경연 시작 30분 전까지 도착해 주시기 바랍니다.\n- 복장은 교복을 제외한 자유복입니다.\n*준비물\n- 재학생 : 재학증명서 1부, 학생증(또는 여권) 사본 1부\n- 졸업생·홈스쿨·휴학생 : 여권 또는 신분증 사본 1부\n- 제출한 서류는 반환하지 않습니다.\n*촬영 및 영상 활용 동의서(반주자 포함)를 출력해 당일 지참해 주시기 바랍니다.\n*연주 시간에 따라 경연 시작 시간이 바뀔 수 있습니다.\n\n{시간표}\n\n{명단}',
    noticeWinnersBody: '{대회명} {부문} 부문 입상자를 아래와 같이 발표합니다.\n\n{입상자}\n\n*각 부문 1위 입상자는 첨부한 인터뷰지를 작성해 {인터뷰마감}까지 info@khan.kr 메일로 보내 주시기 바랍니다.\n*입상자 시상식 일정은 추후 공지하겠습니다.',
    noticeInquiryFrom: '',   // 예선 결과 문의 받는 날 (예: 4월 28일(화))
    noticeInterviewDue: '',  // 1위 인터뷰지 제출 마감 (예: 4월 16일 오후 6시)
    perSec2: '420',         // 본선 1인 기본 시간(초) — 부문별로 따로 정함 (75회: 초 7분·중 8분·고 20분)
    groupSize2: '7',        // 본선 조당 기본 인원
    groupSize: '15',        // 조당 최대 인원 (75회는 20명까지 → 76회부터 15명을 넘지 않게)
    balanceGroups: 'Y',     // 조당 인원을 '최대'로 보고 고르게 나눔 (100명·15명 → 15,15,14,14,14,14,14)
    splitByGender: '성악',   // 남/여를 나눠 편성하는 부문(쉼표로 여러 개)
    // 지방 참가자 배치: 오전·오후로 조가 나뉠 때 이 지역 참가자는 오후 조에, 단 그날 마지막 조는 피해서
    farRegions: '강원,충북,충남,대전,세종,전북,전남,광주,경북,경남,대구,울산,부산,제주',
    farExceptions: '춘천',  // 지방 시·도 안이라도 주소에 이 지명이 있으면 지방으로 안 봄 (쉼표)
    afternoonFrom: '12:00',  // 이 시각 이후 시작하는 조를 '오후 조'로 봄
    showNamesToJudges: 'N', // 심사위원 화면에 이름 표시 여부
    showPiecesToJudges: 'Y', // 심사위원 화면에 곡목 표시 (성악처럼 참가자가 곡을 고르는 부문)
    // 참가자 본인 곡목 수정 — 규칙이 정해지면 여기서 켜고 끔
    pieceEditR1: 'N',        // 예선 곡목 수정 허용
    pieceEditR2: 'N',        // 본선 곡목 수정 허용 (예선 결과 공개 후, 본선 진출자만)
    pieceEditUntil: '',      // 수정 마감 일시 (예: 2027-04-05 18:00). 비우면 그 라운드 채점 시작 전까지
    pieceEditDivisions: '성악', // 수정 가능한 부문 (쉼표로 여러 개, 비우면 전체)
    pieceReorder: 'Y',       // 참가자가 곡 순서(①②③)를 바꿀 수 있는지
    showCutline: 'Y',       // 본인조회에서 예선 커트라인 안내 여부
    publishR1Schedule: 'N', publishR1Result: 'N', publishR2Schedule: 'N', publishR2Result: 'N',
    notice: '',
    // ── 문서·공문 (공결공문·위촉확인서·입상확인서·계약서 등)
    payMode: 'va',           // va: 가상계좌(신청자 파일의 결제 상태 그대로) / match: 통장 거래내역 입금대조
    prevStats: '',           // 전년 신청 현황 (인원 합계만, 개인정보 없음) — 현황 탭에서 전년 파일로 만듦
    applyEnd: '',            // 접수 마감일 — 현황 그래프에서 전년과 '마감 D-n' 기준으로 나란히 비교
    eventPeriod: '',         // 비우면 경연 일정에서 자동 (예: 2027년 3월 23일 ~ 4월 15일)
    hostLine: '경향신문사 · 이화여자고등학교',
    venueShort: '이화여고 백주년기념관 (서울 정동)',
    venueFull: '서울시 중구 정동길 26 이화여자고등학교 백주년기념관',
    ceoTitle: '경향신문사 사장', ceoName: '박종성', ceoNameEn: '',
    deptName: '경향신문 문화사업국', manager: '', phone: '02-3701-1602', fax: '', email: 'info@khan.kr',
    companyAddress: '04518 서울특별시 중구 정동길 3', homepage: 'www.khan.co.kr',
    docNoFormat: '경향 G{yyyy}-{MM}{NN}',  // 공문 번호 — {yyyy}{yy}{MM}{NN}
    certNoFormat: '제 {yy}-{MM}{NN} 호',   // 위촉확인서·입상확인서 번호
    sealOverlay: 'Y', sealSizeMm: '21', sealDxMm: '-14', sealDyMm: '-6', // 직인을 이름 끝에 겹쳐 찍기
    awardDate: '',           // 시상일 (입상확인서)
    gonggyeolOpen: 'N',      // 참가자 공결공문 신청 받기
    gonggyeolNote: '신청하면 사무국 확인 후 이 화면에서 공문 PDF를 받을 수 있습니다. 수신처(학교·부대·기관)를 정확히 적어 주세요.',
    prizeDefault: '',        // 기본 상금 (예: 1위=1000000,2위=500000,3위=300000) — 부문별은 Groups.prizes
    prizeOpen: 'N', prizeDue: '', awardCeremony: '',  // 입상자 상금 수령 정보 입력 받기 / 마감 / 시상식 안내
    judgeFee: '300000',      // 1일 심사비 (단가표가 비었을 때)
    judgeRates: '예선 종일=300000, 예선 반나절=250000, 본선 종일=350000, 본선 반나절=300000, 주말 예선 종일=400000, 주말 예선 반나절=250000, 주말 본선 종일=400000, 주말 본선 반나절=350000',
    hourlyWage: '10700',     // 진행요원 시급 — 2027년 최저임금 10,700원 이상
    payDay: '근무한 달의 말일 (휴일이면 그 전날)', workPlace: '이화여고 백주년기념관 및 경향신문사',
    workDept: '경향신문사 문화사업국', workDuty: '이화경향음악콩쿠르 진행요원', defaultBreakMin: '60',
    taxRate: '20', localTaxRate: '10', taxPrizeExpense: '80', taxJudgeExpense: '60', taxMinIncome: '50000',
    pubKey: '', privKeyEnc: '', collectIdCopy: 'Y', collectRrn: 'Y', // 개인정보 암호화 키 / 신분증(주민번호 보이는 것)·통장 사본은 돈을 내보내기 전 본인 확인용으로 필수
    driveRoot: '', templates: '', sealFile: '', // 양식 설치 후 자동으로 채워짐
    receiptNote: '경연 당일 이 접수증과 신분증(학생증)을 지참하고, 추첨 시간까지 대기실에 도착해 주세요.'
  };
  // 머리글(왼쪽 위) — 회차 없는 이름 + 로고. 회차는 해마다 바뀌니 문서·증명서에만 씀
  function brandOf(cfg) {
    var name = s(cfg.shortTitle) || s(cfg.title).replace(/^\s*제?\s*\d+\s*회\s*/, '');
    var lg = s(cfg.brandLogo);
    var logo = lg === 'none' ? '' : lg || (/이화경향/.test(s(cfg.title) + s(cfg.shortTitle)) ? 'img/ewha-kh-symbol.svg' : '');
    return { name: name || s(cfg.title), logo: logo };
  }
  var PUBLIC_CONFIG_KEYS = ['title', 'shortTitle', 'brandLogo', 'organizer', 'contact', 'venue', 'themeColor', 'r1Name',
    'r2Name', 'r1Mode', 'r2Mode', 'notice', 'receiptNote', 'publishR1Schedule', 'publishR1Result',
    'publishR2Schedule', 'publishR2Result', 'pubKey', 'gonggyeolOpen', 'gonggyeolNote', 'prizeOpen', 'prizeDue', 'awardCeremony', 'collectRrn', 'collectIdCopy'];

  /* ---------------- 공통 유틸 ---------------- */
  function fail(msg) { var e = new Error(msg); e.userFacing = true; throw e; }
  function s(v) { return v == null ? '' : String(v).trim(); }
  function digits(v) { return s(v).replace(/\D/g, ''); }
  function normBirth(v) {
    var d = digits(v);
    if (d.length === 8) d = d.slice(2);
    if (d.length === 5) d = '0' + d;
    return d;
  }
  function normPhone(v) { var d = digits(v); return d.length < 7 ? '' : d; }
  function genderShort(g) { g = s(g); if (/남/.test(g)) return '남'; if (/여/.test(g)) return '여'; return ''; }
  function isPaid(p) { return /입금\s*확인|입금완료|결제\s*완료|^Y$|^완료$/.test(s(p.payStatus)); }
  function isActive(p) { return !/취소|환불|삭제/.test(s(p.status) + ' ' + s(p.payStatus)); }
  function cmpKo(a, b) { return String(a).localeCompare(String(b), 'ko'); }
  function toMin(t) { var m = /^(\d{1,2}):(\d{2})/.exec(s(t)); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function fromMin(n) { n = ((n % 1440) + 1440) % 1440; var h = Math.floor(n / 60), m = n % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  function normDate(v) {
    var m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(s(v));
    if (!m) return s(v);
    return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  }
  function normTime(v) { var n = toMin(v); return n == null ? '' : fromMin(n); }
  function splitList(v) { return s(v).split(/[,，、/\s]+/).map(s).filter(Boolean); }
  function randToken() {
    var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', t = '';
    for (var i = 0; i < 10; i++) t += c.charAt(Math.floor(Math.random() * c.length));
    return t;
  }

  // '성악(여)' 처럼 부문에 성별이 붙어 오면 떼어 냄
  function splitDivision(division) {
    var m = /^(.*?)\s*\((남|여)\)\s*$/.exec(s(division));
    return m ? { division: m[1], gender: m[2] } : { division: s(division), gender: '' };
  }
  // '대학·일반부' → '대학일반부' (회차마다 표기가 달라도 같은 부문으로)
  function normCategory(c) { return s(c).replace(/[·ㆍ・\s]/g, ''); }

  /* ---------- 시도 판별 (주소 → 없으면 우편번호 앞 2자리) ---------- */
  var REGION_WORDS = [['서울', '서울'], ['경기', '경기'], ['인천', '인천'], ['강원', '강원'], ['충북', '충북'], ['충청북', '충북'], ['충남', '충남'], ['충청남', '충남'],
    ['대전', '대전'], ['세종', '세종'], ['전북', '전북'], ['전라북', '전북'], ['전남', '전남'], ['전라남', '전남'], ['광주', '광주'], ['경북', '경북'], ['경상북', '경북'],
    ['경남', '경남'], ['경상남', '경남'], ['대구', '대구'], ['울산', '울산'], ['부산', '부산'], ['제주', '제주']];
  var ZIP_REGION = [[1, 9, '서울'], [10, 20, '경기'], [21, 23, '인천'], [24, 26, '강원'], [27, 29, '충북'], [30, 30, '세종'], [31, 33, '충남'], [34, 35, '대전'], [36, 40, '경북'],
    [41, 43, '대구'], [44, 45, '울산'], [46, 49, '부산'], [50, 53, '경남'], [54, 56, '전북'], [57, 60, '전남'], [61, 62, '광주'], [63, 63, '제주']];
  function regionOf(address, zip) {
    var first = s(address).split(/\s+/)[0] || '';
    for (var i = 0; i < REGION_WORDS.length; i++) if (first.indexOf(REGION_WORDS[i][0]) === 0) return REGION_WORDS[i][1];
    // 경기 광주시는 '경기 광주시…'로 시작하므로 위에서 경기로 잡힘
    var z = digits(zip);
    if (z.length === 5) {
      var n = +z.slice(0, 2);
      for (var k = 0; k < ZIP_REGION.length; k++) if (n >= ZIP_REGION[k][0] && n <= ZIP_REGION[k][1]) return ZIP_REGION[k][2];
    }
    return '';
  }
  function isFar(cfg, p) {
    var r = s(p.region) || regionOf(p.address, p.zip);
    if (!r || splitList(cfg.farRegions).indexOf(r) < 0) return false;
    var addr = s(p.address);
    return !splitList(cfg.farExceptions).some(function (x) { return addr.indexOf(x) >= 0; }); // 예: 강원이라도 춘천은 지방 아님
  }

  /* ---------------- 시간표 설계 ----------------
   * 하루(day) = {date, start, amEnd, pmStart, lunchMin, gap, blocks:[{groupKey, count, perSec, size, pmOnly, sizes}]}
   * 75회 방식: 조 경연시간은 roundMin 분 단위 올림, 조 사이 gap 분, 오전 조는 amEnd 전에 끝나게 인원을 줄이고,
   * 점심은 마지막 오전 조가 끝난 뒤 최소 lunchMin 분, 오후는 pmStart 이후 시작 */
  function durMin(cfg, n, perSec) { var u = +cfg.roundMin || 5; return Math.ceil(n * perSec / 60 / u - 1e-9) * u; }
  function parseSec(v) {
    v = s(v); if (!v) return 0;
    var m = /^(\d+)\s*[:분']\s*(\d+)?/.exec(v); if (m) return (+m[1]) * 60 + (+(m[2] || 0));
    var n = +v; return n > 20 ? n : n * 60; // 200 → 200초, 3 → 3분
  }
  function fmtSec(sec) { sec = Math.round(+sec || 0); var m = Math.floor(sec / 60), r = sec % 60; return m + '분' + (r ? r + '초' : ''); }
  // 조 나누기 미리보기: 100명·최대 15명 → [15,15,14,14,14,14,14]
  function splitSizes(n, size) { n = +n || 0; size = +size || 15; if (n <= 0) return []; var k = Math.ceil(n / size), base = Math.floor(n / k), extra = n % k, out = []; for (var i = 0; i < k; i++) out.push(base + (i < extra ? 1 : 0)); return out; }
  function parseBlocks(v) { if (Array.isArray(v)) return v; try { var a = JSON.parse(s(v) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function planDay(cfg, day) {
    var gap = s(day.gap) !== '' ? +day.gap : (+cfg.sessionGap || 10);
    var lunchMin = +day.lunchMin || +cfg.lunchMin || 60, lead = +cfg.drawLeadMin || 30, minSize = +cfg.minGroupSize || 6;
    var t = toMin(day.start || '09:30'), amEnd = toMin(day.amEnd || cfg.amEnd || '12:00'), pmStart = toMin(day.pmStart || cfg.pmStart || '13:00');
    var items = [], warn = [], prevEnd = null, lunchDone = t >= amEnd, breaks = parseBreaks(day.breaks), lastGap = gap;
    // N조마다 M분 쉬기 (예: 2조마다 10분) — 점심 뒤에는 다시 셈
    var every = +day.restEvery || 0, restLen = +day.restMin || 10, sc = 0;
    function lunch() {
      if (lunchDone) return;
      sc = 0;
      if (items.length && items[items.length - 1].type === 'break') items.pop();   // 바로 점심이면 쉬는 시간은 점심에 합침
      var ls = prevEnd != null ? prevEnd : t, le = Math.max(ls + lunchMin, pmStart);
      if (prevEnd != null) items.push({ type: 'lunch', start: fromMin(ls), end: fromMin(le) });
      t = Math.max(t, le); lunchDone = true;
    }
    // 긴 쉬는 시간: '15:00 20' → 15:00 이후 처음 끝나는 조 다음에 20분 (보통 쉬는 시간 대신)
    function rest() {
      var b = breaks.filter(function (x) { return !x.used && prevEnd >= x.at && (lunchDone || x.at < amEnd); })[0];
      if (!b) return false;
      b.used = true; items.push({ type: 'break', start: fromMin(prevEnd), end: fromMin(prevEnd + b.len) }); t = prevEnd + b.len; return true;
    }
    parseBlocks(day.blocks).forEach(function (b) {
      var per = parseSec(b.perSec) || +cfg.perSec || 200, size = +b.size || +cfg.groupSize || 15, rem = +b.count || 0, balance = s(cfg.balanceGroups) !== 'N';
      var bg = s(b.gap) !== '' ? +b.gap : gap;   // 부문마다 쉬는 시간 (본선 작은 조 5분 등)
      var sizes = s(b.sizes).split(/[^\d]+/).filter(Boolean).map(Number), si = 0, guard = 0;
      if (b.pmOnly && !lunchDone) lunch();
      while (rem > 0 && guard++ < 200) {
        var want = Math.min(sizes.length ? (sizes[si] || size) : balance ? Math.ceil(rem / Math.ceil(rem / size)) : size, rem);
        if (!lunchDone) {
          var avail = amEnd - t, k = want;
          while (k > 0 && durMin(cfg, k, per) > avail) k--;
          if (sizes.length ? k < want : k < Math.min(want, minSize)) { lunch(); continue; }
          want = k;
        }
        var d = durMin(cfg, want, per);
        items.push({ type: 'session', groupKey: s(b.groupKey), n: want, start: fromMin(t), end: fromMin(t + d), dur: d, perSec: per, draw: fromMin(t - lead) });
        prevEnd = t + d; rem -= want; si++; sc++;
        if (rest()) continue;
        if (every && sc % every === 0) { items.push({ type: 'break', start: fromMin(prevEnd), end: fromMin(prevEnd + restLen) }); t = prevEnd + restLen; }
        else t = prevEnd + bg;
      }
    });
    while (items.length && items[items.length - 1].type !== 'session') items.pop();   // 마지막 조 뒤 쉬는 시간·점심은 빼기
    // 점심 앞뒤로 부문이 바뀌면 '중간채점' (75회: 점심 80~110분)
    items.forEach(function (x, i) {
      if (x.type !== 'lunch') return;
      var a = items.slice(0, i).filter(function (y) { return y.type === 'session'; }).pop(), b = items.slice(i + 1).filter(function (y) { return y.type === 'session'; })[0];
      if (a && b && s(a.groupKey).split('|')[0] !== s(b.groupKey).split('|')[0]) {
        x.note = '중간채점';
        var need = lunchMin + (+cfg.midScoreMin || 0), len = toMin(x.end) - toMin(x.start);
        if (+cfg.midScoreMin && len < need) warn.push('점심 앞뒤로 부문이 바뀌어요(중간채점) — 점심 ' + len + '분, ' + need + '분 이상 권함 (오후 시작을 늦추세요)');
      }
    });
    breaks.forEach(function (b) { if (!b.used) warn.push(fromMin(b.at) + ' 쉬는 시간을 넣을 자리가 없어요'); });
    var end = prevEnd != null ? fromMin(prevEnd) : '';
    if (end && s(day.endBy) && toMin(end) > toMin(day.endBy)) warn.push('마칠 시각(' + normTime(day.endBy) + ')보다 ' + (toMin(end) - toMin(day.endBy)) + '분 늦게 끝나요');
    warn = warn.concat(checkTimes(cfg, items.filter(function (x) { return x.type === 'session'; }).map(function (x) { return { start: x.start, end: x.end, label: s(x.groupKey).split('|')[1] + ' ' + (x.no || '') }; }), { lunchMin: lunchMin, amEnd: amEnd, pmStart: pmStart, skipGap: true }));
    return { items: items, start: items.length ? items.filter(function (x) { return x.type === 'session'; })[0].start : '', end: end, warn: warn };
  }
  function parseBreaks(v) {
    return s(v).split(/[,;\n]+/).map(function (x) {
      var m = /(\d{1,2}):(\d{2})\s*(?:[-~]\s*(\d{1,2}):(\d{2})|\s+(\d+)\s*분?)?/.exec(s(x)); if (!m) return null;
      var at = +m[1] * 60 + +m[2], len = m[3] ? (+m[3] * 60 + +m[4]) - at : +(m[5] || 20);
      return len > 0 ? { at: at, len: len } : null;
    }).filter(Boolean);
  }
  /* 시간 점검 — 계획과 실제 조(손으로 고친 시각 포함) 모두에 씀
   *  list: 같은 날 [{start, end, label}] → 경고 문장 목록
   *  겹침 · 쉬는 시간 부족(minGap) · 점심 없음/짧음 · 너무 늦게 끝남 · (설정 시) 쉬지 않고 너무 오래 */
  function checkTimes(cfg, list, opt) {
    opt = opt || {};
    var w = [], L = list.filter(function (x) { return x.start && x.end; }).slice().sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
    if (!L.length) return w;
    var minGap = s(cfg.minGap) !== '' ? +cfg.minGap : 5; if (opt.minGap != null && opt.minGap < minGap) minGap = opt.minGap;   // 그날 계획에서 조 사이를 더 짧게 정했으면 그 값으로
    var lunchMin = opt.lunchMin || +cfg.lunchMin || 60, brk = +cfg.breakMin || 15, maxRun = +cfg.maxRunMin || 0;
    var amEnd = opt.amEnd != null ? opt.amEnd : toMin(cfg.amEnd || '12:00'), pmStart = opt.pmStart != null ? opt.pmStart : toMin(cfg.pmStart || '13:00');
    var bestLunch = 0, runStart = toMin(L[0].start);
    for (var i = 1; i < L.length; i++) {
      var a = L[i - 1], b = L[i], g = toMin(b.start) - toMin(a.end);
      if (g < 0) w.push((-g) + '분 겹쳐요: ' + a.label + '(' + a.start + '~' + a.end + ') · ' + b.label + '(' + b.start + '~' + b.end + ')');
      else if (!opt.skipGap && g < minGap) w.push('쉬는 시간이 ' + g + '분뿐이에요 (최소 ' + minGap + '분): ' + a.label + ' → ' + b.label);
      // 점심 후보: 오전 마감~오후 시작 무렵(앞뒤 30분)에 걸친 빈 시간
      if (toMin(a.end) <= pmStart + 30 && toMin(b.start) >= amEnd - 30) bestLunch = Math.max(bestLunch, g);
      if (g >= brk) runStart = toMin(b.start);
      else if (maxRun && toMin(b.end) - runStart > maxRun) { w.push(fromMin(runStart) + '~' + b.end + ' ' + (toMin(b.end) - runStart) + '분을 쉬지 않고 이어가요 (' + brk + '분 이상 쉬는 시간 권함): ' + b.label + '까지'); runStart = toMin(b.end); }
    }
    var first = toMin(L[0].start), last = Math.max.apply(null, L.map(function (x) { return toMin(x.end); }));
    if (first < amEnd && last > pmStart) {
      if (bestLunch < 30) w.push('점심시간이 없어요 (' + fromMin(amEnd) + '~' + fromMin(pmStart) + ' 사이에 ' + lunchMin + '분 이상 비워 주세요)');
      else if (bestLunch < lunchMin) w.push('점심시간이 ' + bestLunch + '분이에요 (최소 ' + lunchMin + '분)');
    }
    L.forEach(function (x) { if (toMin(x.start) < amEnd && toMin(x.end) > pmStart) w.push('점심시간(' + fromMin(amEnd) + '~' + fromMin(pmStart) + ')에 걸친 조: ' + x.label + ' ' + x.start + '~' + x.end); });
    if (last > toMin(cfg.dayLatest || '18:00')) w.push('끝나는 시각이 ' + fromMin(last) + '로 늦어요');
    return w;
  }
  // 실제 조 전체 점검: 날짜·라운드별 경고 { 'R1|2027-03-24': [..] }
  function checkSessions(cfg, sessions, plan) {
    var by = {}, out = {};
    (sessions || []).forEach(function (x) { if (x.date) (by[x.round + '|' + x.date] = by[x.round + '|' + x.date] || []).push(x); });
    Object.keys(by).forEach(function (k) {
      var pr = k.split('|'), p = (plan || []).filter(function (d) { return d.round === pr[0] && d.date === pr[1]; })[0] || {};
      var w = checkTimes(cfg, by[k].map(function (x) { return { start: x.startTime, end: x.endTime, label: s(x.groupKey).split('|').join(' ') + ' ' + (x.label || x.no + '조') }; }),
        { lunchMin: +p.lunchMin || 0, amEnd: p.amEnd ? toMin(p.amEnd) : null, pmStart: p.pmStart ? toMin(p.pmStart) : null, minGap: s(p.gap) !== '' ? +p.gap : null });
      if (w.length) out[k] = w;
    });
    return out;
  }
  /* 그날 조 시각 다시 맞추기 — 인원이 늘었거나 두 부문이 같은 시각에 잡혀 겹칠 때
   *  부문끼리 모아(그날 처음 시작이 이른 부문부터 · opt.order가 있으면 그 순서 · 같은 시각이면 opt.late 부문을 뒤로) 조 번호 순으로 놓고,
   *  조 길이는 지금 인원 × 1인 시간으로 다시 셈. 조 사이는 그날 시간표 계획(N조마다 쉬기 · 조 사이 분), 없으면 설정의 조 사이 분.
   *  기본은 '뒤로만 밀기'(원래 시각보다 앞당기지 않음, 일부러 둔 빈 시간은 그대로) · opt.pack이면 첫 조부터 빈틈없이 다시 짬
   *  오전 마감을 15분 넘게 넘기는 조 · 원래 오후였던 조는 점심 뒤로
   *  list: [{sessionId, groupKey, no, label, startTime, count, perSec}] → { items: [{sessionId, groupKey, label, n, from, start, end, draw, moved}], end, warn, moved } */
  function retimeDay(cfg, list, day, opt) {
    opt = opt || {}; day = day || {};
    var gap = s(day.gap) !== '' ? +day.gap : (+cfg.sessionGap || 10), lunchMin = +day.lunchMin || +cfg.lunchMin || 60, lead = +cfg.drawLeadMin || 30;
    var amEnd = toMin(day.amEnd || cfg.amEnd || '12:00'), pmStart = toMin(day.pmStart || cfg.pmStart || '13:00');
    var every = +day.restEvery || 0, restLen = +day.restMin || 10, TOL = 15;
    var L = (list || []).filter(function (x) { return toMin(normTime(x.startTime)) != null; });
    if (!L.length) return { items: [], end: '', warn: [], moved: 0 };
    var first = {}, rank = {};
    L.forEach(function (x) { var m = toMin(normTime(x.startTime)); if (first[x.groupKey] == null || m < first[x.groupKey]) first[x.groupKey] = m; });
    (opt.order || []).forEach(function (g, i) { rank[g] = i + 1; });
    var rk = function (g) { return rank[g] || 999; };
    L = L.slice().sort(function (a, b) {
      return rk(a.groupKey) - rk(b.groupKey) || first[a.groupKey] - first[b.groupKey] || (a.groupKey === opt.late) - (b.groupKey === opt.late) || groupKeyCmp(a.groupKey, b.groupKey) || (+a.no || 0) - (+b.no || 0);
    });
    var t = Math.min.apply(null, L.map(function (x) { return toMin(normTime(x.startTime)); }));
    if (opt.start && toMin(normTime(opt.start)) != null) t = toMin(normTime(opt.start));
    var lunchDone = t >= amEnd, prevEnd = null, sc = 0, items = [], warn = [];
    L.forEach(function (x) {
      var o = toMin(normTime(x.startTime)), per = +x.perSec || +cfg.perSec || 200, n = +x.count || 0, d = durMin(cfg, n, per);
      var st = opt.pack ? t : Math.max(o, t);
      // 점심 뒤로: 원래 오후 조이거나, (밀려서) 오전 마감을 15분 넘게 넘기게 된 조 — 원래부터 그 시각이던 조는 그대로 둠
      var over = st + d > amEnd + TOL && (opt.pack || (st > o && o + d <= amEnd + TOL));
      if (!lunchDone && ((!opt.pack && o >= pmStart) || over)) {
        lunchDone = true; sc = 0;
        if (prevEnd != null) { var le = Math.max(prevEnd + lunchMin, pmStart); st = opt.pack ? le : Math.max(o, le); }
      }
      items.push({ sessionId: x.sessionId, groupKey: x.groupKey, label: s(x.label) || (x.no + '조'), n: n, from: fromMin(o), start: fromMin(st), end: fromMin(st + d), draw: fromMin(st - lead), moved: st !== o });
      prevEnd = st + d; sc++;
      t = prevEnd + (every && sc % every === 0 ? restLen : gap);
    });
    var end = fromMin(prevEnd), lim = s(day.endBy) || s(cfg.dayLatest) || '18:00';
    if (toMin(end) > toMin(normTime(lim))) warn.push('끝나는 시각이 ' + end + '로, ' + normTime(lim) + '보다 ' + (toMin(end) - toMin(normTime(lim))) + '분 늦어요');
    return { items: items, end: end, warn: warn, moved: items.filter(function (i) { return i.moved; }).length };
  }
  // 서버: 날짜마다 다시 맞춰 저장 (채점이 시작된 날은 건드리지 않음) → 옮긴 조 목록
  function retimeDates(db, round, dates, opt) {
    var cfg = db.cfg(), cnt = {}, moved = [], skipped = [], scored = {};
    db.t('Entries').forEach(function (e) { cnt[e.sessionId] = (cnt[e.sessionId] || 0) + 1; });
    db.t('Scores').forEach(function (x) { if (x.sessionId) scored[x.sessionId] = 1; });
    var seen = {};
    (dates || []).map(normDate).filter(function (d) { if (!d || seen[d]) return false; seen[d] = 1; return true; }).forEach(function (d) {
      var ses = db.t('Sessions').filter(function (x) { return x.round === round && x.date === d; });
      if (!(opt && opt.force) && ses.some(function (x) { return scored[x.sessionId]; })) { skipped.push(d); return; }
      var day = db.t('Plan').filter(function (x) { return x.round === round && x.date === d; })[0];
      var r = retimeDay(cfg, ses.map(function (x) { return { sessionId: x.sessionId, groupKey: x.groupKey, no: x.no, label: x.label, startTime: x.startTime, perSec: x.perSec, count: cnt[x.sessionId] || 0 }; }), day, opt);
      var upd = r.items.map(function (i) { return { sessionId: i.sessionId, startTime: i.start, endTime: i.end, drawTime: i.draw }; });
      if (upd.length) db.upsert('Sessions', upd);
      r.items.forEach(function (i) { if (i.moved) moved.push({ date: d, groupKey: i.groupKey, label: i.label, from: i.from, to: i.start }); });
    });
    return { moved: moved, skipped: skipped };
  }
  // 부문·구분별 1인 시간 기본값: '첼로 초등부=3:30, 첼로=3:00' 처럼 구분까지 맞는 것 먼저
  function perSecDefault(cfg, groupKey, round) {
    var g = s(groupKey).split('|'), div = g[0], cat = normCategory((g[1] || '').replace(/\((남|여)\)/, '')), best = null;
    s(round === 'R2' ? cfg.perSecTable2 : cfg.perSecTable).split(/[,;\n]+/).forEach(function (x) {
      var m = /^\s*(\S+)(?:\s+(\S+))?\s*=\s*([\d:]+)\s*$/.exec(x); if (!m || m[1] !== div) return;
      if (m[2] && normCategory(m[2]) !== cat) return;
      if (!best || (m[2] && !best.cat)) best = { cat: m[2] || '', sec: parseSec(m[3]) };
    });
    return best ? best.sec : 0;
  }
  /* 자동으로 채우기 — 첫날만 정하면 날마다 채워 넣음 (주말·쉬는 날 건너뜀)
   * 규칙: 악기(피아노·바이올린… 부문의 앞 이름)는 정해진 순서로 끊기지 않고 이어짐 · 하루에 악기는 2개까지
   *       악기가 바뀌는 날은 점심 때 바뀜(오전 A · 오후 B, 중간채점 몫으로 점심 넉넉히) — lunchSwitchOnly:false면 오후 중간도 허용
   *       한 부문(예: 피아노 초등부)은 되도록 하루 안에 끝냄 — 하루에 다 못 하는 큰 부문만 날을 넘김 (avoidSplit:false면 날을 줄이려고 넘길 수 있음)
   *       악기 안에서 부문 순서(초·중·고·대학)는 바꿀 수 있음 — 같으면 원래 순서
   * 조(조당 인원으로 고르게 나눈 것) 단위로 하루 묶음·점심 자리·부문 순서를 모두 따져 가장 나은 배치를 고름(동적 계획법)
   *  - 날 수가 가장 적게 → 피할 수 있는 날 넘김 없게 → 빈 시간 적게
   * o: { round, firstDate, start, amEnd, pmStart, lunchMin, endBy, gap, restEvery, restMin, size, venue, skipWeekend, skipDates:[yyyy-mm-dd],
   *      lunchSwitchOnly, avoidSplit, items: [{ groupKey, count, perSec }] } → { days, left: [{groupKey, count}], splits: [groupKey…] } */
  function autoPlan(cfg, o) {
    var size = +o.size || 10, skip = {}, maxDays = +o.maxDays || 40;
    var st = toMin(o.start || '09:50'), amEnd = toMin(o.amEnd || '12:30'), pmStart = toMin(o.pmStart || '13:30'), endBy = toMin(o.endBy || '17:30');
    var lunchMin = +o.lunchMin || 60, every = o.restEvery != null && s(o.restEvery) !== '' ? +o.restEvery : 2, restLen = o.restMin != null && s(o.restMin) !== '' ? +o.restMin : 10, gap = o.gap != null && s(o.gap) !== '' ? +o.gap : 0;
    var midLunch = lunchMin + (+cfg.midScoreMin || 0), lunchOnly = o.lunchSwitchOnly !== false, noSplit = o.avoidSplit !== false;
    var DAY = 10000, SPLIT_SOFT = 3000, BIG = 1e9;
    (o.skipDates || []).forEach(function (d) { skip[normDate(d)] = 1; });
    if (isNaN(new Date(normDate(o.firstDate) + 'T00:00:00').getTime())) throw new Error('첫날을 골라 주세요.');
    // 악기별로 부문 묶기 (악기 순서는 들어온 순서)
    var insts = [], byInst = {};
    (o.items || []).filter(function (x) { return +x.count > 0; }).forEach(function (x) {
      var k = s(x.groupKey), ins = k.split('|')[0], per = parseSec(x.perSec) || +x.perSec || 200;
      if (!byInst[ins]) { byInst[ins] = []; insts.push(ins); }
      byInst[ins].push({ groupKey: k, groups: splitSizes(+x.count, size).map(function (n) { return { groupKey: k, n: n, per: per, dur: durMin(cfg, n, per) }; }) });
    });
    // 반나절 [a,b) 끝 시각 (N조마다 쉬기, 그 사이는 gap) — 누적합으로 O(1)
    function halfEnd(t0, pre, a, b) { if (b <= a) return t0; var m = b - a - 1, r = every ? Math.floor(m / every) : 0; return t0 + pre[b] - pre[a] + r * restLen + (m - r) * gap; }
    // 하루에 들어가는 조 목록 → 가장 나은 점심 자리
    function dayCost(gs, last) {
      var L = gs.length, pre = [0]; for (var x = 0; x < L; x++) pre.push(pre[x] + gs[x].dur);
      var sw = -1, ni = 1; for (x = 1; x < L; x++) if (gs[x].groupKey.split('|')[0] !== gs[x - 1].groupKey.split('|')[0]) { ni++; if (sw < 0) sw = x; }
      if (ni > 2) return null;
      var best = null;
      for (var k = 0; k <= L; k++) {
        var mEnd = halfEnd(st, pre, 0, k); if (k > 0 && mEnd > amEnd) break;
        var pmT = k > 0 ? Math.max(mEnd + lunchMin, pmStart) : pmStart, aEnd = k < L ? halfEnd(pmT, pre, k, L) : mEnd;
        if (aEnd > endBy) continue;
        var c = DAY, why = '';
        if (sw >= 0) {
          if (sw === k) { if (pmT - mEnd < midLunch) { c += 120; why = 'lunchShort'; } else why = 'lunch'; }
          else { if (lunchOnly) continue; c += 400; why = 'mid'; }
        }
        c += k > 0 ? amEnd - mEnd : amEnd - st;
        if (!last) c += (k < L ? endBy - aEnd : endBy - pmStart) * 0.5;
        if (!best || c < best.c) best = { c: c, k: k, why: why };
      }
      return best;
    }
    // 한 부문이 하루(혼자)에 다 들어가나 — 안 들어가는 큰 부문만 날을 넘겨도 됨
    var fits = {};
    insts.forEach(function (ins) { byInst[ins].forEach(function (b) { fits[b.groupKey] = !!dayCost(b.groups, true); }); });
    // 악기마다 부문 순서(순열) — 원래 순서에서 멀수록 아주 조금 손해
    function perms(arr) {
      var out = [];
      (function go(rest, cur) { if (out.length >= 120) return; if (!rest.length) { out.push(cur); return; } for (var i = 0; i < rest.length; i++) go(rest.slice(0, i).concat(rest.slice(i + 1)), cur.concat([rest[i]])); })(arr.map(function (_, i) { return i; }), []);
      return out;
    }
    var P = insts.map(function (ins) {
      return perms(byInst[ins]).map(function (order) {
        var seq = [], inv = 0;
        order.forEach(function (bi, a) { for (var b2 = a + 1; b2 < order.length; b2++) if (order[b2] < bi) inv += 30; seq = seq.concat(byInst[ins][bi].groups); });
        return { seq: seq, inv: inv };
      });
    });
    var NI = insts.length, total = insts.reduce(function (a, ins) { return a + byInst[ins].reduce(function (b, x) { return b + x.groups.length; }, 0); }, 0);
    // 날 끝에서 부문이 갈리는지
    function splitCost(seq, e) {
      if (e <= 0 || e >= seq.length || seq[e - 1].groupKey !== seq[e].groupKey) return 0;
      return fits[seq[e].groupKey] ? (noSplit ? BIG : SPLIT_SOFT) : 20;
    }
    // 동적 계획법: 상태 (악기 i, 순서 p, 이 악기에서 몇 번째 조부터) — 악기 경계는 S[i] (아직 순서를 안 고른 시작)
    var memo = {}, startMemo = {};
    function fromStart(i, done) {       // 악기 i를 처음부터 (순서 자유) — done: 앞에서 놓은 조 수
      if (i >= NI) return { c: 0 };
      var key = i; if (key in startMemo) return startMemo[key];
      var best = { c: Infinity };
      for (var p = 0; p < P[i].length; p++) { var r = from(i, p, 0, done); if (r.c + P[i][p].inv < best.c) best = { c: r.c + P[i][p].inv, p: p, next: r }; }
      return (startMemo[key] = best);
    }
    function from(i, p, t, done) {
      var key = i + '|' + p + '|' + t; if (key in memo) return memo[key];
      var seq = P[i][p].seq, Ln = seq.length, best = { c: Infinity }, placedBefore = done + t, cap = endBy - st - lunchMin;
      memo[key] = best;   // (순환 없음)
      // (가) 이 악기 안에서 끝나는 날
      for (var e = t + 1, sum = 0; e <= Ln; e++) {
        sum += seq[e - 1].dur; if (sum > cap) break;                 // 하루에 다 못 들어감
        var gs = seq.slice(t, e), last = placedBefore + gs.length >= total, dc = dayCost(gs, last);
        if (!dc) continue;
        var sc = splitCost(seq, e); if (sc >= BIG) continue;
        var nx = e < Ln ? from(i, p, e, done) : fromStart(i + 1, done + Ln);
        var c = dc.c + sc + nx.c;
        if (c < best.c) best = { c: c, day: { gs: gs, k: dc.k, why: dc.why }, next: nx };
      }
      // (나) 이 악기를 끝내고 다음 악기 앞부분까지 (하루 2악기)
      var restA = seq.slice(t), sumA = restA.reduce(function (a, g) { return a + g.dur; }, 0);
      if (i + 1 < NI && sumA < cap) {
        for (var q = 0; q < P[i + 1].length; q++) {
          var seq2 = P[i + 1][q].seq;
          for (var e2 = 1, sum2 = sumA; e2 <= seq2.length; e2++) {
            sum2 += seq2[e2 - 1].dur; if (sum2 > cap) break;
            var gs2 = restA.concat(seq2.slice(0, e2)), last2 = placedBefore + gs2.length >= total, dc2 = dayCost(gs2, last2);
            if (!dc2) continue;
            var sc2 = splitCost(seq2, e2); if (sc2 >= BIG) continue;
            var nx2 = e2 < seq2.length ? from(i + 1, q, e2, done + Ln) : fromStart(i + 2, done + Ln + seq2.length);
            var c2 = dc2.c + sc2 + nx2.c + P[i + 1][q].inv;
            if (c2 < best.c) best = { c: c2, day: { gs: gs2, k: dc2.k, why: dc2.why }, next: nx2 };
          }
        }
      }
      memo[key] = best;
      return best;
    }
    var root = NI ? fromStart(0, 0) : { c: 0 };
    var segs = [];
    if (root.c < Infinity) { var node = root; while (node) { if (node.day) segs.push(node.day); node = node.next || null; } }
    // 날짜 붙이기 → 하루 계획 (같은 부문은 한 줄, 오후 첫 줄은 '오후부터')
    var dt = new Date(normDate(o.firstDate) + 'T00:00:00'), days = [];
    var ymd = function (z) { return z.getFullYear() + '-' + ('0' + (z.getMonth() + 1)).slice(-2) + '-' + ('0' + z.getDate()).slice(-2); };
    segs.slice(0, maxDays).forEach(function (sg) {
      while ((o.skipWeekend !== false && (dt.getDay() === 0 || dt.getDay() === 6)) || skip[ymd(dt)]) dt.setDate(dt.getDate() + 1);
      var blocks = [];
      sg.gs.forEach(function (g, x) {
        var pm = x === sg.k && x > 0, lb = blocks[blocks.length - 1];
        if (lb && lb.groupKey === g.groupKey && !pm) { lb.sizes += ',' + g.n; lb.count += g.n; }
        else blocks.push({ groupKey: g.groupKey, count: g.n, perSec: g.per, size: size, pmOnly: pm, sizes: String(g.n) });
      });
      days.push({ round: o.round || 'R1', date: ymd(dt), start: fromMin(st), amEnd: fromMin(amEnd), pmStart: fromMin(pmStart), lunchMin: s(lunchMin), endBy: fromMin(endBy),
        gap: s(gap), restEvery: s(every), restMin: s(restLen), venue: s(o.venue), piano: blocks.some(function (b) { return /^피아노/.test(b.groupKey); }) ? 'Y' : '',
        note: sg.why === 'lunch' || sg.why === 'lunchShort' ? '점심 때 악기 바뀜 (중간채점)' : sg.why === 'mid' ? '중간에 악기 바뀜 — 심사위원 교체 시간 확인' : '', breaks: '', blocks: blocks });
      dt.setDate(dt.getDate() + 1);
    });
    // 날을 넘긴 부문 · 못 넣은 인원
    var seenDay = {}, splits = [];
    days.forEach(function (d, di) { d.blocks.forEach(function (b) { if (seenDay[b.groupKey] != null && seenDay[b.groupKey] !== di && splits.indexOf(b.groupKey) < 0) splits.push(b.groupKey); seenDay[b.groupKey] = di; }); });
    var placed = {}; days.forEach(function (d) { d.blocks.forEach(function (b) { placed[b.groupKey] = (placed[b.groupKey] || 0) + b.count; }); });
    var left = [];
    (o.items || []).forEach(function (x) { var rem = (+x.count || 0) - (placed[s(x.groupKey)] || 0); if (rem > 0) left.push({ groupKey: s(x.groupKey), count: rem }); });
    return { days: days, left: left, splits: splits, forced: splits.filter(function (k) { return !fits[k]; }) };
  }
  // 여러 날을 이어서: 조 번호는 같은 부문 안에서 날짜를 넘어 이어짐 (예: 피아노 초등부 8조는 다음 날 오전)
  function planAll(cfg, days) {
    var out = days.slice().sort(function (a, b) { return cmpKo(a.date + (a.start || ''), b.date + (b.start || '')); }).map(function (d) {
      var r = planDay(cfg, d); r.day = d; return r;
    });
    var no = {}, tot = {};
    out.forEach(function (r) { r.items.forEach(function (x) { if (x.type === 'session') { no[x.groupKey] = (no[x.groupKey] || 0) + 1; x.no = no[x.groupKey]; tot[x.groupKey] = (tot[x.groupKey] || 0) + x.n; } }); });
    return { days: out, totals: tot };
  }
  function makeGroupKey(cfg, division, category, gender) {
    var sd = splitDivision(division);
    division = sd.division; category = normCategory(category);
    var split = splitList(cfg.splitByGender);
    var g = genderShort(gender) || sd.gender;
    if (split.indexOf(division) >= 0 && g && !/\((남|여)\)/.test(category)) category = category + '(' + g + ')';
    return division + '|' + category;
  }
  /* ---------- 곡목 (성악 등 참가자 자유곡) ----------
   * Participants.pieces 에 JSON 배열로 저장
   * [{round:'R1', kind:'가곡', country:'이태리', composer:'Tosti', title:'Ideale'}, …]  순서 = ①②③ */
  function parsePieces(v) {
    if (Array.isArray(v)) return v;
    var t = s(v);
    if (!t) return [];
    if (t.charAt(0) === '[') { try { var a = JSON.parse(t); return Array.isArray(a) ? a : []; } catch (e) { } }
    return [{ round: '', kind: '', country: '', composer: '', title: t }];
  }
  function normPieces(v) {
    var arr = parsePieces(v).map(function (x) {
      var clean = function (z) { z = s(z); return z === '0' ? '' : z; };
      return { round: s(x.round) === 'R2' ? 'R2' : (s(x.round) === 'R1' ? 'R1' : ''), kind: clean(x.kind), country: clean(x.country), composer: clean(x.composer), title: clean(x.title) };
    }).filter(function (x) { return x.title || x.composer; });
    return arr.length ? JSON.stringify(arr) : '';
  }
  function piecesFor(p, round) {
    var all = parsePieces(p && p.pieces);
    var r = all.filter(function (x) { return x.round === round; });
    return r.length ? r : all.filter(function (x) { return !x.round; });
  }
  function pieceLine(x) { return [x.country, x.composer, x.title].filter(Boolean).join(' / '); }
  function piecesText(list) {
    var mark = '①②③④⑤⑥';
    return list.map(function (x, i) { return mark.charAt(i) + ' ' + (x.kind ? x.kind + ': ' : '') + pieceLine(x); }).join('  ');
  }

  function groupLabel(groupKey) { var p = s(groupKey).split('|'); return p[0] + ' ' + (p[1] || ''); }

  /* ---------------- 수정 기록 ---------------- */
  var FIELD_LABEL = { name: '이름', birth: '생년월일', gender: '성별', division: '지원 부문', category: '지원 구분', school: '학교', grade: '학년', phone: '휴대폰', guardianName: '보호자 이름', guardianPhone: '보호자 휴대폰', email: '이메일', zip: '우편번호', address: '주소', payStatus: '결제 상태', payMemo: '입금 메모', status: '상태', teacher: '사사 선생님', note: '비고', pieces: '곡목', groupKey: '편성 부문' };
  var PRIVATE_FIELDS = ['birth', 'phone', 'guardianPhone', 'email', 'zip', 'address'];   // 값은 남기지 않고 '바뀜'만
  // 곡목이 어떻게 바뀌었는지 한마디로
  function pieceChangeKind(before, after) {
    var key = function (x) { return (s(x.composer) + '|' + s(x.title)).replace(/\s+/g, '').toLowerCase(); };
    var a = before.map(key), b = after.map(key);
    if (a.join('/') === b.join('/')) return before.map(function (x) { return s(x.kind) + s(x.country); }).join('/') === after.map(function (x) { return s(x.kind) + s(x.country); }).join('/') ? '' : '구분 고침';
    if (a.length === b.length && a.slice().sort().join('/') === b.slice().sort().join('/')) return '순서 변경';
    if (b.length > a.length) return '곡 추가';
    if (b.length < a.length) return '곡 삭제';
    return '곡 변경';
  }
  function addHistory(db, actor, pid, rows) {
    rows = (rows || []).filter(Boolean); if (!rows.length) return 0;
    var now = db.store.now(), base = String(Date.now ? Date.now() : now).slice(-9);
    db.append('History', rows.map(function (r, i) { return { hid: 'H' + base + '-' + i + '-' + randToken().slice(0, 4), time: now, actor: s(actor), pid: s(pid), round: s(r.round), field: s(r.field), before: s(r.before).slice(0, 500), after: s(r.after).slice(0, 500), note: s(r.note).slice(0, 200) }; }));
    return rows.length;
  }
  // 참가자 정보 비교 → 바뀐 항목 (곡목은 라운드별로)
  function diffParticipant(old, neu) {
    var out = [];
    Object.keys(FIELD_LABEL).forEach(function (k) {
      if (k === 'pieces' || k === 'groupKey' || !(k in neu)) return;
      var a = s(old[k]), b = s(neu[k]); if (a === b) return;
      out.push(PRIVATE_FIELDS.indexOf(k) >= 0 ? { field: k, before: a ? '(이전 값)' : '', after: b ? '(바뀜)' : '(지움)' } : { field: k, before: a, after: b });
    });
    if ('groupKey' in neu && s(old.groupKey) && s(old.groupKey) !== s(neu.groupKey)) out.push({ field: 'groupKey', before: groupLabel(old.groupKey), after: groupLabel(neu.groupKey) });
    if ('pieces' in neu) ['R1', 'R2'].forEach(function (r) {
      var a = piecesFor({ pieces: old.pieces }, r), b = piecesFor({ pieces: neu.pieces }, r);
      if (piecesText(a) === piecesText(b)) return;
      out.push({ field: 'pieces', round: r, before: piecesText(a), after: piecesText(b), note: pieceChangeKind(a, b) });
    });
    return out;
  }
  function historyText(h) { return (FIELD_LABEL[h.field] || h.field) + (h.round ? '(' + h.round + ')' : ''); }

  function roundCfg(cfg, round) {
    var p = round === 'R2' ? 'r2' : 'r1';
    return {
      round: round, name: cfg[p + 'Name'], mode: cfg[p + 'Mode'] || 'ox',
      judges: +cfg[p + 'Judges'] || 0, max: +cfg[p + 'Max'] || (cfg[p + 'Mode'] === 'rank' ? 5 : 1),
      drop: +cfg[p + 'Drop'] || 0
    };
  }

  /* ---------------- DB 컨텍스트 (요청 1회 동안 캐시) ---------------- */
  function makeDb(store) {
    var cache = {};
    var db = {
      store: store,
      t: function (name) { if (!cache[name]) cache[name] = store.all(name); return cache[name]; },
      upsert: function (name, rows) {
        store.upsert(name, KEYS[name], rows); delete cache[name]; if (name === 'Config') delete cache.__cfg;
        // 비밀번호·잠금처럼 화면 자료에 안 들어가는 값만 바뀐 건 '자료가 바뀌었다'로 안 셈
        if (!(name === 'Config' && rows.every(function (r) { return SECRET_KEYS.indexOf(r.key) >= 0; }))) db.dirty = true;
      },
      replaceWhere: function (name, pred, rows) { store.replaceWhere(name, pred, rows || []); delete cache[name]; db.dirty = true; },
      append: function (name, rows) { store.append(name, rows); delete cache[name]; db.dirty = true; },
      dirty: false,
      who: '',
      log: function (actor, action, detail) {
        if (actor === 'admin' && db.who) actor = 'admin:' + db.who;   // 관리자마다 이름이 남음
        store.append('Logs', [{ time: store.now(), actor: actor, action: action, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }]);
      }
    };
    db.cfg = function () {
      if (cache.__cfg) return cache.__cfg;
      var c = {}, k;
      for (k in DEFAULT_CONFIG) c[k] = DEFAULT_CONFIG[k];
      db.t('Config').forEach(function (r) { if (s(r.key)) c[s(r.key)] = s(r.value); });
      cache.__cfg = c;
      return c;
    };
    db.pmap = function () {
      if (cache.__pmap) return cache.__pmap;
      var m = {}; db.t('Participants').forEach(function (p) { m[p.id] = p; });
      cache.__pmap = m; return m;
    };
    db.invalidate = function () { cache = {}; };
    return db;
  }

  /* ---------------- 조편성·연주순서 ---------------- */
  function sessionsOf(db, round, groupKey) {
    return db.t('Sessions').filter(function (x) { return x.round === round && (!groupKey || x.groupKey === groupKey); })
      .sort(function (a, b) { return (+a.no || 0) - (+b.no || 0) || cmpKo(a.date + a.startTime, b.date + b.startTime); });
  }
  function entriesOf(db, round, groupKey) {
    var pm = db.pmap();
    return db.t('Entries').filter(function (e) { var p = pm[e.pid]; return e.round === round && p && (!groupKey || p.groupKey === groupKey); });
  }
  // 연주순서 = 앞 조들의 인원 합 + 조별순서(추첨번호). 74·75회 운영방식과 동일
  function perfOrders(db, round, groupKey) {
    var ses = sessionsOf(db, round, groupKey), ent = entriesOf(db, round, groupKey);
    var bySes = {}, offset = 0, out = {};
    ent.forEach(function (e) { (bySes[e.sessionId] = bySes[e.sessionId] || []).push(e); });
    ses.forEach(function (x) {
      var list = bySes[x.sessionId] || [];
      list.forEach(function (e) { out[e.entryId] = s(e.drawNo) ? offset + (+e.drawNo) : null; });
      offset += list.length;
    });
    return out;
  }
  // 조마다 앞 조 인원 합 — 추첨번호(부문 안에서 이어지는 번호) = 앞 조 인원 + 조 안 연주순서
  function sessionOffsets(db, round, groupKey) {
    var cnt = {}, off = 0, out = {};
    entriesOf(db, round, groupKey).forEach(function (e) { cnt[e.sessionId] = (cnt[e.sessionId] || 0) + 1; });
    sessionsOf(db, round, groupKey).forEach(function (x) { out[x.sessionId] = off; off += cnt[x.sessionId] || 0; });
    return out;
  }
  function recalcSessionEnd(db, cfg, sessionIds) {
    var cnt = {};
    db.t('Entries').forEach(function (e) { cnt[e.sessionId] = (cnt[e.sessionId] || 0) + 1; });
    var upd = [];
    db.t('Sessions').forEach(function (x) {
      if (sessionIds && sessionIds.indexOf(x.sessionId) < 0) return;
      var st = toMin(x.startTime); if (st == null) return;
      var per = +x.perSec || +cfg.perSec || 200;
      var dur = durMin(cfg, cnt[x.sessionId] || 0, per);
      var lead = +cfg.drawLeadMin || 30;
      upd.push({ sessionId: x.sessionId, endTime: fromMin(st + dur), drawTime: fromMin(st - lead) });
    });
    if (upd.length) db.upsert('Sessions', upd);
  }

  /* ---------------- 심사비 단가 ----------------
   * Config.judgeRates: '예선 종일=300000, 예선 반나절=250000, 본선 종일=350000, … 주말 본선 반나절=350000'
   * Judges.dayInfo:   '2027-03-25 종일 09:00 300000; 2027-03-26 반나절 13:00'  (금액을 비우면 단가표로 계산) */
  function parseJudgeRates(cfg) {
    var out = {};
    s(cfg.judgeRates).split(/[,，;\n]+/).forEach(function (part) {
      var m = /^(.*?)[=:]\s*([\d,]+)\s*원?\s*$/.exec(s(part)); if (!m) return;
      var k = m[1], v = +m[2].replace(/,/g, '');
      var round = /본선|2차|결선/.test(k) || (s(cfg.r2Name) && k.indexOf(s(cfg.r2Name)) >= 0) ? 'R2' : 'R1';
      var shift = /반나절|반일/.test(k) ? '반나절' : '종일';
      var wk = /주말|휴일|토요일|일요일/.test(k) ? '주말' : '평일';
      out[round + '|' + shift + '|' + wk] = v;
    });
    return out;
  }
  function isWeekend(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(date)); if (!m) return false;
    var d = new Date(+m[1], +m[2] - 1, +m[3]).getDay(); return d === 0 || d === 6;
  }
  function judgeDayFee(cfg, round, date, shift, explicit) {
    var ex = s(explicit).replace(/,/g, '');
    if (ex !== '' && !isNaN(+ex)) return +ex;
    var R = parseJudgeRates(cfg), sh = shift === '반나절' ? '반나절' : '종일', wk = isWeekend(date) ? '주말' : '평일';
    var v = R[round + '|' + sh + '|' + wk];
    if (v == null) v = R[round + '|' + sh + '|평일'];
    if (v == null) v = num(cfg.judgeFee);
    return v || 0;
  }
  function parseDayInfo(v) {
    var out = {};
    s(v).split(/[;\n]+/).forEach(function (part) {
      var m = /(\d{4}-\d{2}-\d{2})(?:\s+(종일|반나절))?(?:\s+(\d{1,2}:\d{2}))?(?:\s+([\d,]+))?/.exec(s(part)); if (!m) return;
      out[m[1]] = { shift: m[2] || '', arrive: m[3] || '', fee: m[4] ? +m[4].replace(/,/g, '') : '' };
    });
    return out;
  }
  function dayInfoStr(map) {
    return Object.keys(map).sort().map(function (d) {
      var x = map[d] || {}; return [d, x.shift, x.arrive, x.fee].filter(function (y) { return s(y) !== ''; }).join(' ');
    }).join('; ');
  }

  /* ---------------- 채점 집계 ---------------- */
  function judgeCovers(j, groupKey) {
    var div = s(groupKey).split('|')[0], g = s(j.groups), gk = normCategory(groupKey);
    if (!g || g === '전체') return true;
    // '피아노' = 부문 전체, '피아노|초등부' = 세부 부문, '성악|고등부' = 성악 고등부(남)·(여) 모두
    return splitList(g.replace(/\|/g, '§')).some(function (x) {
      x = x.replace(/§/g, '|'); if (x === groupKey || x === div) return true;
      var nx = normCategory(x); return nx === gk || gk.indexOf(nx + '(') === 0;
    });
  }
  function judgesFor(db, round, groupKey) {
    return db.t('Judges').filter(function (j) { return j.round === round && judgeCovers(j, groupKey); }).sort(function (a, b) { return (+a.seat || 99) - (+b.seat || 99) || cmpKo(a.name, b.name); });
  }

  function rankCompetition(rows, keyFn) {
    // 같은 값이면 같은 순위(1,2,2,4…)
    var prev = null, rank = 0, i = 0;
    rows.forEach(function (r) {
      i++;
      var k = keyFn(r);
      if (prev === null || k !== prev) { rank = i; prev = k; }
      r.rank = rank;
    });
  }

  function computeGroup(db, round, groupKey) {
    var cfg = db.cfg(), rc = roundCfg(cfg, round), pm = db.pmap();
    var ent = entriesOf(db, round, groupKey);
    var po = perfOrders(db, round, groupKey);
    var judges = judgesFor(db, round, groupKey);
    var scores = db.t('Scores').filter(function (x) { return x.round === round; });
    var byPid = {};
    scores.forEach(function (x) { (byPid[x.pid] = byPid[x.pid] || {})[x.judgeId] = x; });
    // 배정되지 않았지만 실제 채점한 심사위원도 포함
    var jIds = judges.map(function (j) { return j.judgeId; });
    var jAll = db.t('Judges');
    ent.forEach(function (e) {
      var m = byPid[e.pid] || {};
      Object.keys(m).forEach(function (jid) {
        if (jIds.indexOf(jid) < 0) {
          jIds.push(jid);
          var jj = jAll.filter(function (x) { return x.judgeId === jid; })[0];
          judges.push(jj || { judgeId: jid, name: jid, seat: 99 });
        }
      });
    });
    var expected = Math.max(rc.judges, judges.length);
    var group = db.t('Groups').filter(function (g) { return g.groupKey === groupKey; })[0] || {};
    var rows = ent.map(function (e) {
      var p = pm[e.pid], m = byPid[e.pid] || {};
      var vals = judges.map(function (j) { var x = m[j.judgeId]; return x && s(x.value) !== '' ? +x.value : null; });
      var comments = judges.map(function (j) { var x = m[j.judgeId]; return x ? s(x.comment) : ''; });
      var nums = vals.filter(function (v) { return v !== null; });
      var r = {
        entryId: e.entryId, pid: e.pid, name: p.name, school: p.school, grade: p.grade, birth: p.birth,
        sessionId: e.sessionId, seq: +e.seq || 0, drawNo: s(e.drawNo), perfOrder: po[e.entryId],
        attend: s(e.attend), pass: s(e.pass), values: vals, comments: comments, pieces: piecesFor(p, round),
        scored: nums.length, complete: nums.length >= expected && expected > 0
      };
      r.absent = r.attend === 'N';
      if (rc.mode === 'ox') {
        r.score = nums.reduce(function (a, b) { return a + (b > 0 ? 1 : 0); }, 0);
        r.display = r.score + '개';
      } else {
        var total = nums.reduce(function (a, b) { return a + b; }, 0);
        r.total = total;
        var sorted = nums.slice().sort(function (a, b) { return a - b; });
        var d = rc.drop;
        if (d > 0 && sorted.length > 2 * d) {
          r.dropped = sorted.slice(0, d).concat(sorted.slice(sorted.length - d));
          r.effective = sorted.slice(d, sorted.length - d).reduce(function (a, b) { return a + b; }, 0);
        } else r.effective = total;
        if (rc.mode === 'score' && nums.length) r.effective = Math.round((r.effective / Math.max(1, nums.length - (sorted.length > 2 * d ? 2 * d : 0))) * 100) / 100;
        r.score = r.effective;
        r.display = String(r.effective);
      }
      return r;
    });
    // 순위: 불참·미완료 제외
    var ranked = rows.filter(function (r) { return !r.absent && r.scored > 0; });
    if (rc.mode === 'rank') {
      // 유효등위 합 낮은 순 → 동점이면 전체 등위합(제외 전) 낮은 순 → 그래도 같으면 공동
      ranked.sort(function (a, b) { return a.effective - b.effective || a.total - b.total; });
      rankCompetition(ranked, function (r) { return r.effective + '/' + r.total; });
    } else {
      ranked.sort(function (a, b) { return b.score - a.score; });
      rankCompetition(ranked, function (r) { return String(r.score); });
    }
    var awardCount = +group.awardCount || 3, rankCnt = {};
    ranked.forEach(function (r) { rankCnt[r.rank] = (rankCnt[r.rank] || 0) + 1; });
    var entMap = {}; ent.forEach(function (e) { entMap[e.entryId] = e; });
    rows.forEach(function (r) {
      if (round !== 'R2') return;
      // 자동: 순위대로 (동점이면 '공동') / 직접 지정: 심사위원 합의로 '1위 없음', '공동 2위' 등 — '-'는 입상 안 함
      r.awardAuto = r.rank && r.rank <= awardCount ? (rankCnt[r.rank] > 1 ? '공동 ' : '') + r.rank + '위' : '';
      var ov = s((entMap[r.entryId] || {}).award);
      r.awardManual = !!ov;
      r.award = ov ? (ov === '-' ? '' : ov) : r.awardAuto;
    });
    rows.sort(function (a, b) {
      var pa = a.perfOrder == null ? 9999 + a.seq : a.perfOrder, pb = b.perfOrder == null ? 9999 + b.seq : b.perfOrder;
      return pa - pb;
    });
    // 분포(예선 O 개수별 인원)
    var dist = null;
    if (rc.mode === 'ox') {
      dist = {};
      for (var k = 0; k <= expected; k++) dist[k] = 0;
      rows.forEach(function (r) { if (!r.absent && r.scored > 0) dist[r.score] = (dist[r.score] || 0) + 1; });
    }
    return {
      round: round, groupKey: groupKey, label: groupLabel(groupKey), mode: rc.mode,
      judges: judges.map(function (j, i) { return { judgeId: j.judgeId, name: j.name, seat: j.seat, letter: String.fromCharCode(65 + i) }; }),
      expected: expected, rows: rows, dist: dist, cutline: s(group.r1Cutline), awardCount: awardCount, awardNote: s(group.awardNote),
      total: rows.length, absent: rows.filter(function (r) { return r.absent; }).length,
      completed: rows.filter(function (r) { return r.complete || r.absent; }).length,
      passed: rows.filter(function (r) { return r.pass === 'Y'; }).length
    };
  }

  function allGroupKeys(db) {
    var keys = {};
    db.t('Groups').forEach(function (g) { keys[g.groupKey] = +g.sort || 999; });
    db.t('Participants').forEach(function (p) { if (!(p.groupKey in keys)) keys[p.groupKey] = 999; });
    return Object.keys(keys).sort(function (a, b) { return keys[a] - keys[b] || groupKeyCmp(a, b); });
  }
  // 순서를 따로 안 정했으면: 늘 쓰는 부문 순서(피아노·바이올린·…·성악) → 초·중·고·대학일반 → 남·여
  var DIV_ORDER = ['피아노', '바이올린', '비올라', '첼로', '콘트라베이스', '더블베이스', '하프', '플루트', '오보에', '클라리넷', '바순', '색소폰', '호른', '트럼펫', '트롬본', '튜바', '타악기', '성악', '작곡'];
  var CAT_ORDER = ['초등부', '중등부', '고등부', '대학일반부', '대학부', '일반부'];
  function groupKeyCmp(a, b) {
    var pa = s(a).split('|'), pb = s(b).split('|');
    var da = DIV_ORDER.indexOf(pa[0]), db = DIV_ORDER.indexOf(pb[0]);
    if (pa[0] !== pb[0]) return ((da < 0 ? 99 : da) - (db < 0 ? 99 : db)) || cmpKo(pa[0], pb[0]);
    var ca = normCategory(pa[1]), cb = normCategory(pb[1]);
    var ia = -1, ib = -1;
    CAT_ORDER.forEach(function (x, i) { if (ia < 0 && ca.indexOf(x) === 0) ia = i; if (ib < 0 && cb.indexOf(x) === 0) ib = i; });
    var ga = /\(남\)/.test(ca) ? 0 : /\(여\)/.test(ca) ? 1 : 2, gb = /\(남\)/.test(cb) ? 0 : /\(여\)/.test(cb) ? 1 : 2;
    return ((ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib)) || (ga - gb) || cmpKo(ca, cb);
  }

  /* ---------------- 입금 대조 ---------------- */
  // deposits: [{date, amount, memo}], 적요에는 보통 '이름+생년월일6자리'가 들어옴
  function matchDeposits(participants, deposits, fee) {
    fee = +fee || 0;
    var plist = participants.filter(isActive);
    var used = {};
    var out = { matches: [], unmatched: [], unpaid: [] };
    deposits.forEach(function (d) {
      var amt = +digits(d.amount) || 0;
      if (amt <= 0) return;
      var memo = s(d.memo).replace(/\s/g, '');
      var hangul = (memo.match(/[가-힣]+/g) || []).join('');
      var num = digits(memo);
      var cands = [], level = '';
      if (hangul) {
        cands = plist.filter(function (p) { return p.name && hangul.indexOf(p.name.replace(/\s/g, '')) === 0; });
        if (num.length >= 4) {
          var strong = cands.filter(function (p) { return p.birth && (p.birth === num.slice(0, 6) || p.birth.indexOf(num) === 0 || num.indexOf(p.birth) === 0); });
          if (strong.length >= 1) { cands = strong; level = strong.length === 1 ? '확실' : '확인필요'; }
          else level = cands.length ? '확인필요' : '';
        } else level = cands.length === 1 ? '이름일치' : (cands.length ? '확인필요' : '');
      }
      var note = [];
      if (fee && amt !== fee) note.push(amt > fee && amt % fee === 0 ? (amt / fee) + '인분 금액' : '금액 다름(' + amt.toLocaleString() + '원)');
      if (cands.length) {
        cands.forEach(function (p) { if (used[p.id]) note.push(p.name + ' 중복입금 의심'); });
        cands.forEach(function (p) { used[p.id] = true; });
        out.matches.push({ deposit: { date: s(d.date), amount: amt, memo: s(d.memo) }, pids: cands.map(function (p) { return p.id; }), level: level || '확인필요', note: note.join(', ') });
      } else out.unmatched.push({ date: s(d.date), amount: amt, memo: s(d.memo), note: note.join(', ') });
    });
    plist.forEach(function (p) { if (!used[p.id] && !isPaid(p)) out.unpaid.push(p.id); });
    return out;
  }

  /* ---------------- 인증 ---------------- */
  /* ---------------- 비밀번호 · 로그인 잠금 ----------------
   * 비밀번호는 'H1$소금$해시'(SHA-256 1000번)로만 저장. 예전 평문 값은 처음 로그인할 때 바뀜.
   * 여러 번 틀리면 잠깐 막음 (구글 앱스크립트는 접속 IP를 알 수 없어 역할별로 막음) */
  function utf8bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) { var cp = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(++i) - 0xdc00); out.push(0xf0 | cp >> 18, 0x80 | cp >> 12 & 63, 0x80 | cp >> 6 & 63, 0x80 | cp & 63); }
      else out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return out;
  }
  var SHA_K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256hex(str) {
    var b = utf8bytes(str), l = b.length * 8, H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64), i, t;
    b.push(0x80); while (b.length % 64 !== 56) b.push(0);
    b.push(0, 0, 0, 0, (l >>> 24) & 255, (l >>> 16) & 255, (l >>> 8) & 255, l & 255);
    var r = function (x, n) { return (x >>> n) | (x << (32 - n)); };
    for (var o = 0; o < b.length; o += 64) {
      for (t = 0; t < 16; t++) W[t] = (b[o + 4 * t] << 24) | (b[o + 4 * t + 1] << 16) | (b[o + 4 * t + 2] << 8) | b[o + 4 * t + 3];
      for (t = 16; t < 64; t++) { var x = W[t - 15], y = W[t - 2]; W[t] = (W[t - 16] + (r(x, 7) ^ r(x, 18) ^ (x >>> 3)) + W[t - 7] + (r(y, 17) ^ r(y, 19) ^ (y >>> 10))) | 0; }
      var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[t] + W[t]) | 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    for (i = 0, t = ''; i < 8; i++) t += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
    return t;
  }
  function pwDigest(salt, pw) { var h = sha256hex(salt + ':' + pw); for (var i = 0; i < 1000; i++) h = sha256hex(h + salt); return h; }
  function pwHash(db, pw) { var salt = s(db.store.uid()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || String(Math.random()).slice(2); return 'H1$' + salt + '$' + pwDigest(salt, pw); }
  function pwCheck(stored, pw) {
    stored = s(stored); if (!stored || !s(pw)) return false;
    var m = /^H1\$([^$]+)\$([0-9a-f]{64})$/.exec(stored);
    return m ? pwDigest(m[1], pw) === m[2] : stored === pw;
  }
  function adminList(c) { try { var a = JSON.parse(s(c.admins) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveAdminList(db, list) { db.upsert('Config', [{ key: 'admins', value: JSON.stringify(list) }]); }
  var LOCK = { admin: [8, 10], desk: [20, 10], judge: [30, 10] };   // [이 안에 이만큼 틀리면, 분 동안 막음]
  function lockState(db) { try { return JSON.parse(s(db.cfg().loginLock) || '{}') || {}; } catch (e) { return {}; } }
  function checkLock(db, role) {
    var st = lockState(db)[role], now = Date.now();
    if (st && st.until > now) fail('비밀번호를 여러 번 틀려서 로그인을 잠시 막았어요. ' + Math.ceil((st.until - now) / 60000) + '분 뒤에 다시 해 주세요. (이미 들어와 있는 화면은 그대로 쓸 수 있어요)');
  }
  function noteFail(db, role) {
    var all = lockState(db), st = all[role] || {}, now = Date.now(), lim = LOCK[role] || [10, 10];
    st.f = (st.f || []).filter(function (x) { return now - x < lim[1] * 60000; }); st.f.push(now);
    if (st.f.length >= lim[0]) { st.until = now + lim[1] * 60000; st.f = []; }
    all[role] = st; db.upsert('Config', [{ key: 'loginLock', value: JSON.stringify(all) }]);
    db.log('public', 'loginFail', role + (st.until > now ? ' — ' + lim[1] + '분 잠금' : ''));
  }
  function clearFail(db, role) { var all = lockState(db); if (all[role]) { delete all[role]; db.upsert('Config', [{ key: 'loginLock', value: JSON.stringify(all) }]); } }
  function ownerName(c) { return s(c.ownerName) || s(c.manager) || '책임 관리자'; }
  var SECRET_KEYS = ['adminPassword', 'admins', 'loginLock'];

  function issueToken(db, payload) {
    var tk = db.store.uid();
    db.store.cachePut('tk_' + tk, JSON.stringify(payload), 6 * 3600);
    return tk;
  }
  function readToken(db, tk) {
    if (!tk) return null;
    var v = db.store.cacheGet('tk_' + tk);
    return v ? JSON.parse(v) : null;
  }

  function judgeOf(db, auth) {
    var j = db.t('Judges').filter(function (x) { return x.judgeId === auth.judgeId; })[0];
    if (!j) fail('심사위원 정보가 없습니다. 다시 로그인해 주세요.');
    return j;
  }
  function judgeCanSee(db, j, session) {
    if (session.round !== j.round) return false;
    return judgesFor(db, j.round, session.groupKey).some(function (x) { return x.judgeId === j.judgeId; });
  }

  /* ---------------- 본인 확인 ---------------- */
  function findSelf(db, p) {
    var name = s(p.name).replace(/\s/g, ''), birth = normBirth(p.birth), ph = digits(p.phone4).slice(-4), id = s(p.id);
    if (!(name || id) || birth.length !== 6 || ph.length !== 4) fail('이름(또는 접수번호), 생년월일 6자리, 휴대폰 뒷 4자리를 모두 입력해 주세요.');
    var hits = db.t('Participants').filter(function (q) {
      if (!isActive(q)) return false;
      if (id && s(q.id) !== id) return false;
      if (!id && s(q.name).replace(/\s/g, '').replace(/\d|\*/g, '') !== name) return false;
      if (q.birth !== birth) return false;
      return [q.phone, q.guardianPhone].some(function (x) { return x && digits(x).slice(-4) === ph; });
    });
    if (!hits.length) fail('일치하는 참가자가 없습니다. 입력한 정보를 다시 확인하거나 사무국에 문의해 주세요.');
    return hits;
  }

  /* ---------------- 참가자 곡목 수정 가능 여부 ----------------
   * null = 화면에 아예 안 보임, {open:false, reason} = 마감 안내, {open:true, until} = 수정 가능 */
  function pieceEditState(db, p, round) {
    var cfg = db.cfg(), n = round === 'R2' ? '2' : '1';
    if (cfg['pieceEditR' + n] !== 'Y') return null;
    var divs = splitList(cfg.pieceEditDivisions);
    if (divs.length && divs.indexOf(splitDivision(p.division).division) < 0) return null;
    var e1 = db.t('Entries').filter(function (e) { return e.round === 'R1' && e.pid === p.id; })[0];
    var e2 = db.t('Entries').filter(function (e) { return e.round === 'R2' && e.pid === p.id; })[0];
    if (round === 'R2') {
      // 예선 결과가 공개되기 전에는 버튼만으로 합격 여부가 드러나지 않도록 숨김
      var eligible = (cfg.publishR1Result === 'Y' && e1 && e1.pass === 'Y') || (e2 && cfg.publishR2Schedule === 'Y');
      if (!eligible) return null;
    }
    var until = s(cfg.pieceEditUntil);
    if (until && /^\d{4}-\d{2}-\d{2}$/.test(until)) until += ' 23:59:59';
    if (until && db.store.now() > until) return { open: false, reason: '곡목 수정 기간이 끝났습니다 (' + s(cfg.pieceEditUntil) + ' 마감)' };
    var started = db.t('Scores').some(function (x) { return x.round === round && x.pid === p.id && s(x.value) !== ''; });
    if (started) return { open: false, reason: '심사가 시작되어 곡목을 바꿀 수 없습니다' };
    return { open: true, until: s(cfg.pieceEditUntil), reorder: cfg.pieceReorder !== 'N' };
  }

  /* ---------------- 참가자 본인조회 응답 ---------------- */
  function sessionView(x) {
    if (!x) return null;
    return { sessionId: x.sessionId, label: x.label, no: x.no, date: x.date, drawTime: x.drawTime, startTime: x.startTime, endTime: x.endTime, venue: x.venue };
  }
  function participantView(db, p) {
    var cfg = db.cfg();
    var out = {
      id: p.id, name: p.name, birth: p.birth, school: p.school, grade: p.grade, division: p.division,
      category: p.category, groupKey: p.groupKey, groupLabel: groupLabel(p.groupKey), paid: isPaid(p),
      status: p.status, token: p.token, rounds: {}
    };
    ['R1', 'R2'].forEach(function (round) {
      var n = round === 'R1' ? '1' : '2';
      var e = db.t('Entries').filter(function (x) { return x.round === round && x.pid === p.id; })[0];
      if (!e) return;
      var r = { name: roundCfg(cfg, round).name, pieces: piecesFor(p, round) };
      if (cfg['publishR' + n + 'Schedule'] === 'Y') {
        var x = db.t('Sessions').filter(function (q) { return q.sessionId === e.sessionId; })[0];
        r.session = sessionView(x);
        r.seq = e.seq;
        var po = perfOrders(db, round, p.groupKey);
        r.drawNo = s(e.drawNo);
        r.perfOrder = po[e.entryId];
      }
      if (cfg['publishR' + n + 'Result'] === 'Y') {
        var g = computeGroup(db, round, p.groupKey);
        var row = g.rows.filter(function (q) { return q.entryId === e.entryId; })[0];
        if (row && (row.absent || row.scored > 0)) {
          if (row.absent) r.result = { absent: true };
          else if (g.mode === 'ox') {
            r.result = { mode: 'ox', count: row.score, of: g.expected, pass: row.pass === 'Y' };
            if (cfg.showCutline === 'Y' && g.cutline) r.result.cutline = +g.cutline;
          } else {
            r.result = { mode: g.mode, values: row.values, total: row.total, effective: row.effective, rank: row.rank, award: row.award || '', of: g.rows.filter(function (q) { return !q.absent; }).length };
          }
        }
      }
      out.rounds[round] = r;
    });
    out.pieces = { R1: piecesFor(p, 'R1'), R2: piecesFor(p, 'R2') };
    out.pieceEdit = { R1: pieceEditState(db, p, 'R1'), R2: pieceEditState(db, p, 'R2') };
    out.piecesAt = s(p.piecesAt);
    out.requestOpen = cfg.gonggyeolOpen === 'Y';
    out.requests = myRequests(db, p.id);
    var r2v = out.rounds.R2;
    if (r2v && r2v.result && r2v.result.award) out.prize = prizeView(db, p, r2v.result.award);
    return out;
  }

  /* ---------------- 요청 처리기 ---------------- */
  var A = {};
  function def(name, role, write, fn) { A[name] = { role: role, write: write, run: fn }; }

  // ── 공개 ──
  def('publicInfo', 'public', false, function (db) {
    var c = db.cfg(), o = {};
    PUBLIC_CONFIG_KEYS.forEach(function (k) { o[k] = c[k]; });
    return o;
  });

  // 참가자 공개 시간표 (이름 없이 조·시간·인원만). 일정 공개 스위치가 켜진 라운드만
  def('publicSchedule', 'public', false, function (db) {
    var cfg = db.cfg(), cnt = {};
    db.t('Entries').forEach(function (e) { cnt[e.sessionId] = (cnt[e.sessionId] || 0) + 1; });
    var pub = { R1: cfg.publishR1Schedule === 'Y', R2: cfg.publishR2Schedule === 'Y' };
    return {
      title: cfg.title, organizer: cfg.organizer, contact: cfg.contact, themeColor: cfg.themeColor, r1Name: cfg.r1Name, r2Name: cfg.r2Name, drawLeadMin: cfg.drawLeadMin, pubCountR1: cfg.pubCountR1, pubCountR2: cfg.pubCountR2,
      sessions: db.t('Sessions').filter(function (x) { return pub[x.round]; }).map(function (x) {
        return { round: x.round, groupKey: x.groupKey, no: x.no, label: x.label, date: x.date, drawTime: x.drawTime, startTime: x.startTime, endTime: x.endTime, venue: x.venue, count: cnt[x.sessionId] || 0 };
      }),
      plan: db.t('Plan').filter(function (x) { return pub[x.round]; }).map(function (x) { return { round: x.round, date: x.date }; })
    };
  });

  def('lookup', 'public', false, function (db, p) {
    return findSelf(db, p).map(function (q) { return participantView(db, q); });
  });

  // 참가자 본인 곡목 수정 (설정에서 허용한 라운드·부문·기간에만)
  def('updateMyPieces', 'public', true, function (db, p) {
    var q = findSelf(db, p).filter(function (x) { return x.id === s(p.pid); })[0];
    if (!q) fail('본인 확인이 맞지 않습니다. 다시 조회해 주세요.');
    var round = p.round === 'R2' ? 'R2' : 'R1';
    var st = pieceEditState(db, q, round);
    if (!st || !st.open) fail(st ? st.reason : '지금은 곡목을 수정할 수 없습니다.');
    var before = piecesFor(q, round);
    var incoming = (Array.isArray(p.pieces) ? p.pieces : []).slice(0, 6).map(function (x) {
      return { round: round, kind: s(x.kind).slice(0, 30), country: s(x.country).slice(0, 30), composer: s(x.composer).slice(0, 80), title: s(x.title).slice(0, 200) };
    });
    if (!incoming.length) fail('곡목을 한 곡 이상 적어 주세요.');
    if (incoming.some(function (x) { return !x.title; })) fail('곡명이 비어 있는 줄이 있어요.');
    if (before.length && incoming.length !== before.length) fail('곡 수는 ' + before.length + '곡이어야 합니다. 곡을 늘리거나 줄이려면 사무국에 문의해 주세요.');
    if (!st.reorder && before.length) incoming.forEach(function (x, i) { x.kind = before[i].kind; });
    var others = parsePieces(q.pieces).filter(function (x) { return x.round !== round && x.round; });
    var merged = round === 'R1' ? incoming.concat(others) : others.concat(incoming);
    var now = db.store.now();
    db.upsert('Participants', [{ id: q.id, pieces: normPieces(merged), piecesAt: now }]);
    addHistory(db, '참가자 본인', q.id, [{ field: 'pieces', round: round, before: piecesText(before), after: piecesText(incoming), note: pieceChangeKind(before, incoming) }]);
    db.log('참가자', 'updateMyPieces', q.id + ' ' + round + ' 곡목 ' + (pieceChangeKind(before, incoming) || '수정'));
    db.invalidate();
    return participantView(db, db.pmap()[q.id]);
  });

  def('login', 'public', true, function (db, p) {
    var c = db.cfg(), role = s(p.role), secret = s(p.secret);
    if (!secret) fail('비밀번호를 입력해 주세요.');
    if (role === 'admin') {
      checkLock(db, 'admin');
      if (!c.adminPassword) fail('관리자 비밀번호가 아직 설정되지 않았습니다. 구글시트 Config에서 adminPassword를 먼저 넣어 주세요.');
      if (pwCheck(c.adminPassword, secret)) {
        if (!/^H1\$/.test(s(c.adminPassword))) db.upsert('Config', [{ key: 'adminPassword', value: pwHash(db, secret) }]);   // 평문 → 해시
        clearFail(db, 'admin'); db.who = ownerName(c); db.log('admin', 'login', '책임 관리자'); safePurge(db);
        return { token: issueToken(db, { role: 'admin', owner: true, name: ownerName(c) }), role: 'admin', name: ownerName(c), owner: true };
      }
      var list = adminList(c), me = list.filter(function (a) { return a.on !== 'N' && pwCheck(a.h, secret); })[0];
      if (me) {
        me.last = db.store.now(); saveAdminList(db, list); clearFail(db, 'admin'); db.who = me.name; db.log('admin', 'login', ''); safePurge(db);
        return { token: issueToken(db, { role: 'admin', owner: false, name: me.name, adminId: me.id }), role: 'admin', name: me.name, owner: false };
      }
      if (list.some(function (a) { return a.on === 'N' && pwCheck(a.h, secret); })) fail('사용이 중지된 계정이에요. 책임 관리자에게 문의해 주세요.');
      noteFail(db, 'admin'); fail('비밀번호가 맞지 않습니다.');
    }
    if (role === 'desk') {
      checkLock(db, 'desk');
      var ok = (s(c.deskPin) && secret === s(c.deskPin)) || pwCheck(c.adminPassword, secret) || adminList(c).some(function (a) { return a.on !== 'N' && pwCheck(a.h, secret); });
      if (!ok) { noteFail(db, 'desk'); fail('PIN이 맞지 않습니다.'); }
      clearFail(db, 'desk');
      return { token: issueToken(db, { role: 'desk' }), role: 'desk' };
    }
    if (role === 'judge') {
      checkLock(db, 'judge');
      var j = db.t('Judges').filter(function (x) { return s(x.pin) && s(x.pin) === secret; })[0];
      if (!j) { noteFail(db, 'judge'); fail('PIN이 맞지 않습니다.'); }
      clearFail(db, 'judge');
      return { token: issueToken(db, { role: 'judge', judgeId: j.judgeId }), role: 'judge', name: j.name };
    }
    fail('알 수 없는 로그인 유형');
  });

  // ── 관리자 계정 (책임 관리자만 관리) ──
  function ownerOnly(auth) { if (!auth || !auth.owner) fail('책임 관리자만 할 수 있어요.'); }
  def('adminAccounts', 'admin', false, function (db, p, auth) {
    ownerOnly(auth);
    var c = db.cfg(), lk = lockState(db), now = Date.now();
    return { owner: ownerName(c), hashed: /^H1\$/.test(s(c.adminPassword)), list: adminList(c).map(function (a) { return { id: a.id, name: a.name, on: a.on !== 'N', last: a.last || '' }; }),
      locks: Object.keys(lk).filter(function (k) { return lk[k].until > now; }).map(function (k) { return { role: k, min: Math.ceil((lk[k].until - now) / 60000) }; }) };
  });
  def('saveAdminAccount', 'admin', true, function (db, p, auth) {
    ownerOnly(auth);
    var c = db.cfg(), list = adminList(c), name = s(p.name), pw = s(p.password), id = s(p.id);
    var cur = id ? list.filter(function (a) { return a.id === id; })[0] : null;
    if (id && !cur) fail('관리자를 찾지 못했어요.');
    if (p.remove) { list = list.filter(function (a) { return a.id !== id; }); saveAdminList(db, list); db.log('admin', 'adminRemove', cur.name); return true; }
    if (!cur) { if (!name) fail('이름을 넣어 주세요.'); if (list.length >= 10) fail('관리자는 10명까지예요.'); cur = { id: 'A' + db.store.uid().slice(0, 8), name: name, h: '', on: 'Y', last: '' }; list.push(cur); }
    if (name) cur.name = name;
    if ('on' in p) cur.on = p.on ? 'Y' : 'N';
    if (pw) {
      if (pw.length < 8) fail('비밀번호는 8자 이상으로 해 주세요.');
      if (pwCheck(c.adminPassword, pw) || list.some(function (a) { return a !== cur && pwCheck(a.h, pw); }) || pw === s(c.deskPin)) fail('다른 관리자·진행요원 PIN과 같은 비밀번호는 쓸 수 없어요.');
      cur.h = pwHash(db, pw);
    }
    if (!cur.h) fail('비밀번호를 넣어 주세요.');
    saveAdminList(db, list); db.log('admin', 'adminSave', cur.name + (pw ? ' (비밀번호)' : '') + (cur.on === 'N' ? ' (중지)' : ''));
    return cur.id;
  });
  def('changePassword', 'admin', true, function (db, p, auth) {
    var c = db.cfg(), old = s(p.old), pw = s(p.password);
    if (pw.length < 8) fail('새 비밀번호는 8자 이상으로 해 주세요.');
    if (auth.owner) {
      if (!pwCheck(c.adminPassword, old)) fail('지금 비밀번호가 맞지 않아요.');
      if (adminList(c).some(function (a) { return pwCheck(a.h, pw); })) fail('다른 관리자와 같은 비밀번호는 쓸 수 없어요.');
      db.upsert('Config', [{ key: 'adminPassword', value: pwHash(db, pw) }]);
    } else {
      var list = adminList(c), me = list.filter(function (a) { return a.id === auth.adminId; })[0];
      if (!me || !pwCheck(me.h, old)) fail('지금 비밀번호가 맞지 않아요.');
      if (pwCheck(c.adminPassword, pw) || list.some(function (a) { return a !== me && pwCheck(a.h, pw); })) fail('다른 관리자와 같은 비밀번호는 쓸 수 없어요.');
      me.h = pwHash(db, pw); saveAdminList(db, list);
    }
    db.log('admin', 'changePassword', '');
    return true;
  });
  def('unlockLogins', 'admin', true, function (db, p, auth) { ownerOnly(auth); db.upsert('Config', [{ key: 'loginLock', value: '' }]); db.log('admin', 'unlockLogins', ''); return true; });

  // ── 관리자 ──
  // 화면이 가진 자료 버전이 지금과 같으면 시트를 읽지 않고 '그대로'만 알려 줌
  var LOAD_TABLES = ['Config', 'Groups', 'Participants', 'Sessions', 'Entries', 'Judges', 'Scores', 'Submissions', 'Plan', 'Staff', 'Work', 'Prizes', 'Requests', 'Docs', 'Seasons', 'History'];
  def('adminLoad', 'admin', false, function (db, p, auth) {
    var ver = db.store.ver ? db.store.ver() : '';
    if (p.ver && ver && s(p.ver) === ver) return { same: true, ver: ver };
    if (db.store.prefetch) db.store.prefetch(LOAD_TABLES);   // 구글시트: 탭 14개를 한 번에 읽기
    var keys = allGroupKeys(db);
    var results = { R1: {}, R2: {} };
    ['R1', 'R2'].forEach(function (r) {
      keys.forEach(function (k) { if (entriesOf(db, r, k).length) results[r][k] = computeGroup(db, r, k); });
    });
    var cfg = Object.assign({}, db.cfg()); SECRET_KEYS.forEach(function (k) { delete cfg[k]; });
    return {
      ver: ver, me: { name: auth && auth.name || '', owner: !!(auth && auth.owner) },
      cfg: cfg, groupKeys: keys, groups: db.t('Groups'), participants: db.t('Participants'),
      sessions: db.t('Sessions'), entries: db.t('Entries'), judges: db.t('Judges'),
      submissions: db.t('Submissions'), results: results, plan: db.t('Plan'),
      staff: db.t('Staff'), work: db.t('Work'), prizes: db.t('Prizes'), requests: db.t('Requests'), docs: db.t('Docs'), judgePeople: judgeSummary(db),
      seasons: db.t('Seasons'),   // 통계만 (명단은 archiveSearch로 따로)
      history: db.t('History').slice(-3000)   // 수정 기록 (최근 것)
    };
  });

  def('setConfig', 'admin', true, function (db, p) {
    var rows = [];
    Object.keys(p.values || {}).forEach(function (k) { if (SECRET_KEYS.indexOf(k) < 0) rows.push({ key: k, value: s(p.values[k]) }); });   // 비밀번호는 전용 메뉴로만
    db.upsert('Config', rows);
    db.log('admin', 'setConfig', Object.keys(p.values || {}).join(','));
    return true;
  });

  def('importParticipants', 'admin', true, function (db, p) {
    var cfg = db.cfg(), rows = p.rows || [], mode = p.mode || 'merge';
    var existing = db.pmap(), out = [], seen = {}, added = 0, updated = 0, keptPaid = 0;
    rows.forEach(function (r, i) {
      var id = s(r.id) || ('X' + (i + 1));
      if (seen[id]) id = id + '-' + i;
      seen[id] = true;
      var old = existing[id] || {};
      var o = {
        id: id, name: s(r.name), birth: normBirth(r.birth), gender: s(r.gender), phone: normPhone(r.phone),
        guardianName: s(r.guardianName), guardianPhone: normPhone(r.guardianPhone), email: s(r.email),
        zip: s(r.zip) || s(old.zip), address: s(r.address) || s(old.address),
        school: s(r.school), grade: s(r.grade), division: splitDivision(r.division).division, category: s(r.category),
        appliedAt: s(r.appliedAt), payStatus: s(r.payStatus), teacher: s(r.teacher), pieces: normPieces(r.pieces) || s(old.pieces),
        status: /취소|환불/.test(s(r.status)) ? '취소' : (old.status || '정상'), note: s(r.note) || s(old.note)
      };
      // 통장 입금대조 방식일 때만: 사무국이 확인한 입금을 오래된 파일이 덮어쓰지 않게. 가상계좌는 파일의 결제 상태가 정답
      if (cfg.payMode === 'match' && isPaid(old) && !isPaid(o)) { o.payStatus = old.payStatus; keptPaid++; }
      o.payMemo = s(old.payMemo);
      o.region = regionOf(o.address, o.zip);
      o.token = s(old.token) || randToken();
      o.groupKey = makeGroupKey(cfg, r.division, o.category, o.gender || splitDivision(r.division).gender);
      if (existing[id]) updated++; else added++;
      out.push(o);
    });
    if (mode === 'replace') db.replaceWhere('Participants', function () { return true; }, out);
    else db.upsert('Participants', out);
    // 부문 목록 자동 생성
    var gexist = {}; db.t('Groups').forEach(function (g) { gexist[g.groupKey] = 1; });
    var newG = [], seenG = {};
    db.t('Participants').forEach(function (q) {
      if (gexist[q.groupKey] || seenG[q.groupKey]) return;
      seenG[q.groupKey] = 1;
      var pr = q.groupKey.split('|');
      newG.push({ groupKey: q.groupKey, division: pr[0], category: pr[1], sort: '', r1Cutline: '', awardCount: '3' });
    });
    if (newG.length) db.upsert('Groups', newG);
    db.log('admin', 'importParticipants', { mode: mode, added: added, updated: updated });
    return { added: added, updated: updated, keptPaid: keptPaid, groupsAdded: newG.length };
  });

  def('saveParticipant', 'admin', true, function (db, p) {
    var cfg = db.cfg(), r = p.row || {};
    if (!s(r.id)) fail('접수번호가 없습니다.');
    var old = db.pmap()[r.id] || {};
    var o = {}; SCHEMA.Participants.forEach(function (k) { if (k in r) o[k] = s(r[k]); });
    if ('birth' in o) o.birth = normBirth(o.birth);
    if ('phone' in o) o.phone = normPhone(o.phone);
    if ('guardianPhone' in o) o.guardianPhone = normPhone(o.guardianPhone);
    if ('pieces' in r) o.pieces = normPieces(r.pieces);
    if ('address' in r || 'zip' in r) o.region = regionOf('address' in r ? r.address : old.address, 'zip' in r ? r.zip : old.zip);
    if ('division' in o) { var sd = splitDivision(o.division); o.division = sd.division; if (sd.gender && !s(r.gender)) o.gender = sd.gender; }
    o.token = s(old.token) || randToken();
    var m = {}; Object.keys(old).forEach(function (k) { m[k] = old[k]; }); Object.keys(o).forEach(function (k) { m[k] = o[k]; });
    o.groupKey = makeGroupKey(cfg, m.division, m.category, m.gender);
    o.id = s(r.id);
    var ch = old.id ? diffParticipant(old, o) : [];
    db.upsert('Participants', [o]);
    if (ch.length) { ch.forEach(function (h) { if (s(p.note)) h.note = (h.note ? h.note + ' · ' : '') + s(p.note); }); addHistory(db, db.who || '관리자', o.id, ch); }
    db.log('admin', 'saveParticipant', o.id + (old.id ? (ch.length ? ' 수정: ' + ch.map(historyText).join(', ') : ' (바뀐 것 없음)') : ' 추가'));
    return o;
  });

  def('setPayments', 'admin', true, function (db, p) {
    var rows = (p.updates || []).map(function (u) { return { id: s(u.id), payStatus: s(u.payStatus), payMemo: s(u.payMemo) }; });
    db.upsert('Participants', rows);
    db.log('admin', 'setPayments', rows.length + '건');
    return rows.length;
  });

  def('saveGroups', 'admin', true, function (db, p) { db.upsert('Groups', p.groups || []); return true; });

  // 성(姓) — 두 글자 성은 따로 봄
  var SUR2 = ['남궁', '황보', '제갈', '선우', '독고', '사공', '서문', '동방', '어금', '망절', '장곡'];
  function surnameOf(n) { n = s(n).replace(/\s/g, ''); if (!n) return ''; var two = n.slice(0, 2); return n.length > 2 && SUR2.indexOf(two) >= 0 ? two : n.charAt(0); }
  function shuffle(a) { for (var k = a.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)); var t = a[k]; a[k] = a[j]; a[j] = t; } return a; }

  def('generateSessions', 'admin', true, function (db, p) {
    var cfg = db.cfg(), round = p.round === 'R2' ? 'R2' : 'R1', gk = s(p.groupKey);
    if (!gk) fail('부문을 선택해 주세요.');
    var pm = db.pmap();
    var oldEntries = db.t('Entries').filter(function (e) { return e.round === round && pm[e.pid] && pm[e.pid].groupKey === gk; });
    var oldIds = {}; oldEntries.forEach(function (e) { oldIds[e.pid] = 1; });
    var hasScores = db.t('Scores').some(function (x) { return x.round === round && oldIds[x.pid]; });
    if (hasScores && !p.force) fail('이미 채점이 시작된 부문입니다. 조편성을 다시 하면 채점 연결이 끊길 수 있어요.');
    var cand;
    if (round === 'R1') {
      cand = db.t('Participants').filter(function (q) { return q.groupKey === gk && isActive(q) && (isPaid(q) || p.includeUnpaid); });
    } else {
      var passIds = {};
      db.t('Entries').forEach(function (e) { if (e.round === 'R1' && e.pass === 'Y') passIds[e.pid] = 1; });
      cand = db.t('Participants').filter(function (q) { return q.groupKey === gk && passIds[q.id] && isActive(q); });
    }
    if (!cand.length) fail(round === 'R1' ? '편성할 참가자가 없습니다. (입금확인된 참가자만 편성됩니다)' : '본선진출자가 없습니다. 예선 커트라인을 먼저 확정해 주세요.');
    // 조 나누는 방식 — mix(기본): 무작위로 섞되 같은 성씨가 한 조에 몰리지 않게 골고루, 조 안 순번은 가나다순
    //                 name: 가나다순으로 차례로 / applied: 신청 순
    var order = p.order === 'name' || p.order === 'applied' ? p.order : 'mix';
    var byName = function (a, b) { return cmpKo(a.name, b.name) || cmpKo(a.birth, b.birth); };
    if (order === 'applied') cand.sort(function (a, b) { return cmpKo(a.appliedAt, b.appliedAt); });
    else if (order === 'name') cand.sort(byName);
    else shuffle(cand);

    var slots = (p.slots || []).filter(function (x) { return s(x.date) && s(x.startTime); })
      .sort(function (a, b) { return cmpKo(normDate(a.date) + normTime(a.startTime), normDate(b.date) + normTime(b.startTime)); });
    if (!slots.length) fail('경연 일자와 시작 시각을 한 줄 이상 넣어 주세요.');
    var n = cand.length, fixed = 0, free = 0;
    slots.forEach(function (x) { if (+x.count > 0) fixed += +x.count; else free++; });
    if (fixed > n) fail('지정한 인원 합(' + fixed + '명)이 편성 대상(' + n + '명)보다 많습니다.');
    if (!free && fixed < n) fail('지정한 인원 합(' + fixed + '명)이 편성 대상(' + n + '명)보다 적습니다. 인원 칸을 비워 두면 나머지를 자동으로 나눕니다.');
    var rest = n - fixed, base = free ? Math.floor(rest / free) : 0, extra = free ? rest % free : 0, fi = 0;
    var counts = slots.map(function (x) { if (+x.count > 0) return +x.count; var c = base + (fi < extra ? 1 : 0); fi++; return c; });

    var perSec = +p.perSec || +cfg.perSec || 200, lead = +cfg.drawLeadMin || 30;
    var stamp = db.store.uid().slice(0, 6), pm0 = toMin(cfg.afternoonFrom) || 720;
    var info = slots.map(function (x, i) { return { i: i, date: normDate(x.date), st: toMin(normTime(x.startTime)), cap: counts[i], members: [], per: +x.perSec || perSec, endTime: normTime(x.endTime) }; });
    // '그날 마지막 조' = 이 부문의 새 조와 이미 편성된 다른 부문 조를 모두 놓고 봤을 때 그날 가장 늦게 시작하는 조
    var otherSes = db.t('Sessions').filter(function (x) { return !(x.round === round && x.groupKey === gk); })
      .concat((p.extraStarts || []).map(function (x) { return { date: normDate(x.date), startTime: normTime(x.startTime) }; })); // 계획 전체(아직 편성 전인 다른 부문 조 포함)
    info.forEach(function (a) {
      a.pm = a.st >= pm0;
      a.lastOfDay = !info.some(function (b) { return b.date === a.date && b.st > a.st; }) &&
        !otherSes.some(function (x) { return x.date === a.date && toMin(x.startTime) > a.st; });
    });
    // ① 지방 참가자(충청 이남 등): 오후 조(그날 마지막 조 제외) → 없으면 마지막 오후 조 → 그래도 없으면 늦은 오전 조
    var farOn = p.farAfternoon !== false && info.length > 1;
    var far = farOn ? cand.filter(function (q) { return isFar(cfg, q); }) : [];
    var farIds = {}; far.forEach(function (q) { farIds[q.id] = 1; });
    var tiers = [
      info.filter(function (a) { return a.pm && !a.lastOfDay; }),
      info.filter(function (a) { return a.pm && a.lastOfDay; }),
      info.filter(function (a) { return !a.pm; }).sort(function (a, b) { return b.st - a.st; })
    ];
    var farStat = { total: far.length, preferred: 0, lastSlot: 0, morning: 0 };
    far.forEach(function (q) {
      for (var t2 = 0; t2 < tiers.length; t2++) {
        var open = tiers[t2].filter(function (a) { return a.members.length < a.cap; });
        if (!open.length) continue;
        open.sort(function (a, b) { return a.members.length / a.cap - b.members.length / b.cap || a.st - b.st; }); // 고르게
        open[0].members.push(q);
        farStat[['preferred', 'lastSlot', 'morning'][t2]]++;
        return;
      }
    });
    // ② 나머지
    var rest2 = cand.filter(function (q) { return !farIds[q.id]; }), ri = 0;
    if (order === 'mix') {
      // 성씨별로 묶어 큰 묶음부터(묶음 안은 무작위) 한 명씩 — 그 성씨가 (정원 대비) 가장 적은 조, 같으면 빈자리가 많은 조, 그래도 같으면 무작위
      var bySur = {}; rest2.forEach(function (q) { var k = surnameOf(q.name); (bySur[k] = bySur[k] || []).push(q); });
      var packs = shuffle(Object.keys(bySur).map(function (k) { return bySur[k]; }));
      packs.sort(function (a, b) { return b.length - a.length; });
      packs.forEach(function (pk) {
        pk.forEach(function (q) {
          var sur = surnameOf(q.name), best = null, bk = null;
          info.forEach(function (a) {
            if (a.members.length >= a.cap) return;
            var same = a.members.filter(function (m) { return surnameOf(m.name) === sur; }).length;
            var key = [(same + 1) / a.cap, -(a.cap - a.members.length) / a.cap, Math.random()];
            if (!bk || key[0] < bk[0] - 1e-9 || (Math.abs(key[0] - bk[0]) < 1e-9 && (key[1] < bk[1] - 1e-9 || (Math.abs(key[1] - bk[1]) < 1e-9 && key[2] < bk[2])))) { best = a; bk = key; }
          });
          if (best) best.members.push(q);
        });
      });
    } else {
      info.slice().sort(function (a, b) { return cmpKo(a.date, b.date) || a.st - b.st; }).forEach(function (a) {
        while (a.members.length < a.cap && ri < rest2.length) a.members.push(rest2[ri++]);
      });
    }
    var sessions = [], entries = [], idx = 0;
    info.forEach(function (a) {
      var x = slots[a.i], i = a.i, sid = round + '-' + stamp + '-' + (i + 1);
      var dur = durMin(cfg, a.cap, a.per);
      sessions.push({
        sessionId: sid, round: round, groupKey: gk, no: String(i + 1), label: (i + 1) + '조',
        date: a.date, drawTime: fromMin(a.st - lead), startTime: fromMin(a.st), endTime: a.endTime || fromMin(a.st + dur),
        venue: s(x.venue) || s(p.venue) || cfg.venue, perSec: String(a.per), locked: ''
      });
      // 조 안 순번(출석부 순서): 신청 순이 아니면 가나다순
      var orderIx = {}; cand.forEach(function (q, k) { orderIx[q.id] = k; });
      a.members.sort(order === 'applied' ? function (m1, m2) { return orderIx[m1.id] - orderIx[m2.id]; } : byName).forEach(function (q) {
        idx++;
        entries.push({ entryId: round + '|' + q.id, round: round, pid: q.id, sessionId: sid, seq: String(idx), drawNo: '', attend: '', checkinAt: '', pass: '', note: '' });
      });
    });
    var oldSes = sessionsOf(db, round, gk).map(function (x) { return x.sessionId; });
    db.replaceWhere('Sessions', function (x) { return oldSes.indexOf(x.sessionId) >= 0; }, sessions);
    db.replaceWhere('Entries', function (e) { return e.round === round && oldIds[e.pid]; }, entries);
    // 같은 날 다른 부문과 겹치면 뒤로 밀어 맞춤 (인원이 늘었거나 같은 시각에 잡힌 경우) — 새로 편성한 부문이 같은 시각이면 뒤로
    var rt = p.retime === false ? { moved: [], skipped: [] } : retimeDates(db, round, sessions.map(function (x) { return x.date; }), { late: gk });
    db.log('admin', 'generateSessions', { round: round, group: gk, sessions: sessions.length, people: n, order: order, far: farStat, moved: rt.moved.length });
    return { sessions: sessions.length, people: n, order: order, far: farStat, moved: rt.moved };
  });

  function eligibleOf(db, round, gk) {
    if (round === 'R1') return db.t('Participants').filter(function (q) { return q.groupKey === gk && isActive(q) && isPaid(q); });
    var pass = {}; db.t('Entries').forEach(function (e) { if (e.round === 'R1' && e.pass === 'Y') pass[e.pid] = 1; });
    return db.t('Participants').filter(function (q) { return q.groupKey === gk && pass[q.id] && isActive(q); });
  }

  def('savePlan', 'admin', true, function (db, p) {
    var round = p.round === 'R2' ? 'R2' : 'R1';
    var rows = (p.days || []).map(function (d, i) {
      return { dayId: s(d.dayId) || (round + '-' + db.store.uid().slice(0, 8)), round: round, date: normDate(d.date), start: normTime(d.start), amEnd: normTime(d.amEnd), pmStart: normTime(d.pmStart),
        lunchMin: s(d.lunchMin), gap: s(d.gap), breaks: s(d.breaks), venue: s(d.venue), piano: s(d.piano), note: s(d.note), blocks: JSON.stringify(parseBlocks(d.blocks)),
        endBy: normTime(d.endBy), restEvery: s(d.restEvery), restMin: s(d.restMin) };
    });
    db.replaceWhere('Plan', function (x) { return x.round === round; }, rows);
    db.log('admin', 'savePlan', round + ' ' + rows.length + '일');
    return rows.length;
  });

  // 계획대로 조편성: 부문마다 계획의 조(날짜·시각·인원·1인 시간)를 그대로 써서 편성. 인원이 안 맞는 부문은 건너뜀
  def('applyPlan', 'admin', true, function (db, p) {
    var cfg = db.cfg(), round = p.round === 'R2' ? 'R2' : 'R1';
    var days = db.t('Plan').filter(function (x) { return x.round === round; }).map(function (x) { return Object.assign({}, x); });
    var only0 = p.groupKeys && p.groupKeys.length ? p.groupKeys : null, absorbed = {};
    // 계획과 대상이 1~2명(설정 planAbsorb) 다르면: 그 부문 마지막 날 블록 인원을 맞추고(조 크기를 정해 뒀으면 마지막 조에서 더하거나 빼기) 그날 시각을 다시 계산
    var tol = p.absorb === false ? 0 : (s(cfg.planAbsorb) !== '' ? +cfg.planAbsorb : 2);
    if (tol > 0) {
      var tot0 = planAll(cfg, days).totals, changed = {};
      Object.keys(tot0).forEach(function (gk) {
        if (only0 && only0.indexOf(gk) < 0) return;
        var diff = eligibleOf(db, round, gk).length - tot0[gk];
        if (!diff || Math.abs(diff) > tol) return;
        var ds = days.filter(function (d) { return parseBlocks(d.blocks).some(function (b) { return s(b.groupKey) === gk; }); }).sort(function (a, b) { return cmpKo(a.date + (a.start || ''), b.date + (b.start || '')); });
        var d = ds[ds.length - 1]; if (!d) return;
        var bl = parseBlocks(d.blocks), b = bl.filter(function (x) { return s(x.groupKey) === gk; }).pop(), nc = (+b.count || 0) + diff;
        if (nc <= 0) return;
        b.count = nc;
        var sz = s(b.sizes).split(/[^\d]+/).filter(Boolean).map(Number);
        if (sz.length) { sz[sz.length - 1] += diff; while (sz.length && sz[sz.length - 1] <= 0) { var r0 = sz.pop(); if (sz.length) sz[sz.length - 1] += r0; } b.sizes = sz.join(','); }
        d.blocks = JSON.stringify(bl); changed[d.dayId] = d; absorbed[gk] = diff;
      });
      var ch = Object.keys(changed).map(function (k) { return { dayId: k, blocks: changed[k].blocks }; });
      if (ch.length) db.upsert('Plan', ch);
    }
    var pa = planAll(cfg, days), byG = {};
    pa.days.forEach(function (r) {
      r.items.forEach(function (x) { if (x.type === 'session') (byG[x.groupKey] = byG[x.groupKey] || []).push({ date: r.day.date, startTime: x.start, endTime: x.end, count: x.n, perSec: x.perSec, venue: r.day.venue }); });
    });
    var only = p.groupKeys && p.groupKeys.length ? p.groupKeys : null, out = [];
    Object.keys(byG).forEach(function (gk) {
      if (only && only.indexOf(gk) < 0) return;
      var need = eligibleOf(db, round, gk).length, planned = pa.totals[gk];
      if (need !== planned) { out.push({ groupKey: gk, ok: false, msg: '대상 ' + need + '명인데 계획은 ' + planned + '명' }); return; }
      try {
        var extra = []; Object.keys(byG).forEach(function (g2) { if (g2 !== gk) byG[g2].forEach(function (x) { extra.push({ date: x.date, startTime: x.startTime }); }); });
        var r = A.generateSessions.run(db, { round: round, groupKey: gk, slots: byG[gk], farAfternoon: p.farAfternoon !== false, force: !!p.force, order: p.order, extraStarts: extra, retime: false });
        out.push({ groupKey: gk, ok: true, sessions: r.sessions, people: r.people, far: r.far, absorbed: absorbed[gk] || 0 });
      } catch (e) { out.push({ groupKey: gk, ok: false, msg: e.message }); }
      db.invalidate();
    });
    // 대상은 있는데 계획에 아예 없는 부문도 알려 줌 (조용히 빠지지 않게)
    if (!only) allGroupKeys(db).forEach(function (gk) {
      if (byG[gk]) return; var need = eligibleOf(db, round, gk).length;
      if (need) out.push({ groupKey: gk, ok: false, msg: '시간표 계획에 없어요 (대상 ' + need + '명)' });
    });
    // 마지막으로 계획 날짜마다 겹침 정리 (일부 부문만 다시 했거나 인원이 바뀐 경우)
    var rt = retimeDates(db, round, pa.days.map(function (r) { return r.day.date; }), {});
    if (rt.moved.length) out.push({ groupKey: '', ok: true, retimed: rt.moved });
    db.log('admin', 'applyPlan', round + ' ' + out.filter(function (x) { return x.ok && x.groupKey; }).length + '개 부문');
    return out;
  });

  // 시간 점검 → '이 날 시각 맞추기'
  def('retimeSessions', 'admin', true, function (db, p) {
    var round = p.round === 'R2' ? 'R2' : 'R1', d = normDate(p.date);
    if (!d) fail('날짜가 없어요.');
    var r = retimeDates(db, round, [d], { order: p.order || null, pack: !!p.pack, start: s(p.start), force: !!p.force });
    if (r.skipped.length) fail('이 날은 채점이 이미 시작돼서 시각을 자동으로 옮기지 않았어요. 조마다 시각을 직접 고쳐 주세요.');
    db.log('admin', 'retimeSessions', round + ' ' + d + ' ' + r.moved.length + '개 조');
    return r.moved;
  });

  def('saveSessions', 'admin', true, function (db, p) {
    var rows = (p.sessions || []).map(function (x) {
      var o = { sessionId: s(x.sessionId) };
      ['label', 'venue', 'locked', 'perSec'].forEach(function (k) { if (k in x) o[k] = s(x[k]); });
      if ('date' in x) o.date = normDate(x.date);
      if ('startTime' in x) o.startTime = normTime(x.startTime);
      return o;
    });
    db.upsert('Sessions', rows);
    recalcSessionEnd(db, db.cfg(), rows.map(function (r) { return r.sessionId; }));
    return true;
  });

  def('moveEntry', 'admin', true, function (db, p) {
    var e = db.t('Entries').filter(function (x) { return x.entryId === p.entryId; })[0];
    var to = db.t('Sessions').filter(function (x) { return x.sessionId === p.sessionId; })[0];
    if (!e || !to) fail('대상을 찾을 수 없습니다.');
    if (to.round !== e.round) fail('같은 라운드 안에서만 옮길 수 있습니다.');
    var from = e.sessionId;
    db.upsert('Entries', [{ entryId: e.entryId, sessionId: to.sessionId, drawNo: '' }]);
    recalcSessionEnd(db, db.cfg(), [from, to.sessionId]);
    db.log('admin', 'moveEntry', e.entryId + ' → ' + to.sessionId);
    return true;
  });

  /* 심사위원 명단(엑셀) 불러오기 — 화면(judgelist.js)이 읽어 준 줄을 사람·라운드·부문 단위로 묶어 저장
   * rows: [{ name, round:'R1'|'R2', division, targets:['초등부',…] (비면 부문 전체), date, shift:'종일'|'반나절', arrive, fee, affiliation, phone, note, seq }]
   * 같은 사람·라운드의 기존 줄은 PIN을 그대로 두고 갱신, 심사위원 인력(Staff)도 없으면 만들어 연결 */
  def('importJudges', 'admin', true, function (db, p) {
    var list = (p.rows || []).filter(function (r) { return s(r.name) && s(r.division) && /^R[12]$/.test(s(r.round)); });
    if (!list.length) fail('불러올 심사위원이 없습니다.');
    var by = {}, order = [];
    list.forEach(function (r) {
      var k = s(r.name) + '|' + r.round + '|' + s(r.division), J = by[k];
      if (!J) { J = by[k] = { name: s(r.name), round: r.round, division: s(r.division), all: false, targets: [], days: {}, seq: '', first: '', affiliation: '', phone: '', note: [] }; order.push(k); }
      var ts = (r.targets || []).map(s).filter(Boolean);
      if (!ts.length) J.all = true;
      ts.forEach(function (x) { x = normCategory(x); if (J.targets.indexOf(x) < 0) J.targets.push(x); });
      var d = normDate(r.date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        J.days[d] = { shift: s(r.shift), arrive: normTime(r.arrive), fee: s(r.fee).replace(/,/g, '') === '' ? '' : num(r.fee) };
        if (!J.first || d < J.first) { J.first = d; J.seq = s(r.seq); }
      }
      if (!J.affiliation && s(r.affiliation)) J.affiliation = s(r.affiliation);
      if (!J.phone && s(r.phone)) J.phone = s(r.phone);
      if (s(r.note) && J.note.indexOf(s(r.note)) < 0) J.note.push(s(r.note));
    });
    var cur = db.t('Judges'), staff = db.t('Staff'), used = {}, touched = {}, staffNew = [], staffUpd = [], rows = [], ppl = {};
    var out = { added: 0, updated: 0, removed: 0, kept: 0, staffAdded: 0, people: 0 };
    cur.forEach(function (j) { if (j.pin) used[j.pin] = 1; });
    function newPin() { for (var i = 0; i < 500; i++) { var x = String(100000 + Math.floor(Math.random() * 900000)); if (!used[x]) { used[x] = 1; return x; } } fail('PIN을 만들지 못했습니다.'); }
    function findStaff(J) {
      var ph = digits(J.phone).slice(-8);
      var c = staff.concat(staffNew).filter(function (x) { return x.kind === 'judge' && x.name === J.name; });
      return c.filter(function (x) { return ph && digits(x.phone).slice(-8) === ph; })[0]
        || c.filter(function (x) { return !ph || !digits(x.phone) || (J.affiliation && x.affiliation === J.affiliation); })[0] || null;
    }
    order.forEach(function (k) {
      var J = by[k], dates = Object.keys(J.days).sort();
      var groups = J.all ? J.division : J.targets.map(function (x) { return J.division + '|' + x; }).join(', ');
      var ex = cur.filter(function (j) { return !touched[j.judgeId] && j.name === J.name && j.round === J.round && (!s(j.groups) || s(j.groups) === '전체' || s(j.groups).split(/[|,\s]/)[0] === J.division); })[0];
      var st = findStaff(J);
      if (!st) { st = { staffId: 'S' + db.store.uid().slice(0, 10), kind: 'judge', name: J.name, affiliation: J.affiliation, phone: J.phone, token: db.store.uid() + db.store.uid(), status: '초대', updatedAt: db.store.now() }; staffNew.push(st); out.staffAdded++; }
      else if ((!s(st.phone) && J.phone) || (!s(st.affiliation) && J.affiliation)) {
        var u = { staffId: st.staffId }; if (!s(st.phone) && J.phone) u.phone = st.phone = J.phone; if (!s(st.affiliation) && J.affiliation) u.affiliation = st.affiliation = J.affiliation; staffUpd.push(u);
      }
      ppl[st.staffId] = 1;
      var o = { judgeId: ex ? ex.judgeId : 'J' + db.store.uid().slice(0, 8), name: J.name, affiliation: J.affiliation || (ex && ex.affiliation) || '', round: J.round, groups: groups,
        seat: J.seq || (ex && ex.seat) || '', staffId: st.staffId, dates: dates.join(','), dayInfo: dayInfoStr(J.days), phone: J.phone, note: J.note.join(' / '), pin: ex && ex.pin ? ex.pin : newPin() };
      if (ex) { touched[ex.judgeId] = 1; out.updated++; } else out.added++;
      rows.push(o);
    });
    if (p.removeMissing) {
      var rounds = {}; rows.forEach(function (o) { rounds[o.round] = 1; });
      var scored = {}; db.t('Scores').forEach(function (x) { scored[x.judgeId] = 1; });
      var gone = cur.filter(function (j) { return rounds[j.round] && !touched[j.judgeId]; });
      var del = gone.filter(function (j) { return !scored[j.judgeId]; }).map(function (j) { return j.judgeId; });
      out.kept = gone.length - del.length; out.removed = del.length;
      if (del.length) db.replaceWhere('Judges', function (j) { return del.indexOf(j.judgeId) >= 0; }, []);
    }
    if (staffNew.length || staffUpd.length) db.upsert('Staff', staffNew.concat(staffUpd));
    db.upsert('Judges', rows);
    if (s(p.rates)) db.upsert('Config', [{ key: 'judgeRates', value: s(p.rates) }]);
    out.people = Object.keys(ppl).length;
    db.log('admin', 'importJudges', out);
    return out;
  });

  def('saveJudges', 'admin', true, function (db, p) {
    var rows = (p.judges || []).map(function (j) {
      var o = { judgeId: s(j.judgeId) || ('J' + db.store.uid().slice(0, 8)), name: s(j.name), affiliation: s(j.affiliation), pin: s(j.pin), round: s(j.round) || 'R1', groups: s(j.groups), seat: s(j.seat) };
      if ('staffId' in j) o.staffId = s(j.staffId);
      if ('dates' in j) o.dates = splitList(j.dates).map(normDate).filter(Boolean).join(',');
      ['phone', 'dayInfo', 'note'].forEach(function (k) { if (k in j) o[k] = s(j[k]); });
      return o;
    });
    var pins = {};
    db.t('Judges').concat(rows).forEach(function (j) { if (j.pin) pins[j.pin] = (pins[j.pin] || {}); if (j.pin) pins[j.pin][j.judgeId] = 1; });
    Object.keys(pins).forEach(function (k) { if (Object.keys(pins[k]).length > 1) fail('PIN ' + k + '가 두 명 이상에게 겹칩니다. 심사위원마다 다른 PIN을 써 주세요.'); });
    if (p.removeIds && p.removeIds.length) db.replaceWhere('Judges', function (j) { return p.removeIds.indexOf(j.judgeId) >= 0; }, []);
    db.upsert('Judges', rows);
    db.log('admin', 'saveJudges', rows.length + '명');
    return true;
  });

  def('setCutline', 'admin', true, function (db, p) {
    var gk = s(p.groupKey), cut = s(p.cutline);
    var g = computeGroup(db, 'R1', gk);
    var upd = g.rows.map(function (r) {
      var ok = !r.absent && r.scored > 0 && cut !== '' && (g.mode === 'rank' ? r.score <= +cut : r.score >= +cut);
      return { entryId: r.entryId, pass: cut === '' ? '' : (ok ? 'Y' : 'N') };
    });
    db.upsert('Entries', upd);
    db.upsert('Groups', [{ groupKey: gk, r1Cutline: cut }]);
    db.log('admin', 'setCutline', gk + ' ≥ ' + cut);
    return upd.filter(function (u) { return u.pass === 'Y'; }).length;
  });

  def('setPass', 'admin', true, function (db, p) {
    db.upsert('Entries', [{ entryId: s(p.entryId), pass: s(p.pass) }]);
    db.log('admin', 'setPass', p.entryId + '=' + p.pass);
    return true;
  });

  def('setAward', 'admin', true, function (db, p) {
    db.upsert('Entries', [{ entryId: s(p.entryId), award: s(p.award) }]);
    db.log('admin', 'setAward', p.entryId + '=' + p.award);
    return true;
  });

  def('unlockSubmission', 'admin', true, function (db, p) {
    db.replaceWhere('Submissions', function (x) { return x.sessionId === p.sessionId && x.judgeId === p.judgeId; }, []);
    db.log('admin', 'unlockSubmission', p.sessionId + '/' + p.judgeId);
    return true;
  });

  def('adminScore', 'admin', true, function (db, p) {
    // 종이 채점표로 받은 점수를 관리자가 대신 입력할 때
    var e = db.t('Entries').filter(function (x) { return x.round === p.round && x.pid === p.pid; })[0];
    if (!e) fail('대상을 찾을 수 없습니다.');
    var v = s(p.value);
    db.upsert('Scores', [{ scoreId: p.round + '|' + p.pid + '|' + p.judgeId, round: p.round, pid: p.pid, sessionId: e.sessionId, judgeId: p.judgeId, value: v, comment: s(p.comment), updatedAt: db.store.now() + ' (관리자)' }]);
    return true;
  });

  // ── 현장(진행요원) ──
  def('deskHome', 'desk', false, function (db) {
    var cnt = {}, att = {}, drw = {};
    db.t('Entries').forEach(function (e) {
      cnt[e.sessionId] = (cnt[e.sessionId] || 0) + 1;
      if (e.attend === 'Y') att[e.sessionId] = (att[e.sessionId] || 0) + 1;
      if (s(e.drawNo)) drw[e.sessionId] = (drw[e.sessionId] || 0) + 1;
    });
    var cfg = db.cfg();
    return {
      title: cfg.title, brand: brandOf(cfg),
      sessions: db.t('Sessions').map(function (x) {
        return { sessionId: x.sessionId, round: x.round, roundName: roundCfg(cfg, x.round).name, groupKey: x.groupKey, groupLabel: groupLabel(x.groupKey), label: x.label, date: x.date, drawTime: x.drawTime, startTime: x.startTime, endTime: x.endTime, venue: x.venue, count: cnt[x.sessionId] || 0, attended: att[x.sessionId] || 0, drawn: drw[x.sessionId] || 0 };
      }).sort(function (a, b) { return cmpKo(a.date + a.startTime, b.date + b.startTime); })
    };
  });

  // 라운드별 곡목 수정 기록 (참가자마다 최근 것부터)
  function pieceHistory(db, round) {
    var out = {};
    db.t('History').filter(function (h) { return h.field === 'pieces' && h.round === round; }).forEach(function (h, i) { (out[h.pid] = out[h.pid] || []).push({ time: h.time, actor: h.actor, before: h.before, after: h.after, note: h.note, _i: i }); });
    Object.keys(out).forEach(function (k) { out[k].sort(function (a, b) { return cmpKo(b.time, a.time) || b._i - a._i; }); out[k].forEach(function (x) { delete x._i; }); });
    return out;
  }
  def('deskSession', 'desk', false, function (db, p) {
    var x = db.t('Sessions').filter(function (q) { return q.sessionId === p.sessionId; })[0];
    if (!x) fail('조 정보를 찾을 수 없습니다.');
    var pm = db.pmap(), po = perfOrders(db, x.round, x.groupKey), cfg = db.cfg(), ph = pieceHistory(db, x.round);
    var list = db.t('Entries').filter(function (e) { return e.sessionId === x.sessionId; }).map(function (e) {
      var q = pm[e.pid] || {};
      return { entryId: e.entryId, pid: e.pid, name: q.name, birth: q.birth, school: q.school, grade: q.grade, phone4: digits(q.phone).slice(-4), guardian: q.guardianName, seq: +e.seq, drawNo: s(e.drawNo), perfOrder: po[e.entryId], attend: s(e.attend), checkinAt: s(e.checkinAt), pieces: piecesFor(q, x.round), pieceLog: ph[e.pid] || [] };
    }).sort(function (a, b) { return a.seq - b.seq; });
    return { session: sessionView(x), round: x.round, roundName: roundCfg(cfg, x.round).name, groupKey: x.groupKey, groupLabel: groupLabel(x.groupKey), title: cfg.title, list: list, current: s(x.current), offset: sessionOffsets(db, x.round, x.groupKey)[x.sessionId] || 0 };
  });

  // 현장에서 곡목 바로 고치기 (진행요원·관리자) — 바뀌기 전·후와 누가·왜를 수정 기록에 남김
  def('setPieces', 'desk', true, function (db, p, auth) {
    var q = db.pmap()[s(p.pid)]; if (!q) fail('참가자를 찾을 수 없습니다.');
    var round = p.round === 'R2' ? 'R2' : 'R1';
    var by = s(p.by).slice(0, 20) || (auth && auth.role === 'admin' ? s(db.who) || '관리자' : '');
    if (!by) fail('수정한 사람 이름을 적어 주세요. (수정 기록에 남아요)');
    var before = piecesFor(q, round);
    var incoming = (Array.isArray(p.pieces) ? p.pieces : []).slice(0, 6).map(function (x) {
      return { round: round, kind: s(x.kind).slice(0, 30), country: s(x.country).slice(0, 30), composer: s(x.composer).slice(0, 80), title: s(x.title).slice(0, 200) };
    }).filter(function (x) { return x.title || x.composer; });
    if (incoming.some(function (x) { return !x.title; })) fail('곡명이 비어 있는 줄이 있어요.');
    if (piecesText(before) === piecesText(incoming)) return { pieces: before, changed: false };
    var others = parsePieces(q.pieces).filter(function (x) { return x.round !== round && x.round; });
    db.upsert('Participants', [{ id: q.id, pieces: normPieces(round === 'R1' ? incoming.concat(others) : others.concat(incoming)) }]);
    var kind = pieceChangeKind(before, incoming), note = [kind, s(p.note).slice(0, 150)].filter(Boolean).join(' · ');
    var actor = auth && auth.role === 'admin' ? (s(db.who) || '관리자') + (s(p.by) && s(p.by) !== s(db.who) ? '(' + s(p.by) + ')' : '') : '현장 ' + by;
    addHistory(db, actor, q.id, [{ field: 'pieces', round: round, before: piecesText(before), after: piecesText(incoming), note: note }]);
    db.log(auth && auth.role === 'admin' ? 'admin' : 'desk:' + by, 'setPieces', q.id + ' ' + round + ' 곡목 ' + (kind || '수정'));
    db.invalidate();
    return { pieces: piecesFor(db.pmap()[q.id], round), changed: true, kind: kind };
  });

  def('checkin', 'desk', true, function (db, p) {
    var code = s(p.code).replace(/^KC:/i, '').toUpperCase();
    var pm = db.pmap(), q = null;
    if (code) q = db.t('Participants').filter(function (x) { return s(x.token).toUpperCase() === code || s(x.id).toUpperCase() === code; })[0];
    if (!q && p.pid) q = pm[p.pid];
    if (!q) fail('접수증 정보를 찾을 수 없습니다. 이름으로 검색해 보세요.');
    var round = s(p.round) || 'R1';
    var e = db.t('Entries').filter(function (x) { return x.round === round && x.pid === q.id; })[0];
    if (!e) fail(q.name + ' 참가자는 이 라운드 편성 명단에 없습니다.');
    var warn = '';
    if (p.sessionId && e.sessionId !== p.sessionId) {
      var real = db.t('Sessions').filter(function (x) { return x.sessionId === e.sessionId; })[0];
      warn = '다른 조 참가자입니다: ' + (real ? (real.date + ' ' + real.startTime + ' ' + groupLabel(real.groupKey) + ' ' + real.label) : '');
      if (!p.force) return { warn: warn, participant: { pid: q.id, name: q.name, school: q.school, birth: q.birth }, entryId: e.entryId, checkedIn: false };
    }
    var upd = { entryId: e.entryId, attend: 'Y', checkinAt: db.store.now() };
    if (p.drawNo != null && s(p.drawNo) !== '') {
      var dn = String(+p.drawNo);
      var dup = db.t('Entries').filter(function (x) { return x.sessionId === e.sessionId && x.entryId !== e.entryId && s(x.drawNo) === dn; })[0];
      if (dup) fail('추첨번호 ' + dn + '번은 이미 ' + (pm[dup.pid] || {}).name + ' 참가자에게 들어가 있습니다.');
      upd.drawNo = dn;
    }
    db.upsert('Entries', [upd]);
    return { checkedIn: true, warn: warn, entryId: e.entryId, participant: { pid: q.id, name: q.name, school: q.school, grade: q.grade, birth: q.birth }, drawNo: upd.drawNo || s(e.drawNo) };
  });

  def('setEntry', 'desk', true, function (db, p) {
    var e = db.t('Entries').filter(function (x) { return x.entryId === p.entryId; })[0];
    if (!e) fail('대상을 찾을 수 없습니다.');
    var upd = { entryId: e.entryId };
    if ('attend' in p) { upd.attend = s(p.attend); if (upd.attend === 'Y' && !s(e.checkinAt)) upd.checkinAt = db.store.now(); }
    if ('drawNo' in p) {
      var dn = s(p.drawNo) === '' ? '' : String(+p.drawNo);
      if (dn && !(+dn > 0)) fail('추첨번호는 1 이상의 숫자로 넣어 주세요.');
      if (dn) {
        var pm = db.pmap();
        var dup = db.t('Entries').filter(function (x) { return x.sessionId === e.sessionId && x.entryId !== e.entryId && s(x.drawNo) === dn; })[0];
        if (dup) fail('추첨번호 ' + dn + '번은 이미 ' + (pm[dup.pid] || {}).name + ' 참가자에게 들어가 있습니다.');
      }
      upd.drawNo = dn;
    }
    db.upsert('Entries', [upd]);
    return true;
  });

  def('autoDraw', 'desk', true, function (db, p) {
    var list = db.t('Entries').filter(function (x) { return x.sessionId === p.sessionId; });
    var used = {}; list.forEach(function (e) { if (s(e.drawNo)) used[+e.drawNo] = 1; });
    var free = []; for (var i = 1; i <= list.length; i++) if (!used[i]) free.push(i);
    for (var k = free.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)); var t = free[k]; free[k] = free[j]; free[j] = t; }
    var upd = [];
    list.filter(function (e) { return !s(e.drawNo); }).forEach(function (e, idx) { upd.push({ entryId: e.entryId, drawNo: String(free[idx]) }); });
    db.upsert('Entries', upd);
    db.log('desk', 'autoDraw', p.sessionId + ' ' + upd.length + '명');
    return upd.length;
  });

  // 추첨번호 한꺼번에 입력 (관리자) — 종이 출석부에 적어 둔 번호를 옮겨 적고 연주순서를 정함
  //  rows: [{ entryId, drawNo, absent }] · 번호는 1~조 인원, 조 안에서 겹치면 안 됨 · 번호가 있으면 출석, 불참이면 번호 비움
  def('saveDraws', 'admin', true, function (db, p) {
    var sid = s(p.sessionId), list = db.t('Entries').filter(function (x) { return x.sessionId === sid; });
    if (!list.length) fail('조를 찾을 수 없습니다.');
    var pm = db.pmap(), n = list.length, by = {}, fin = {}, upd = [], now = db.store.now();
    list.forEach(function (e) { by[e.entryId] = e; fin[e.entryId] = { drawNo: s(e.drawNo), attend: s(e.attend) }; });
    (p.rows || []).forEach(function (r) {
      var e = by[s(r.entryId)]; if (!e) return;
      var nm = (pm[e.pid] || {}).name || '', raw = s(r.drawNo), dn = '';
      if (raw !== '') { var v = +raw; if (!(v >= 1 && v <= n && Math.floor(v) === v)) fail(nm + ': 추첨번호는 1~' + n + ' 사이 숫자로 넣어 주세요.'); dn = String(v); }
      var at = s(e.attend);
      if (r.absent) { at = 'N'; dn = ''; } else if (dn) at = 'Y'; else if (at === 'N') at = '';
      fin[e.entryId] = { drawNo: dn, attend: at };
      var o = { entryId: e.entryId, drawNo: dn, attend: at };
      if (at === 'Y' && !s(e.checkinAt)) o.checkinAt = now;
      if (dn !== s(e.drawNo) || at !== s(e.attend)) upd.push(o);
    });
    var seen = {};
    Object.keys(fin).forEach(function (id) {
      var dn = fin[id].drawNo; if (!dn) return;
      var nm = (pm[by[id].pid] || {}).name || '';
      if (seen[dn]) fail('추첨번호 ' + dn + '번이 ' + seen[dn] + ', ' + nm + ' 두 사람에게 들어갔어요.');
      seen[dn] = nm;
    });
    if (upd.length) db.upsert('Entries', upd);
    var drawn = Object.keys(seen).length, absent = Object.keys(fin).filter(function (id) { return fin[id].attend === 'N'; }).length;
    db.log('admin', 'saveDraws', sid + ' ' + upd.length + '줄');
    return { saved: upd.length, drawn: drawn, absent: absent, left: n - drawn - absent };
  });

  // 무대 진행: 지금 연주 중인 연주자 표시 → 순서판·심사위원 화면에 함께 보임
  def('setCurrent', 'desk', true, function (db, p) {
    var x = db.t('Sessions').filter(function (q) { return q.sessionId === p.sessionId; })[0];
    if (!x) fail('조 정보를 찾을 수 없습니다.');
    var eid = s(p.entryId);
    if (eid && !db.t('Entries').some(function (e) { return e.entryId === eid && e.sessionId === x.sessionId; })) fail('이 조의 연주자가 아닙니다.');
    db.upsert('Sessions', [{ sessionId: x.sessionId, current: eid }]);
    return true;
  });

  // ── 심사위원 ──
  def('judgeHome', 'judge', false, function (db, p, auth) {
    var j = judgeOf(db, auth), cfg = db.cfg(), rc = roundCfg(cfg, j.round);
    var subs = {}; db.t('Submissions').forEach(function (x) { if (x.judgeId === j.judgeId) subs[x.sessionId] = x.submittedAt; });
    var mine = {}; db.t('Scores').forEach(function (x) { if (x.judgeId === j.judgeId && s(x.value) !== '') mine[x.sessionId] = (mine[x.sessionId] || 0) + 1; });
    var cnt = {}, abs = {}; db.t('Entries').forEach(function (e) { cnt[e.sessionId] = (cnt[e.sessionId] || 0) + 1; if (e.attend === 'N') abs[e.sessionId] = (abs[e.sessionId] || 0) + 1; });
    var ses = db.t('Sessions').filter(function (x) { return judgeCanSee(db, j, x); }).map(function (x) {
      return { sessionId: x.sessionId, groupLabel: groupLabel(x.groupKey), label: x.label, date: x.date, startTime: x.startTime, endTime: x.endTime, venue: x.venue, count: cnt[x.sessionId] || 0, absent: abs[x.sessionId] || 0, mine: mine[x.sessionId] || 0, submittedAt: subs[x.sessionId] || '', locked: x.locked === 'Y' };
    }).sort(function (a, b) { return cmpKo(a.date + a.startTime, b.date + b.startTime); });
    return { judge: { name: j.name, round: j.round, roundName: rc.name }, mode: rc.mode, max: rc.max, title: cfg.title, brand: brandOf(cfg), sessions: ses };
  });

  def('judgeSheet', 'judge', false, function (db, p, auth) {
    var j = judgeOf(db, auth), cfg = db.cfg(), rc = roundCfg(cfg, j.round);
    var x = db.t('Sessions').filter(function (q) { return q.sessionId === p.sessionId; })[0];
    if (!x || !judgeCanSee(db, j, x)) fail('이 조의 채점 권한이 없습니다.');
    var po = perfOrders(db, x.round, x.groupKey), pm = db.pmap();
    var mine = {}; db.t('Scores').forEach(function (q) { if (q.judgeId === j.judgeId && q.round === x.round) mine[q.pid] = q; });
    var showNames = cfg.showNamesToJudges === 'Y', showPieces = cfg.showPiecesToJudges !== 'N', phj = showPieces ? pieceHistory(db, x.round) : {};
    var list = db.t('Entries').filter(function (e) { return e.sessionId === x.sessionId; }).map(function (e) {
      var q = pm[e.pid] || {}, m = mine[e.pid];
      return { pid: e.pid, seq: +e.seq, perfOrder: po[e.entryId], drawNo: s(e.drawNo), absent: e.attend === 'N', value: m ? s(m.value) : '', comment: m ? s(m.comment) : '', name: showNames ? q.name : '', pieces: showPieces ? piecesFor(q, x.round) : [], piecesChanged: !!(phj[e.pid] && phj[e.pid].length) };
    }).sort(function (a, b) {
      var pa = a.perfOrder == null ? 9999 + a.seq : a.perfOrder, pb = b.perfOrder == null ? 9999 + b.seq : b.perfOrder;
      return pa - pb;
    });
    var sub = db.t('Submissions').filter(function (q) { return q.sessionId === x.sessionId && q.judgeId === j.judgeId; })[0];
    var cur = db.t('Entries').filter(function (e) { return e.entryId === s(x.current); })[0];
    return { session: sessionView(x), groupLabel: groupLabel(x.groupKey), roundName: rc.name, mode: rc.mode, max: rc.max, list: list, submittedAt: sub ? sub.submittedAt : '', locked: x.locked === 'Y', judgeName: j.name, currentPid: cur ? cur.pid : '' };
  });

  def('score', 'judge', true, function (db, p, auth) {
    var j = judgeOf(db, auth), rc = roundCfg(db.cfg(), j.round);
    var x = db.t('Sessions').filter(function (q) { return q.sessionId === p.sessionId; })[0];
    if (!x || !judgeCanSee(db, j, x)) fail('이 조의 채점 권한이 없습니다.');
    if (x.locked === 'Y') fail('이 조는 채점이 마감되었습니다.');
    if (db.t('Submissions').some(function (q) { return q.sessionId === x.sessionId && q.judgeId === j.judgeId; })) fail('이미 제출한 채점표입니다. 수정이 필요하면 사무국에 요청해 주세요.');
    var e = db.t('Entries').filter(function (q) { return q.sessionId === x.sessionId && q.pid === p.pid; })[0];
    if (!e) fail('이 조의 참가자가 아닙니다.');
    var v = s(p.value);
    if (v !== '') {
      var n = +v;
      if (rc.mode === 'ox' && !(n === 0 || n === 1)) fail('O 또는 X만 입력할 수 있습니다.');
      if (rc.mode === 'rank' && !(n >= 1 && n <= rc.max && Math.floor(n) === n)) fail('1~' + rc.max + ' 사이 등위만 입력할 수 있습니다.');
      if (rc.mode === 'score' && !(n >= 0 && n <= rc.max)) fail('0~' + rc.max + ' 사이 점수만 입력할 수 있습니다.');
    }
    var row = { scoreId: x.round + '|' + p.pid + '|' + j.judgeId, round: x.round, pid: p.pid, sessionId: x.sessionId, judgeId: j.judgeId, value: v, updatedAt: db.store.now() };
    if ('comment' in p) row.comment = s(p.comment);
    db.upsert('Scores', [row]);
    return { saved: true, at: row.updatedAt };
  });

  def('submitSheet', 'judge', true, function (db, p, auth) {
    var j = judgeOf(db, auth);
    var x = db.t('Sessions').filter(function (q) { return q.sessionId === p.sessionId; })[0];
    if (!x || !judgeCanSee(db, j, x)) fail('이 조의 채점 권한이 없습니다.');
    var ent = db.t('Entries').filter(function (e) { return e.sessionId === x.sessionId && e.attend !== 'N'; });
    var mine = {}; db.t('Scores').forEach(function (q) { if (q.judgeId === j.judgeId && s(q.value) !== '') mine[q.pid] = 1; });
    var missing = ent.filter(function (e) { return !mine[e.pid]; }).length;
    if (missing) fail('아직 채점하지 않은 연주자가 ' + missing + '명 있습니다. (불참 처리된 연주자는 제외)');
    db.upsert('Submissions', [{ subId: x.sessionId + '|' + j.judgeId, sessionId: x.sessionId, judgeId: j.judgeId, submittedAt: db.store.now() }]);
    db.log(j.name, 'submitSheet', x.sessionId);
    return true;
  });

  /* =====================================================================
   * 인력(심사위원·진행요원) · 상금 · 공결공문 · 발급대장
   * ===================================================================== */
  function num(v) { var n = +String(v == null ? '' : v).replace(/[^\d.-]/g, ''); return isFinite(n) ? n : 0; }
  function floor10(n) { return Math.floor(n / 10) * 10; }
  function ceil10(n) { return Math.ceil(Math.round(n * 100) / 100 / 10) * 10; }

  /* 원천징수 (기타소득) — 상금: 필요경비 80%(4.4%), 심사비(일시적 인적용역): 60%(8.8%)
   * 기타소득금액(지급액-필요경비)이 과세최저한(5만원) 이하면 세금 없음. 소득세·지방소득세 10원 미만 버림 */
  function withholding(amount, kind, cfg) {
    cfg = cfg || DEFAULT_CONFIG;
    amount = Math.round(num(amount));
    var rate = num(kind === 'prize' ? cfg.taxPrizeExpense : cfg.taxJudgeExpense) / 100;
    var expense = Math.round(amount * rate), income = amount - expense;
    var tax = 0, local = 0;
    if (income > num(cfg.taxMinIncome)) {
      tax = floor10(income * num(cfg.taxRate) / 100);
      local = floor10(tax * num(cfg.localTaxRate) / 100);
    }
    return { amount: amount, expense: expense, income: income, tax: tax, local: local, net: amount - tax - local };
  }

  /* 상금: Groups.prizes 또는 Config.prizeDefault '1위=1000000,2위=500000' */
  function prizeTable(text) {
    var o = {};
    s(text).split(/[,\n]/).forEach(function (x) { var m = /(\d+)\s*위\s*[=:]\s*([\d,]+)/.exec(x); if (m) o[+m[1]] = num(m[2]); });
    return o;
  }
  function prizeAmount(cfg, group, award) {
    var m = /(\d+)\s*위/.exec(s(award));
    if (!m) return 0;
    var t = prizeTable(group && group.prizes);
    if (!Object.keys(t).length) t = prizeTable(cfg.prizeDefault);
    return t[+m[1]] || 0;
  }

  /* 근로시간 — 실제(start/end)가 있으면 실제, 없으면 예정. 휴게: 지정값 → 8시간 이상 기본값(60) → 4시간 이상 30분 */
  function workMinutes(w, cfg, planned) {
    var a = toMin(planned ? w.planStart : (s(w.start) || w.planStart)), b = toMin(planned ? w.planEnd : (s(w.end) || w.planEnd));
    if (a == null || b == null || b <= a) return { span: 0, rest: 0, work: 0 };
    var span = b - a, rest;
    if (s(w.breakMin) !== '') rest = num(w.breakMin);
    else rest = span >= 8 * 60 + 30 ? num((cfg || DEFAULT_CONFIG).defaultBreakMin || 60) : span >= 4 * 60 + 30 ? 30 : 0;
    return { span: span, rest: rest, work: Math.max(0, span - rest) };
  }
  function weekKey(date) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(date); if (!m) return date;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), wd = (d.getUTCDay() + 6) % 7; // 월요일 시작
    d.setUTCDate(d.getUTCDate() - wd);
    return d.toISOString().slice(0, 10);
  }
  /* 인건비 — 74회 인사팀 확인 방식: 주 15시간 이상 일한 주는 주휴(그 주 근로시간×8/40, 10분 단위 올림)
   * 주휴는 그 주 마지막 근무일이 속한 달에 붙이고, 금액은 10원 단위 올림 */
  function staffPay(rows, cfg, wage) {
    cfg = cfg || DEFAULT_CONFIG; wage = num(wage || cfg.hourlyWage);
    var weeks = {}, months = {};
    rows.filter(function (w) { return s(w.date); }).sort(function (a, b) { return cmpKo(a.date, b.date); }).forEach(function (w) {
      var mins = workMinutes(w, cfg).work, mk = w.date.slice(0, 7), wk = weekKey(w.date);
      if (!mins) return;
      var M = months[mk] = months[mk] || { month: mk, days: 0, minutes: 0, holiday: 0 };
      M.days++; M.minutes += mins;
      var W = weeks[wk] = weeks[wk] || { minutes: 0, last: w.date };
      W.minutes += mins; if (w.date > W.last) W.last = w.date;
    });
    Object.keys(weeks).forEach(function (k) {
      var W = weeks[k];
      if (W.minutes >= 15 * 60) {
        var h = Math.ceil(W.minutes * 8 / 40 / 10 - 1e-9) * 10;
        var M = months[W.last.slice(0, 7)]; if (M) M.holiday += h;
      }
    });
    return Object.keys(months).sort().map(function (k) {
      var M = months[k];
      M.wage = wage;
      M.pay = ceil10((M.minutes + M.holiday) / 60 * wage);
      return M;
    });
  }

  /* 신분증·통장 사본 글자(OCR) → 칸 채우기 후보. 확인은 본인이 화면에서 */
  var BANKS = [[/카카오\s*뱅크|kakao\s*bank/i, '카카오뱅크'], [/토스\s*뱅크/i, '토스뱅크'], [/케이\s*뱅크|K\s*bank/i, '케이뱅크'], [/KB|국민은행|국민/, '국민'], [/신한/, '신한'], [/우리은행|우리/, '우리'],
    [/하나/, '하나'], [/NH|농협/, '농협'], [/IBK|기업은행/, '기업'], [/SC\s*제일|제일은행/, 'SC제일'], [/씨티/, '씨티'], [/새마을/, '새마을금고'], [/신협/, '신협'], [/우체국/, '우체국'],
    [/수협/, '수협'], [/iM\s*뱅크|대구은행/, 'iM뱅크'], [/부산은행/, '부산'], [/경남은행/, '경남'], [/광주은행/, '광주'], [/전북은행/, '전북'], [/제주은행/, '제주'], [/산업은행/, '산업']];
  function parseIdText(t) {
    t = s(t).replace(/\r/g, '');
    var out = {}, m = /(\d{6})\s*[-–—~]\s*([1-8]\d{6})/.exec(t);
    if (m) { out.rrn = m[1] + '-' + m[2]; out.birth = m[1]; }
    var lines = t.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].replace(/\(.*?\)/g, '').trim();
      if (/주민등록증|운전면허증|대한민국|REPUBLIC|여권|PASSPORT|Driver/i.test(ln)) continue;
      var nm = ln.replace(/\s+/g, '');
      if (/^[가-힣]{2,5}$/.test(nm) && !/특별시|광역시|도청|경찰청|구청장|시장|군수/.test(nm)) { out.name = nm; break; }
    }
    var ai = lines.findIndex ? lines.findIndex(function (x) { return /(시|도)\s+\S+(구|시|군)/.test(x) && !/청장|시장|군수/.test(x); }) : -1;
    if (ai >= 0) {
      var addr = [lines[ai]];
      if (lines[ai + 1] && !/\d{4}\.\s*\d{1,2}\.|청장|시장|군수|구청장/.test(lines[ai + 1])) addr.push(lines[ai + 1]);
      out.address = addr.join(' ').replace(/\s+/g, ' ');
    }
    return out;
  }
  function parseBankText(t) {
    t = s(t).replace(/\r/g, '');
    var out = {}, i;
    for (i = 0; i < BANKS.length; i++) if (BANKS[i][0].test(t)) { out.bank = BANKS[i][1]; break; }
    var lab = /(계좌\s*번호|계좌|Account\s*No\.?|고객번호)\s*[:：]?\s*([\d][\d\s-]{8,22}\d)/i.exec(t);
    var cand = lab ? lab[2] : null;
    if (!cand) {
      var all = t.match(/\d[\d-]{8,20}\d/g) || [];
      all = all.filter(function (x) { var d = digits(x); return d.length >= 10 && d.length <= 16 && !/^\d{6}-?[1-8]\d{6}$/.test(x) && !/^(19|20)\d{2}-?\d{2}-?\d{2}$/.test(x) && !/^0\d{1,2}-\d{3,4}-\d{4}$/.test(x); });
      all.sort(function (a, b) { return (b.indexOf('-') >= 0) - (a.indexOf('-') >= 0) || digits(b).length - digits(a).length; });
      cand = all[0];
    }
    if (cand) out.account = cand.replace(/\s+/g, '');
    var hm = /(예금주|성\s*명|고객명|명\s*의)\s*[:：]?\s*([가-힣]{2,5})/.exec(t);
    if (hm) out.holder = hm[2];
    return out;
  }

  function staffByToken(db, p) {
    var t = s(p.t);
    if (t.length < 12) fail('링크가 올바르지 않습니다. 사무국에서 받은 주소를 그대로 열어 주세요.');
    var st = db.t('Staff').filter(function (x) { return x.token === t; })[0];
    if (!st || /삭제/.test(st.status)) fail('등록 정보를 찾을 수 없습니다. 사무국에 문의해 주세요.');
    var ph = digits(st.phone).slice(-4);
    if (ph && digits(p.phone4).slice(-4) !== ph) fail('휴대폰 뒷 4자리가 맞지 않습니다.');
    return st;
  }

  /* 심사위원 한 사람이 맡은 라운드·부문·날짜 (Judges 여러 줄을 사람 기준으로 묶음) */
  function judgeDatesOf(db, j) {
    var ds = splitList(j.dates).map(normDate).filter(Boolean);
    if (ds.length) return ds;
    var seen = {};
    db.t('Sessions').forEach(function (x) { if (x.round === j.round && judgeCovers(j, x.groupKey) && x.date) seen[x.date] = 1; });
    return Object.keys(seen).sort();
  }
  function judgeSummary(db) {
    var staff = db.t('Staff'), people = {}, order = [], cfg = db.cfg();
    db.t('Judges').forEach(function (j) {
      var st = j.staffId ? staff.filter(function (x) { return x.staffId === j.staffId; })[0] : staff.filter(function (x) { return x.kind === 'judge' && x.name === j.name && (!x.affiliation || !j.affiliation || x.affiliation === j.affiliation); })[0];
      var key = st ? st.staffId : 'N:' + j.name + '|' + j.affiliation;
      if (!people[key]) { people[key] = { key: key, staffId: st ? st.staffId : '', name: j.name, affiliation: j.affiliation || (st && st.affiliation) || '', phone: s(j.phone) || (st && st.phone) || '', judgeIds: [], rounds: {}, byDay: {} }; order.push(key); }
      var P = people[key], info = parseDayInfo(j.dayInfo);
      P.judgeIds.push(j.judgeId);
      var R = P.rounds[j.round] = P.rounds[j.round] || { dates: [], divisions: [] };
      judgeDatesOf(db, j).forEach(function (d) {
        if (R.dates.indexOf(d) < 0) R.dates.push(d);
        var x = info[d] || {}, k = j.round + '|' + d;
        if (!P.byDay[k]) P.byDay[k] = { date: d, round: j.round, shift: x.shift || '', arrive: x.arrive || '', fee: judgeDayFee(cfg, j.round, d, x.shift, x.fee) };
      });
      var divs = s(j.groups) && s(j.groups) !== '전체' ? splitList(j.groups).map(function (g) { return g.split('|')[0]; })
        : db.t('Sessions').filter(function (x) { return x.round === j.round && (R.dates.indexOf(x.date) >= 0); }).map(function (x) { return x.groupKey.split('|')[0]; });
      divs.forEach(function (d) { if (d && R.divisions.indexOf(d) < 0) R.divisions.push(d); });
      R.dates.sort();
    });
    return order.map(function (k) {
      var P = people[k], days = {};
      Object.keys(P.rounds).forEach(function (r) { P.rounds[r].dates.forEach(function (d) { days[d] = 1; }); });
      P.days = Object.keys(days).sort();
      // 하루하루의 심사비 (같은 날 예선·본선을 다 하면 두 줄)
      P.dayInfo = Object.keys(P.byDay).map(function (x) { return P.byDay[x]; }).sort(function (a, b) { return cmpKo(a.date + a.round, b.date + b.round); });
      delete P.byDay;
      P.total = P.dayInfo.reduce(function (a, x) { return a + (+x.fee || 0); }, 0);
      return P;
    });
  }

  /* ---------------- 신청 현황 집계 (현황 탭 · 전년 비교) ----------------
   * 개인정보 없이 숫자만. 전년 파일도 같은 함수로 묶어 Config.prevStats 에 JSON으로 저장 */
  function gradeKey(category, grade) {
    var c = normCategory(category), g = s(grade);
    var pre = /^초/.test(c) ? '초' : /^중/.test(c) ? '중' : /^고/.test(c) ? '고' : /대학|일반/.test(c) ? '대학·일반' : c;
    if (/졸업/.test(g)) return pre + ' 졸업';
    var m = /(\d)/.exec(g);
    return m ? pre + m[1] : pre;
  }
  function applicantStats(cfg, list) {
    var o = { v: 1, total: 0, active: 0, paid: 0, wait: 0, cancel: 0, far: 0, male: 0, female: 0, groups: {}, divisions: {}, regions: {}, grades: {}, daily: {}, first: '', last: '', year: '' };
    (list || []).forEach(function (p) {
      o.total++;
      var d = s(p.appliedAt).slice(0, 10).replace(/\./g, '-');
      if (!isActive(p)) { o.cancel++; return; }
      var gk = s(p.groupKey) || makeGroupKey(cfg, p.division, p.category, p.gender), div = gk.split('|')[0];
      var G = o.groups[gk] = o.groups[gk] || { n: 0, paid: 0, wait: 0, m: 0, f: 0, far: 0 };
      var paid = isPaid(p), far = isFar(cfg, p), g = genderShort(p.gender);
      o.active++; G.n++; o.divisions[div] = (o.divisions[div] || 0) + 1;
      if (paid) { o.paid++; G.paid++; } else { o.wait++; G.wait++; }
      if (far) { o.far++; G.far++; }
      if (g === '남') { o.male++; G.m++; } else if (g === '여') { o.female++; G.f++; }
      var r = s(p.region) || regionOf(p.address, p.zip) || '미상'; o.regions[r] = (o.regions[r] || 0) + 1;
      var gr = gradeKey(p.category, p.grade); o.grades[gr] = (o.grades[gr] || 0) + 1;
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { o.daily[d] = (o.daily[d] || 0) + 1; if (!o.first || d < o.first) o.first = d; if (!o.last || d > o.last) o.last = d; }
    });
    o.year = o.last ? o.last.slice(0, 4) : '';
    return o;
  }

  /* ---------- 지난 회차 보관함 ----------
   * 회차별 신청자 파일(또는 올해 자료)을 넣으면 통계(Seasons.stats)와 이름 검색용 최소 명단(Archive)을 남김.
   * 명단은 접수 마지막 날로부터 3년이 지나면 지우고(관리자 로그인 때 자동 확인) 인원 수만 남김. */
  var KEEP_YEARS = 3;
  function addYears(d, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(d)); if (!m) return '';
    var md = m[2] + '-' + m[3]; if (md === '02-29') md = '02-28';
    return (+m[1] + n) + '-' + md;
  }
  function todayOf(db) { return s(db.store.now()).slice(0, 10); }
  function purgeExpired(db) {
    var t = todayOf(db), lim = (+t.slice(0, 4) - KEEP_YEARS) + t.slice(4);
    if (db.t('History').some(function (h) { return s(h.time).slice(0, 10) < lim; })) db.replaceWhere('History', function (h) { return s(h.time).slice(0, 10) < lim; }, []);
    var due = db.t('Seasons').filter(function (z) { return !s(z.purgedAt) && s(z.purgeAt) && s(z.purgeAt) <= t; });
    if (!due.length) return [];
    var nos = due.map(function (z) { return s(z.no); });
    db.replaceWhere('Archive', function (r) { return nos.indexOf(s(r.no)) >= 0; }, []);
    db.upsert('Seasons', due.map(function (z) { return { no: z.no, people: '0', purgedAt: db.store.now() }; }));
    db.log('system', 'archivePurge', nos.join(',') + '회 명단 삭제(보관 ' + KEEP_YEARS + '년 지남)');
    return nos;
  }
  function safePurge(db) { try { purgeExpired(db); } catch (e) { } }
  function archiveRows(cfg, no, rows) {
    return rows.map(function (r, i) {
      var gk = s(r.groupKey) || makeGroupKey(cfg, r.division, r.category, r.gender), pr = gk.split('|');
      return {
        aid: no + '-' + (i + 1), no: no, name: s(r.name), birth: normBirth(r.birth), gender: genderShort(r.gender) || s(r.gender),
        division: pr[0], category: pr[1] || '', groupKey: gk, school: s(r.school), grade: s(r.grade),
        region: s(r.region) || regionOf(r.address, r.zip) || '', status: isActive(r) ? (isPaid(r) ? '' : '미입금') : '취소',
        prior: s(r.prior), result: s(r.result), far: isFar(cfg, r) ? 'Y' : 'N'
      };
    }).filter(function (r) { return r.name; });
  }
  function saveSeason(db, no, label, rows, source, year) {
    var cfg = db.cfg();
    no = s(no).replace(/[^0-9]/g, '');
    if (!no) fail('회차 번호를 넣어 주세요. (예: 75)');
    if (!rows.length) fail('신청자 자료가 없어요.');
    var st = applicantStats(cfg, rows);
    if (!st.year && /^\d{4}$/.test(s(year))) st.year = s(year);
    st.label = s(label) || (no + '회' + (st.year ? ' (' + st.year + ')' : ''));
    // 보관 기한 = 접수 마지막 날 + 3년 (신청일이 없으면 그 해 12월 31일 기준)
    var t = todayOf(db), base = st.last || (st.year ? st.year + '-12-31' : t), purgeAt = addYears(base, KEEP_YEARS), keep = purgeAt > t;
    var arch = keep ? archiveRows(cfg, no, rows) : [];
    db.replaceWhere('Archive', function (r) { return s(r.no) === no; }, arch);
    db.upsert('Seasons', [{ no: no, label: st.label, year: st.year, first: st.first, last: st.last, total: st.total, active: st.active,
      people: arch.length, stats: JSON.stringify(st), purgeAt: purgeAt, purgedAt: keep ? '' : db.store.now(), source: source, createdAt: db.store.now() }]);
    db.log('admin', 'seasonSave', no + '회 ' + st.active + '명 · ' + (keep ? '명단 ' + arch.length + '명(~' + purgeAt + ')' : '인원 수만'));
    safePurge(db);
    return { no: no, label: st.label, active: st.active, cancel: st.cancel, people: arch.length, purgeAt: purgeAt, kept: keep, first: st.first, last: st.last };
  }
  // 신청자 파일에서: rows = [{name, birth, gender, division, category, school, grade, address, zip, payStatus, status, appliedAt, prior}]
  def('seasonSave', 'admin', true, function (db, p) {
    return saveSeason(db, p.no, p.label, (p.rows || []).map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { o[k] = s(r[k]); }); return o; }), 'file', p.year);
  });
  // 올해(이 시스템에 있는) 자료를 회차로 보관 — 예선 통과·본선 입상까지 함께
  def('seasonFromCurrent', 'admin', true, function (db, p) {
    var r1 = {}, aw = {};
    db.t('Entries').forEach(function (e) { if (e.round === 'R1') r1[e.pid] = (r1[e.pid] === '본선 진출' || e.pass === 'Y') ? '본선 진출' : '예선'; });
    allGroupKeys(db).forEach(function (k) {
      if (!entriesOf(db, 'R2', k).length) return;
      computeGroup(db, 'R2', k).rows.forEach(function (r) { if (r.award) aw[r.pid] = r.award; });
    });
    var rows = db.t('Participants').map(function (x) { var o = {}; Object.keys(x).forEach(function (k) { o[k] = x[k]; }); o.result = aw[x.id] ? '본선 ' + aw[x.id] : (r1[x.id] || ''); return o; });
    return saveSeason(db, p.no, p.label, rows, 'system', p.year);
  });
  def('seasonDelete', 'admin', true, function (db, p) {
    var no = s(p.no);
    db.replaceWhere('Archive', function (r) { return s(r.no) === no; }, []);
    db.replaceWhere('Seasons', function (z) { return s(z.no) === no; }, []);
    db.log('admin', 'seasonDelete', no + '회');
    return true;
  });
  // 기한 전이라도 명단만 지우기 (통계는 남김)
  def('seasonPurge', 'admin', true, function (db, p) {
    var no = s(p.no);
    if (!db.t('Seasons').some(function (z) { return s(z.no) === no; })) fail('그 회차가 없어요.');
    db.replaceWhere('Archive', function (r) { return s(r.no) === no; }, []);
    db.upsert('Seasons', [{ no: no, people: '0', purgedAt: db.store.now() }]);
    db.log('admin', 'seasonPurge', no + '회 명단 삭제');
    return true;
  });
  // 명단 한 줄이 회차 통계에 보탠 몫 (applicantStats와 같은 기준) — 고치거나 뺄 때 통계를 맞추려고
  function archContrib(cfg, a) {
    var o = { total: 1, active: 0, paid: 0, wait: 0, cancel: 0, far: 0, male: 0, female: 0, groups: {}, divisions: {}, regions: {}, grades: {} };
    if (s(a.status) === '취소') { o.cancel = 1; return o; }
    var gk = s(a.groupKey), G = o.groups[gk] = { n: 1, paid: 0, wait: 0, m: 0, f: 0, far: 0 };
    o.active = 1; o.divisions[gk.split('|')[0]] = 1;
    if (s(a.status) === '미입금') { o.wait = 1; G.wait = 1; } else { o.paid = 1; G.paid = 1; }
    var far = a.far === 'Y' || (a.far !== 'N' && isFar(cfg, { region: a.region }));
    if (far) { o.far = 1; G.far = 1; }
    var g = genderShort(a.gender); if (g === '남') { o.male = 1; G.m = 1; } else if (g === '여') { o.female = 1; G.f = 1; }
    o.regions[s(a.region) || '미상'] = 1; o.grades[gradeKey(a.category, a.grade)] = 1;
    return o;
  }
  function addStats(st, d, sign) {
    ['total', 'active', 'paid', 'wait', 'cancel', 'far', 'male', 'female'].forEach(function (k) { st[k] = (+st[k] || 0) + sign * (d[k] || 0); });
    ['divisions', 'regions', 'grades'].forEach(function (m) {
      st[m] = st[m] || {};
      Object.keys(d[m]).forEach(function (k) { st[m][k] = (st[m][k] || 0) + sign * d[m][k]; if (st[m][k] <= 0) delete st[m][k]; });
    });
    st.groups = st.groups || {};
    Object.keys(d.groups).forEach(function (k) {
      var G = st.groups[k] = st.groups[k] || { n: 0, paid: 0, wait: 0, m: 0, f: 0, far: 0 };
      Object.keys(d.groups[k]).forEach(function (f) { G[f] = (G[f] || 0) + sign * d.groups[k][f]; });
      if (G.n <= 0) delete st.groups[k];
    });
  }
  function seasonOf(db, no) {
    var z = db.t('Seasons').filter(function (x) { return s(x.no) === s(no); })[0];
    if (!z) fail('그 회차가 없어요.');
    var st = {}; try { st = JSON.parse(z.stats) || {}; } catch (e) { }
    return { z: z, st: st };
  }
  // 지난 회차 명단 한 사람 고치기 — 부문·구분·상태 등이 바뀌면 그 회차 인원 통계도 같이 맞춤
  def('archiveSave', 'admin', true, function (db, p) {
    var cfg = db.cfg(), r = p.row || {}, old = db.t('Archive').filter(function (x) { return x.aid === s(p.aid); })[0];
    if (!old) fail('그 사람을 찾지 못했어요. 새로고침 후 다시 해 주세요.');
    var v = function (k) { return k in r ? s(r[k]) : s(old[k]); };
    var gender = genderShort(v('gender')) || v('gender'), cat = v('category').replace(/\((남|여)\)$/, '');
    if (!v('name')) fail('이름을 넣어 주세요.');
    if (!v('division')) fail('부문을 넣어 주세요.');
    var gk = makeGroupKey(cfg, v('division'), cat, gender), st0 = v('status');
    var nw = {
      aid: old.aid, no: old.no, name: v('name'), birth: normBirth(v('birth')), gender: gender, division: gk.split('|')[0], category: gk.split('|')[1] || '', groupKey: gk,
      school: v('school'), grade: v('grade'), region: v('region'), status: /취소|환불/.test(st0) ? '취소' : /미입금|대기/.test(st0) ? '미입금' : '',
      prior: v('prior'), result: v('result'),
      far: v('region') === s(old.region) && old.far ? old.far : (isFar(cfg, { region: v('region') }) ? 'Y' : 'N')
    };
    var S = seasonOf(db, old.no);
    addStats(S.st, archContrib(cfg, old), -1); addStats(S.st, archContrib(cfg, nw), 1);
    db.upsert('Archive', [nw]);
    db.upsert('Seasons', [{ no: S.z.no, stats: JSON.stringify(S.st), active: S.st.active, total: S.st.total }]);
    db.log('admin', 'archiveSave', old.no + '회 ' + old.aid);
    return nw;
  });
  // 지난 회차 명단에서 한 사람 빼기. fromStats = 잘못 들어간 사람이라 인원 수에서도 뺌 (아니면 개인정보만 지우고 통계는 그대로)
  def('archiveRemove', 'admin', true, function (db, p) {
    var cfg = db.cfg(), old = db.t('Archive').filter(function (x) { return x.aid === s(p.aid); })[0];
    if (!old) fail('그 사람을 찾지 못했어요. 새로고침 후 다시 해 주세요.');
    var S = seasonOf(db, old.no);
    if (p.fromStats) addStats(S.st, archContrib(cfg, old), -1);
    db.replaceWhere('Archive', function (x) { return x.aid === old.aid; }, []);
    db.upsert('Seasons', [{ no: S.z.no, stats: JSON.stringify(S.st), active: S.st.active, total: S.st.total, people: Math.max(0, (+S.z.people || 1) - 1) }]);
    db.log('admin', 'archiveRemove', old.no + '회 ' + old.aid + (p.fromStats ? ' (인원 수에서도)' : ' (명단만)'));
    return true;
  });

  // 이름·학교·생년월일로 찾기. 같은 사람(이름+생년월일)이 나온 회차도 함께
  def('archiveSearch', 'admin', false, function (db, p) {
    var q = s(p.q).replace(/\s/g, ''), no = s(p.no), dv = s(p.division), all = db.t('Archive');
    if (!q && !no && !dv) return { total: 0, rows: [] };
    var hist = {};
    all.forEach(function (r) { var k = s(r.name) + '|' + s(r.birth); (hist[k] = hist[k] || []).push(+r.no); });
    var hit = all.filter(function (r) {
      return (!no || s(r.no) === no) && (!dv || r.division === dv) &&
        (!q || (s(r.name) + '|' + s(r.school) + '|' + s(r.birth)).replace(/\s/g, '').indexOf(q) >= 0);
    });
    hit.sort(function (a, b) { return (+b.no - +a.no) || groupKeyCmp(a.groupKey, b.groupKey) || cmpKo(a.name, b.name); });
    var lim = no && !q && !dv ? 3000 : 500;   // 회차 명단 통째로 보기
    return { total: hit.length, rows: hit.slice(0, lim).map(function (r) {
      var o = {}; Object.keys(r).forEach(function (k) { o[k] = r[k]; });
      o.seasons = (hist[s(r.name) + '|' + s(r.birth)] || []).sort(function (a, b) { return a - b; });
      return o;
    }) };
  });

  function myRequests(db, pid) {
    var docs = db.t('Docs');
    return db.t('Requests').filter(function (r) { return r.pid === pid; }).map(function (r) {
      var d = r.docId ? docs.filter(function (x) { return x.docId === r.docId && x.status !== '취소'; })[0] : null;
      return { reqId: r.reqId, kind: r.kind, recipient: r.recipient, attn: r.attn, target: r.target, accompName: r.accompName, note: r.note,
        status: r.status, reply: r.reply, createdAt: r.createdAt, docId: d ? d.docId : '', docNo: d ? d.docNo : '', ready: !!d };
    });
  }
  function prizeView(db, p, award) {
    var cfg = db.cfg(), g = db.t('Groups').filter(function (x) { return x.groupKey === p.groupKey; })[0];
    var row = db.t('Prizes').filter(function (x) { return x.pid === p.id; })[0];
    var amount = row && s(row.amount) ? num(row.amount) : prizeAmount(cfg, g, award);
    return {
      open: cfg.prizeOpen === 'Y', award: award, amount: amount, due: cfg.prizeDue, ceremony: cfg.awardCeremony,
      submitted: row && row.submittedAt ? {
        holderType: row.holderType, holder: row.holder, relation: row.relation, bank: row.bank, accountMask: row.accountMask, rrnMask: row.rrnMask,
        attend: row.attend, attendCount: row.attendCount, mailAddress: row.mailAddress, submittedAt: row.submittedAt, status: row.status,
        hasBank: !!row.bankFile, hasFamily: !!row.familyFile, idCheck: row.idCheck || ''
      } : null,
      files: row ? { bank: !!row.bankFile, family: !!row.familyFile, idCheck: row.idCheck || '' } : { bank: false, family: false, idCheck: '' }
    };
  }

  function staffView(db, st) {
    var cfg = db.cfg();
    var o = {
      staffId: st.staffId, kind: st.kind, name: st.name, affiliation: st.affiliation, title: st.title, phone: st.phone, email: st.email,
      birth: st.birth, zip: st.zip, address: st.address, bank: st.bank, holder: st.holder, accountMask: st.accountMask, rrnMask: st.rrnMask,
      hasId: !!st.idFile, idCheck: st.idCheck || '', hasBank: !!st.bankFile, hasSign: !!st.sign, agreeAt: st.agreeAt, pledgeAt: st.pledgeAt, contractAt: st.contractAt,
      submittedAt: st.submittedAt, status: st.status,
      cfg: { title: cfg.title, shortTitle: cfg.shortTitle, contact: cfg.contact, pubKey: cfg.pubKey, collectIdCopy: cfg.collectIdCopy, collectRrn: cfg.collectRrn, themeColor: cfg.themeColor }
    };
    if (st.kind === 'judge') {
      var me = judgeSummary(db).filter(function (x) { return x.staffId === st.staffId; })[0];
      o.judge = me ? { rounds: me.rounds, days: me.days, dayInfo: me.dayInfo, total: me.total, fee: me.dayInfo.every(function (x) { return x.fee === (me.dayInfo[0] || {}).fee; }) && me.dayInfo.length ? me.dayInfo[0].fee : 0 } : null;
    } else {
      var wage = num(st.wage || cfg.hourlyWage);
      o.work = db.t('Work').filter(function (w) { return w.staffId === st.staffId; }).sort(function (a, b) { return cmpKo(a.date, b.date); }).map(function (w) {
        var m = workMinutes(w, cfg, true);
        return { date: w.date, start: w.planStart, end: w.planEnd, rest: m.rest, minutes: m.work, role: w.role };
      });
      o.contract = { wage: wage, period: o.work.length ? [o.work[0].date, o.work[o.work.length - 1].date] : [], payDay: cfg.payDay, place: cfg.workPlace, duty: cfg.workDuty, dept: cfg.workDept };
    }
    o.docs = db.t('Docs').filter(function (d) { return d.refId === st.staffId && d.status !== '취소'; }).map(function (d) { return { docId: d.docId, kind: d.kind, title: d.title, createdAt: d.createdAt }; });
    return o;
  }

  var STAFF_ADMIN_FIELDS = ['kind', 'name', 'affiliation', 'title', 'orgHead', 'phone', 'email', 'wage', 'status', 'note', 'nameEn', 'idCheck'];
  def('saveStaff', 'admin', true, function (db, p) {
    var have = {}; db.t('Staff').forEach(function (x) { have[x.staffId] = x; });
    var rows = (p.staff || []).map(function (x) {
      var o = { staffId: s(x.staffId) || ('S' + db.store.uid().slice(0, 10)) };
      STAFF_ADMIN_FIELDS.forEach(function (k) { if (k in x) o[k] = s(x[k]); });
      if (o.phone) o.phone = normPhone(o.phone) || o.phone;
      if (!have[o.staffId]) { o.token = db.store.uid() + db.store.uid(); o.kind = o.kind === 'staff' ? 'staff' : (o.kind || 'judge'); o.status = o.status || '초대'; }
      if (!o.name && !have[o.staffId]) fail('이름이 빈 줄이 있어요.');
      o.updatedAt = db.store.now();
      return o;
    });
    db.upsert('Staff', rows);
    db.log('admin', 'saveStaff', rows.length + '명');
    return rows.map(function (r) { return r.staffId; });
  });
  def('removeStaff', 'admin', true, function (db, p) {
    var ids = (p.staffIds || []).map(s);
    db.replaceWhere('Staff', function (x) { return ids.indexOf(x.staffId) >= 0; }, []);
    db.replaceWhere('Work', function (x) { return ids.indexOf(x.staffId) >= 0; }, []);
    db.log('admin', 'removeStaff', ids.join(','));
    return true;
  });
  def('resetStaffLink', 'admin', true, function (db, p) {
    var st = db.t('Staff').filter(function (x) { return x.staffId === s(p.staffId); })[0];
    if (!st) fail('사람을 찾을 수 없어요.');
    var t = db.store.uid() + db.store.uid();
    db.upsert('Staff', [{ staffId: st.staffId, token: t }]);
    return t;
  });
  def('saveWork', 'admin', true, function (db, p) {
    var ids = (p.staffIds || []).map(s);
    var rows = (p.rows || []).map(function (w) {
      return { workId: s(w.workId) || ('W' + db.store.uid().slice(0, 10)), staffId: s(w.staffId), date: normDate(w.date), planStart: normTime(w.planStart), planEnd: normTime(w.planEnd),
        start: normTime(w.start), end: normTime(w.end), breakMin: s(w.breakMin) === '' ? '' : String(num(w.breakMin)), role: s(w.role), note: s(w.note) };
    }).filter(function (w) { return w.staffId && /^\d{4}-\d{2}-\d{2}$/.test(w.date); });
    rows.forEach(function (w) { if (ids.indexOf(w.staffId) < 0) ids.push(w.staffId); });
    db.replaceWhere('Work', function (x) { return ids.indexOf(x.staffId) >= 0; }, rows);
    return rows.length;
  });

  // ── 심사위원·진행요원 본인 입력 (링크 + 휴대폰 뒷4자리)
  def('staffSelf', 'public', false, function (db, p) { return staffView(db, staffByToken(db, p)); });
  def('staffSubmit', 'public', true, function (db, p) {
    var st = staffByToken(db, p), cfg = db.cfg(), info = p.info || {}, o = { staffId: st.staffId };
    ['affiliation', 'title', 'email', 'zip', 'address', 'bank', 'holder', 'nameEn'].forEach(function (k) { if (k in info) o[k] = s(info[k]).slice(0, 200); });
    if ('phone' in info && normPhone(info.phone)) o.phone = normPhone(info.phone);
    if ('birth' in info) o.birth = digits(info.birth).slice(0, 8);
    var enc = function (v) { v = s(v); if (v && !/^E1\.[A-Za-z0-9+/=._-]+$/.test(v)) fail('개인정보 암호화가 되지 않았습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.'); return v; };
    if ('rrnEnc' in p) { o.rrnEnc = enc(p.rrnEnc); o.rrnMask = s(p.rrnMask).replace(/[^\d*-]/g, '').slice(0, 14); }
    if ('accountEnc' in p) { o.accountEnc = enc(p.accountEnc); o.accountMask = s(p.accountMask).replace(/[^\d*-]/g, '').slice(0, 24); }
    var ag = p.agree || {}, now = db.store.now();
    if (st.kind === 'judge') { if (ag.privacy) o.agreeAt = now; }
    else { if (ag.privacy) o.agreeAt = now; if (ag.pledge) o.pledgeAt = now; if (ag.contract) o.contractAt = now; }
    if (p.final) {
      var need = [];
      var m = {}; Object.keys(st).forEach(function (k) { m[k] = st[k]; }); Object.keys(o).forEach(function (k) { m[k] = o[k]; });
      if (!m.address) need.push('주소');
      if (!m.bank || !m.accountEnc) need.push('계좌');
      if (cfg.collectRrn === 'Y' && !m.rrnEnc) need.push('주민등록번호');
      if (cfg.collectIdCopy !== 'N' && !m.idFile) need.push('신분증 사본');
      if (cfg.collectIdCopy !== 'N' && !ag.idRrn) need.push('주민번호가 보이는 신분증 확인');
      if (!m.bankFile) need.push('통장 사본');
      if (!m.agreeAt) need.push('개인정보 동의');
      if (st.kind !== 'judge' && (!m.pledgeAt || !m.contractAt)) need.push('서약·계약 동의');
      if (!m.sign) need.push('서명');
      if (need.length) fail('아직 비어 있는 항목이 있어요: ' + need.join(', '));
      o.submittedAt = now; o.status = '제출';
    }
    o.updatedAt = now;
    db.upsert('Staff', [o]);
    db.log(st.name, 'staffSubmit', p.final ? '제출' : '저장');
    return staffView(db, db.t('Staff').filter(function (x) { return x.staffId === st.staffId; })[0] || st);
  });
  // 파일·서명 연결 — ref: 'drive:파일ID' (구글) / 'demo:파일명' / 'data:image/png;base64,…'(데모 서명)
  def('staffAttach', 'public', true, function (db, p) {
    var st = staffByToken(db, p), col = { id: 'idFile', bank: 'bankFile', sign: 'sign' }[s(p.kind)];
    if (!col) fail('알 수 없는 파일 종류');
    var ref = s(p.ref);
    if (!/^(drive:[\w-]{10,}|demo:.{1,120}|data:image\/png;base64,[A-Za-z0-9+/=]{20,120000})$/.test(ref)) fail('파일 정보가 올바르지 않습니다.');
    var o = { staffId: st.staffId, updatedAt: db.store.now() }; o[col] = ref;
    if (col === 'idFile') o.idCheck = '';   // 새로 올리면 주민번호 확인을 다시 (서버 글자 인식 또는 관리자 확인)
    db.upsert('Staff', [o]);
    return { old: st[col] || '', staffId: st.staffId };
  });

  // ── 참가자: 공결공문 신청 · 상금 수령 정보
  function selfOne(db, p) {
    var q = findSelf(db, p).filter(function (x) { return x.id === s(p.pid); })[0];
    if (!q) fail('본인 확인이 맞지 않습니다. 다시 조회해 주세요.');
    return q;
  }
  def('requestDoc', 'public', true, function (db, p) {
    var q = selfOne(db, p), cfg = db.cfg();
    if (cfg.gonggyeolOpen !== 'Y') fail('지금은 공결공문 신청 기간이 아닙니다.');
    var recipient = s(p.recipient).slice(0, 80), target = s(p.target) === '반주자' ? '반주자' : '본인';
    if (!recipient) fail('수신처(학교장·부대장·기관장)를 적어 주세요.');
    if (target === '반주자' && !s(p.accompName)) fail('반주자 이름을 적어 주세요.');
    var mine = db.t('Requests').filter(function (r) { return r.pid === q.id && r.status !== '취소'; });
    if (mine.length >= 5) fail('신청은 한 사람당 5건까지 할 수 있어요. 사무국에 문의해 주세요.');
    var r = { reqId: 'Q' + db.store.uid().slice(0, 10), pid: q.id, kind: 'gonggyeol', recipient: recipient, attn: s(p.attn).slice(0, 60), target: target,
      accompName: s(p.accompName).slice(0, 30), note: s(p.note).slice(0, 300), status: '신청', createdAt: db.store.now() };
    db.append('Requests', [r]);
    db.log(q.name, 'requestDoc', recipient);
    return myRequests(db, q.id);
  });
  def('cancelRequest', 'public', true, function (db, p) {
    var q = selfOne(db, p), r = db.t('Requests').filter(function (x) { return x.reqId === s(p.reqId) && x.pid === q.id; })[0];
    if (!r) fail('신청을 찾을 수 없어요.');
    if (r.status === '발급') fail('이미 발급된 공문은 취소할 수 없어요. 사무국에 문의해 주세요.');
    db.upsert('Requests', [{ reqId: r.reqId, status: '취소', decidedAt: db.store.now() }]);
    return myRequests(db, q.id);
  });
  def('decideRequest', 'admin', true, function (db, p) {
    var ids = (p.reqIds || [p.reqId]).map(s).filter(Boolean), st = s(p.status);
    if (['신청', '반려', '취소', '확인', '발급'].indexOf(st) < 0) fail('상태값이 올바르지 않습니다.');
    db.upsert('Requests', ids.map(function (id) { return { reqId: id, status: st, reply: s(p.reply), decidedAt: db.store.now() }; }));
    return true;
  });
  def('saveRequest', 'admin', true, function (db, p) {
    var r = p.request || {}, id = s(r.reqId) || ('Q' + db.store.uid().slice(0, 10));
    var o = { reqId: id }; ['pid', 'kind', 'recipient', 'attn', 'target', 'accompName', 'note', 'status'].forEach(function (k) { if (k in r) o[k] = s(r[k]); });
    if (!s(r.reqId)) { o.createdAt = db.store.now(); o.kind = o.kind || 'gonggyeol'; o.status = o.status || '확인'; }
    db.upsert('Requests', [o]);
    return id;
  });

  def('submitPrize', 'public', true, function (db, p) {
    var q = selfOne(db, p), cfg = db.cfg();
    if (cfg.prizeOpen !== 'Y') fail('지금은 상금 수령 정보를 받지 않습니다.');
    var pv = participantView(db, q), r2 = pv.rounds.R2;
    if (!(r2 && r2.result && r2.result.award)) fail('입상자만 입력할 수 있어요.');
    var enc = function (v) { v = s(v); if (!/^E1\.[A-Za-z0-9+/=._-]+$/.test(v)) fail('개인정보 암호화가 되지 않았습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.'); return v; };
    var holderType = s(p.holderType) === '보호자' ? '보호자' : '본인';
    if (!s(p.holder) || !s(p.bank)) fail('예금주와 은행을 적어 주세요.');
    if (!p.agree) fail('개인정보 수집·이용에 동의해 주세요.');
    var cur = db.t('Prizes').filter(function (x) { return x.pid === q.id; })[0] || {};
    if (!cur.bankFile) fail('통장 사본을 올려 주세요.');
    if (!cur.familyFile) fail('주민등록번호가 보이는 서류(주민등록등본 또는 주민등록증·운전면허증)를 올려 주세요.');
    if (!p.idRrn) fail('주민등록번호 뒷자리까지 보이는 서류를 올렸는지 확인해 주세요.');
    var o = { pid: q.id, holderType: holderType, holder: s(p.holder).slice(0, 30), relation: holderType === '보호자' ? s(p.relation).slice(0, 10) : '본인',
      bank: s(p.bank).slice(0, 20), accountEnc: enc(p.accountEnc), accountMask: s(p.accountMask).replace(/[^\d*-]/g, '').slice(0, 24),
      attend: s(p.attend).slice(0, 10), attendCount: digits(p.attendCount).slice(0, 2), mailAddress: s(p.mailAddress).slice(0, 200),
      agreeAt: db.store.now(), submittedAt: db.store.now(), status: '제출' };
    if (cfg.collectRrn === 'Y') { o.rrnEnc = enc(p.rrnEnc); o.rrnMask = s(p.rrnMask).replace(/[^\d*-]/g, '').slice(0, 14); }
    db.upsert('Prizes', [o]);
    db.log(q.name, 'submitPrize', '');
    return prizeView(db, q, r2.result.award);
  });
  def('prizeAttach', 'public', true, function (db, p) {
    var q = selfOne(db, p), col = { bank: 'bankFile', family: 'familyFile' }[s(p.kind)];
    if (!col) fail('알 수 없는 파일 종류');
    var ref = s(p.ref);
    if (!/^(drive:[\w-]{10,}|demo:.{1,120})$/.test(ref)) fail('파일 정보가 올바르지 않습니다.');
    var row = db.t('Prizes').filter(function (x) { return x.pid === q.id; })[0];
    var o = { pid: q.id }; o[col] = ref; if (!row) o.status = '작성중';
    if (col === 'familyFile') o.idCheck = '';
    db.upsert('Prizes', [o]);
    return { old: row ? row[col] || '' : '', pid: q.id };
  });
  def('savePrizes', 'admin', true, function (db, p) {
    db.upsert('Prizes', (p.rows || []).map(function (r) {
      var o = { pid: s(r.pid) }; ['amount', 'status', 'note', 'idCheck'].forEach(function (k) { if (k in r) o[k] = s(r[k]); }); return o;
    }).filter(function (r) { return r.pid; }));
    return true;
  });

  // ── 발급대장: 공문·확인서 번호 등록 (번호 겹치면 거절)
  def('registerDocs', 'admin', true, function (db, p) {
    var docs = db.t('Docs'), used = {};
    docs.forEach(function (d) { if (d.docNo && d.status !== '취소') used[d.series + '|' + d.docNo] = 1; });
    var now = db.store.now(), rows = [], reqs = [];
    (p.items || []).forEach(function (it) {
      var series = s(it.series), no = s(it.docNo);
      if (no && used[series + '|' + no]) fail('문서번호 ' + no + '는 이미 발급대장에 있어요. 번호를 바꿔 다시 만들어 주세요.');
      if (no) used[series + '|' + no] = 1;
      var r = { docId: 'D' + db.store.uid().slice(0, 10), kind: s(it.kind), series: series, docNo: no, title: s(it.title), target: s(it.target), refId: s(it.refId),
        fileId: s(it.fileId), pdfId: s(it.pdfId), url: s(it.url), createdAt: now, status: '발급', fields: typeof it.fields === 'string' ? it.fields : JSON.stringify(it.fields || {}) };
      rows.push(r);
      if (s(it.reqId)) reqs.push({ reqId: s(it.reqId), status: '발급', docId: r.docId, decidedAt: now });
    });
    if (p.dryRun) return [];
    if (rows.length) db.append('Docs', rows);
    if (reqs.length) db.upsert('Requests', reqs);
    db.log('admin', 'registerDocs', rows.length + '건');
    return rows;
  });
  def('updateDoc', 'admin', true, function (db, p) {
    var o = { docId: s(p.docId) }; ['status', 'fileId', 'pdfId', 'url'].forEach(function (k) { if (k in p) o[k] = s(p[k]); });
    db.upsert('Docs', [o]);
    if (o.status === '취소') db.t('Requests').filter(function (r) { return r.docId === o.docId; }).forEach(function (r) { db.upsert('Requests', [{ reqId: r.reqId, status: '확인', docId: '' }]); });
    return true;
  });
  // 본인 문서 내려받기 확인 (참가자: 이름·생년월일·휴대폰, 인력: 링크)
  def('myDoc', 'public', false, function (db, p) {
    var d = db.t('Docs').filter(function (x) { return x.docId === s(p.docId) && x.status !== '취소'; })[0];
    if (!d) fail('문서를 찾을 수 없어요.');
    if (s(p.t)) { var st = staffByToken(db, p); if (d.refId !== st.staffId) fail('본인 문서만 받을 수 있어요.'); }
    else {
      var q = selfOne(db, p);
      var ok = d.refId === q.id || db.t('Requests').some(function (r) { return r.reqId === d.refId && r.pid === q.id; });
      if (!ok) fail('본인 문서만 받을 수 있어요.');
    }
    return { docId: d.docId, kind: d.kind, title: d.title, docNo: d.docNo, fileId: d.fileId, pdfId: d.pdfId, fields: d.fields };
  });
  // 정산이 끝난 뒤 제출 서류(신분증·통장 사본) 파일 정리 — 지울 파일 목록을 돌려주고 칸을 비움
  def('clearFiles', 'admin', true, function (db, p) {
    var refs = [];
    if (s(p.who) === 'prize') {
      var pr = db.t('Prizes').filter(function (x) { return (p.ids || []).indexOf(x.pid) >= 0; });
      pr.forEach(function (x) { [x.bankFile, x.familyFile].forEach(function (r) { if (r) refs.push(r); }); });
      db.upsert('Prizes', pr.map(function (x) { return { pid: x.pid, bankFile: '', familyFile: '' }; }));
    } else {
      var sf = db.t('Staff').filter(function (x) { return (p.ids || []).indexOf(x.staffId) >= 0; });
      sf.forEach(function (x) { [x.idFile, x.bankFile].forEach(function (r) { if (r) refs.push(r); }); });
      db.upsert('Staff', sf.map(function (x) { return { staffId: x.staffId, idFile: '', bankFile: '' }; }));
    }
    db.log('admin', 'clearFiles', refs.length + '개');
    return refs;
  });

  /* ---------------- 진입점 ---------------- */
  var ROLE_OK = { admin: ['admin'], desk: ['desk', 'admin'], judge: ['judge'] };
  function handle(req, store) {
    try {
      req = req || {};
      var a = A[req.action];
      if (!a) fail('알 수 없는 요청입니다: ' + req.action);
      var db = makeDb(store), auth = null;
      if (a.role !== 'public') {
        auth = readToken(db, req.token);
        if (!auth || ROLE_OK[a.role].indexOf(auth.role) < 0) return { ok: false, error: '로그인이 필요합니다.', needLogin: true };
        if (auth.role === 'admin' && auth.adminId && !adminList(db.cfg()).some(function (x) { return x.id === auth.adminId && x.on !== 'N'; })) return { ok: false, error: '사용이 중지된 관리자예요. 책임 관리자에게 문의해 주세요.', needLogin: true };
        db.who = auth.name || '';
      }
      var run = function () {
        db.invalidate();
        try { return a.run(db, req.params || {}, auth); }
        finally { if (db.dirty && store.bump) store.bump(); }   // 자료 버전 올리기 → 다른 화면이 새로 받아 감
      };
      var data = a.write ? store.withLock(run) : run();
      return { ok: true, data: data };
    } catch (e) {
      return { ok: false, error: e && e.userFacing ? e.message : ('처리 중 오류: ' + (e && e.message ? e.message : e)) };
    }
  }

  return {
    SCHEMA: SCHEMA, KEYS: KEYS, DEFAULT_CONFIG: DEFAULT_CONFIG, handle: handle,
    matchDeposits: matchDeposits, normBirth: normBirth, normPhone: normPhone, surnameOf: surnameOf, isPaid: isPaid, isActive: isActive,
    makeGroupKey: makeGroupKey, groupLabel: groupLabel, roundCfg: roundCfg, toMin: toMin, fromMin: fromMin,
    normDate: normDate, normTime: normTime, cmpKo: cmpKo, digits: digits, randToken: randToken,
    parsePieces: parsePieces, normPieces: normPieces, piecesFor: piecesFor, pieceLine: pieceLine, piecesText: piecesText,
    splitDivision: splitDivision, normCategory: normCategory, pieceEditState: pieceEditState, regionOf: regionOf, isFar: isFar,
    planDay: planDay, retimeDay: retimeDay, pieceChangeKind: pieceChangeKind, FIELD_LABEL: FIELD_LABEL, planAll: planAll, autoPlan: autoPlan, durMin: durMin, parseSec: parseSec, fmtSec: fmtSec, parseBlocks: parseBlocks,
    withholding: withholding, prizeTable: prizeTable, prizeAmount: prizeAmount, workMinutes: workMinutes, staffPay: staffPay, weekKey: weekKey,
    parseIdText: parseIdText, parseBankText: parseBankText, judgeCovers: judgeCovers,
    parseJudgeRates: parseJudgeRates, judgeDayFee: judgeDayFee, parseDayInfo: parseDayInfo, dayInfoStr: dayInfoStr, isWeekend: isWeekend,
    applicantStats: applicantStats, gradeKey: gradeKey, groupKeyCmp: groupKeyCmp, splitSizes: splitSizes,
    checkTimes: checkTimes, checkSessions: checkSessions, parseBreaks: parseBreaks, perSecDefault: perSecDefault,
    sha256hex: sha256hex, pwCheck: pwCheck, brandOf: brandOf,
    authOf: function (store, tk) { var db = makeDb(store), x = readToken(db, tk); if (x && x.role === 'admin' && x.adminId && !adminList(db.cfg()).some(function (y) { return y.id === x.adminId && y.on !== 'N'; })) return null; return x; }
  };
})();
if (typeof module !== 'undefined') module.exports = KC;
