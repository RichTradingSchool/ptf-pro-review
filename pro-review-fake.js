// 프로 모드 검토판 전용(2026-11-23 — 대표가 휴대폰에서 직접 눌러 보는 내부 검토판, tools/pro_review_build.py가 .preview/pro-review/에만 싣는다).
// 회원 빌드(tools/build.mjs → dist·.preview/app)에는 들어가지 않는다 — app/ 밖 파일이고 빌드가 읽지 않음(test/tools-pro-review.test.mjs).
// 앱 스크립트(type=module app.js)보다 먼저 읽히는 보통 스크립트 하나: fetch·EventSource·WebSocket·XMLHttpRequest·sendBeacon·서비스 워커 등록·IndexedDB를 바꿔
//   가짜 허브(https://fake-hub.invalid)·가짜 오렌지엑스 WS(wss://fake-ox.invalid)를 이 페이지 메모리 안에서 흉내 낸다(tools/pro_preview.py의 가짜 허브·가짜 오렌지엑스와 같은 답).
//   같은 출처(이 검토판 정적 파일)만 진짜로 읽고, 그 밖의 바깥 주소는 모두 막는다 — 실제 허브·실행기·거래소에 닿지 않는다(index.html CSP도 connect-src 'self').
//   사무실 탭은 검토판 폴더 안 사무실 m/ 사본(office/m/ — CSP frame-src는 그 경로만). 사본은 자기 문서 안에서 바이낸스 공개 시세 등을 읽는다(게시된 사무실과 같음 — 이 스크립트 밖)
//   분석·판정·직원 말·정밀 분석(늘 재생)·체험 남은 횟수는 이 가짜 허브가 셸에게 주고, 셸이 사무실에 postMessage로 넘긴다(회원 앱과 같은 길).
// IndexedDB는 늘 메모리 흉내(이 페이지가 열려 있는 동안만 — 새로 고치면 UID 활성화부터 다시). 회원 빌드의 vault 판정(requireDurable)은 바꾸지 않는다.
// 검토용 UID는 시험 UID 꼴(TEST-…) — 실제 오렌지엑스·투빗 UID(숫자·영문 대문자, 하이픈 없음)와 겹칠 수 없다.
// 화면 아래 '검토' 막대(.prv-bar)로 상태를 바꾼다 — 값은 pro_preview.py /__pro 손잡이와 같은 뜻.
(function () {
  'use strict';
  var G = typeof globalThis !== 'undefined' ? globalThis : window;
  var HUB = 'https://fake-hub.invalid';
  var OX_ORIGIN = 'wss://fake-ox.invalid';
  var REVIEW_UID = 'TEST-PREV26';
  // 이 검토판 파일의 출처(주소에서 셈 — 출처가 막힌 iframe(opaque)이어도 정적 파일 주소는 이 출처)
  var LOCAL = (function () {
    try { return new URL(G.location.href).origin; } catch (e) { return null; }
  })();

  // ── 시나리오(pro_preview.py SCENARIOS와 같은 뜻 + 잔고 모름·배율 켠 뒤) ──
  var SCEN = {
    bar: { label: '잔고 8,400', pro: null, eq: 8400, lev: false, old: false },
    unknown: { label: '잔고 모름', pro: null, eq: null, lev: false, old: false },
    judging: { label: '12,000 판정 전', pro: null, eq: 12000, lev: false, old: false },
    off: { label: '자격 · 끔', pro: { elig: true, on: false }, eq: 12000, lev: false, old: false },
    on: { label: '자격 · 켬', pro: { elig: true, on: true }, eq: 12000, lev: false, old: false },
    lev: { label: '배율 켠 뒤', pro: { elig: true, on: true }, eq: 12000, lev: true, old: false },
    old: { label: '업데이트 필요', pro: { elig: true, on: false }, eq: 12000, lev: false, old: true },
  };
  var WX = { clear: '맑음', cloudy: '흐림', storm: '폭풍' };
  var SYMS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];
  // 검토용 UID의 거래소(2026-11-23 투빗 우선 — 기본 투빗 회원). 주소 ?ex=ox면 오렌지엑스 회원(막대 손잡이가 주소를 바꿔 새로 엶)
  var EX = (function () {
    try { return new URL(G.location.href).searchParams.get('ex') === 'ox' ? 'ox' : 'tb'; } catch (e) { return 'tb'; }
  })();
  var S = { s: 'bar', wx: 'storm', pro: null, eq: 8400, old: false, lev: false, run: false, startedAt: null, autoSl: true,
    srv: 'none', keysOn: false, ex: EX, tokens: {}, cmds: {}, blocked: [], trialUsed: 0, requests: [],
    judgeMs: 3000, judgeAt: null, mockScale: 1 }; // 잔고 직접 넣기 판정 전 시간·모의 매매 속도(점검만 바꿈 — 막대에는 없음)

  // ── 사무실 탭(2026-11-23 '실제처럼'): 검토판 폴더 안 사무실 m/ 사본(office/m/ — 게시된 사무실과 같은 코드, 믿는 셸 출처만 검토판 출처로 바꿈).
  //    검토판이 이 주소(GitHub Pages ptf-pro-review)에서 열릴 때만 사본을 띄운다 — 다른 곳(아티팩트 등)에서는 사본이 셸 출처가 달라 말을 못 받으므로
  //    사무실 자리에 안내 한 줄로(앱 config.js officeUrl은 이 값을 읽고, 없으면 가짜 주소 — CSP frame-src가 그 주소를 막음) ──
  var REVIEW_BASE = 'https://richtradingschool.github.io/ptf-pro-review/';
  var OFFICE_NOTE = '검토판은 프로 모드만 봅니다 · 트레이딩 탭에서 확인하세요';
  var OFFICE_URL = (function () {
    try { return String(G.location.href).indexOf(REVIEW_BASE) === 0 ? REVIEW_BASE + 'office/m/' : null; } catch (e) { return null; }
  })();
  G.__ptfProReviewOffice = OFFICE_URL;

  // 잔고 직접 넣기: 숫자(또는 쉼표 든 숫자 글)만 — 0 이하·글자·너무 큰 값은 던짐(막대가 짧은 안내로 바꿈)
  function parseEq(v) {
    var t = typeof v === 'number' ? v : (typeof v === 'string' && /^\d[\d,]*(\.\d{1,8})?$/.test(v.trim()) ? Number(v.trim().replace(/,/g, '')) : NaN);
    if (!(typeof t === 'number' && isFinite(t) && t > 0 && t <= 1e9)) throw new Error('eq: 0보다 큰 숫자');
    return t;
  }
  // 판정 전이 끝났으면 자격(끔)으로 — 가짜 허브가 답할 때마다 한 번 봄
  function settle() {
    if (S.judgeAt != null && NOW() >= S.judgeAt) {
      S.judgeAt = null;
      S.pro = { elig: true, on: false };
    }
  }
  function enterEquity() {
    var r = G.__ptfProReviewRules;
    var e = r && r.qualify && r.qualify.enterEquity;
    if (typeof e !== 'number' || !isFinite(e)) throw new Error('eq: 규칙 값 없음');
    return e;
  }
  function apply(q) {
    q = q || {};
    if (q.eq != null) {
      var v = parseEq(q.eq);
      var enter = enterEquity(); // 기준은 빌드가 넣는 pro-rules.json qualify.enterEquity — 여기에 숫자를 두지 않음
      S.s = 'eq';
      S.eq = v;
      if (v >= enter) {
        S.pro = null; // 판정 전 — 잠깐 뒤 자격(끔)
        S.judgeAt = NOW() + S.judgeMs;
      } else {
        S.pro = null;
        S.judgeAt = null;
      }
    }
    if (q.s != null) {
      var sc = SCEN[q.s];
      if (!sc) throw new Error('s: ' + Object.keys(SCEN).join(', '));
      S.s = q.s;
      S.judgeAt = null;
      S.pro = sc.pro ? { elig: sc.pro.elig, on: sc.pro.on } : null;
      S.eq = sc.eq;
      S.old = sc.old;
      S.lev = sc.lev;
      var rules = G.__ptfProReviewRules;
      if (rules && rules.lev) rules.lev.on = sc.lev === true;
    }
    if (q.wx != null) {
      if (!WX[q.wx]) throw new Error('wx: ' + Object.keys(WX).join(', '));
      S.wx = q.wx;
    }
    if (q.ex != null) {
      if (q.ex !== 'tb' && q.ex !== 'ox') throw new Error('ex: tb, ox');
      S.ex = q.ex;
    }
    if (q.run != null) {
      S.run = q.run === true;
      if (S.run) {
        S.srv = 'on';
        S.startedAt = Date.now();
      }
    }
    return view();
  }
  function view() {
    settle();
    return { s: S.s, wx: S.wx, eq: S.eq, pro: S.pro ? { elig: S.pro.elig, on: S.pro.on } : null, old: S.old, lev: S.lev, run: S.run, srv: S.srv, keysOn: S.keysOn, ex: S.ex };
  }

  // ── 가짜 허브 답(pro_preview.py PreviewHub·check_app.py ServerHub와 같은 꼴) ──
  var NOW = function () { return Date.now(); };
  var rid = function (p) { var s = p; for (var i = 0; i < 16; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)]; return s; };
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var b64id = function (n) { var s = ''; for (var i = 0; i < n; i++) s += B64[Math.floor(Math.random() * 64)]; return s; };
  function memberState() {
    var t = NOW();
    return { ok: true, now: t, me: { ed: 's', test: true, exp: t + 30 * 86400000, testUntil: t + 30 * 86400000, ex: S.ex },
      follow: { enabled: true, reason: null, shadow: false, minAppVersion: null, symbols: ['BTC'], limits: { maxBase: 200 }, lease: { holder: false, until: null } },
      feed: { autoOn: true, autoSymbols: ['BTC'], stats: { since: t - 7 * 86400000, closed: 0, tp: 0, sl: 0, liq: 0, other: 0, unknown: 0 }, seq: 100, updated: t, stale: false,
        degraded: false, recovered: false, epoch: 'ep000001', partner: { up: true } },
      open: [], ended: [], rehearsal: { open: [], ended: [] },
      manual: { enabled: false, reason: 'off', testOnly: true, symbols: ['BTC'], maxLev: { coin: 50, stock: 25 }, stockSymbols: [], limits: { maxBase: 200 } }, signals: null };
  }
  function serverState() {
    settle();
    var t = NOW();
    if (S.srv === 'pending' && S.onAt && t >= S.onAt) S.srv = 'on';
    var run = S.run
      ? { autoSl: S.autoSl, max: 3, until: null, startedAt: S.startedAt || t, done: 1, symbols: ['BTC'] }
      : { autoSl: S.autoSl, max: null, until: null, startedAt: null, done: 0, symbols: [] };
    var out = { ok: true, now: t, available: true, reason: null, status: S.run ? 'on' : S.srv, error: null, lastCheck: S.srv === 'none' && !S.run ? null : t - 5000,
      exec: { up: true, lastSeen: t }, trades: spiderTrades(), offApp: null, auto: S.run, settings: run, notes: [], skips: [], cmds: [] };
    // 투빗 회원: 끝 칸 bal = 실행기가 읽은 자기 잔고(휴대폰은 투빗에 직접 닿지 않음 — 띠 잔고), 모름은 null
    if (S.ex === 'tb') out.bal = S.eq == null ? null : { avail: S.eq, equity: S.eq, at: t - 5000 };
    return out;
  }
  // 거미줄 보기(프로 회원 BTC 오토 매매 흉내 — 서버 상태 trades v2 칸 그대로, 가격은 가짜 봉 근처)
  // 매매 줄 칸 = 서버 상태 trades V3(V2 + first: 1차 체결가, 숫자|null) — 앱 checkServerState가 V3를 받게 된 뒤 그대로 통과
  function tradeLine(o) {
    var closed = o.state === 'closed';
    var open = o.state === 'open';
    return { id: o.id, symbol: 'BTC', side: o.side || 'long', lev: 50, stage: o.stage, state: o.state, openedAt: o.openedAt, closedAt: closed ? o.closedAt : null,
      avg: o.avg == null ? null : o.avg, exit: closed ? o.exit : null, resultPct: closed ? (o.resultPct == null ? 10 : o.resultPct) : null, pnlUsdt: closed ? (o.pnl || 2.6) : null, autoSl: null, rehearsal: false, src: 'signal',
      nextStage: open && o.stage < 4 ? o.stage + 1 : null, slWatch: null, first: o.first == null ? null : o.first };
  }
  // '거미줄로 본 이득'에 숫자가 처음부터 보이게 하는 끝난 매매 견본(최근 며칠 — 롱·숏 섞음, 추가 진입 2~4차 4건 + 1차만 1건)
  // 평단 이득 % = 방향 × (1차 체결가 − 평단) ÷ 1차 체결가: 0.94 · 0.48 · 1.35 · 0.64(+ 아래 '프로였다면' 견본 2차 한 건 0.24)
  var SAMPLE_TRADES = [
    { id: 'rvs1', side: 'long', stage: 3, first: 64000, avg: 63400, days: 6 },
    { id: 'rvs2', side: 'short', stage: 2, first: 63000, avg: 63300, days: 5 },
    { id: 'rvs3', side: 'long', stage: 4, first: 65200, avg: 64320, days: 4 },
    { id: 'rvs4', side: 'long', stage: 1, first: 63800, avg: 63800, days: 3 },
    { id: 'rvs5', side: 'short', stage: 3, first: 62500, avg: 62900, days: 2 },
  ];
  // '프로였다면' 칸(2026-11-28)이 보이게 하는 끝난 매매 견본 — 폭풍 때 손절로 끝난 두 건(1차만·2차까지)과 맑을 때 익절 한 건.
  // 폭풍은 가짜 5분봉(아래 candles)이 그 매매 1차 시각 앞 70분을 거센 봉으로 만들어 앱이 허브와 같은 식으로 다시 판정하게 함(storm: true).
  // 앱 셈: 폭풍 1차 줄임 30%(pro-rules) — 1차만 −18.4 → −12.88, 2차까지는 1차 몫만 줄고 남은 차수는 조금 커짐. 봉 3200개 안(최근 약 4.1일)만 셈
  var WHATIF_TRADES = [
    { id: 'rvw1', side: 'long', stage: 1, first: 63800, avg: 63800, exit: 63340.6, resultPct: -36, pnl: -18.4, days: 1.5, storm: true },
    { id: 'rvw2', side: 'short', stage: 2, first: 63000, avg: 63150, exit: 63500, resultPct: -27.7, pnl: -24.6, days: 0.8, storm: true },
    { id: 'rvw3', side: 'long', stage: 1, first: 63500, avg: 63500, exit: 63627, resultPct: 10, pnl: 2.6, days: 0.4, storm: false },
  ];
  var BURST_MS = 70 * 60000;
  function sampleLines() {
    var t = NOW();
    var out = SAMPLE_TRADES.map(function (s) {
      var at = t - s.days * 86400000;
      var exit = Math.round(s.avg * (s.side === 'long' ? 1.002 : 0.998) * 10) / 10;
      return tradeLine({ id: s.id, side: s.side, stage: s.stage, state: 'closed', openedAt: at, closedAt: at + 2 * 3600000, avg: s.avg, exit: exit, first: s.first });
    });
    WHATIF_TRADES.forEach(function (s) {
      var at = t - s.days * 86400000;
      out.push(tradeLine({ id: s.id, side: s.side, stage: s.stage, state: 'closed', openedAt: at, closedAt: at + 3600000, avg: s.avg, exit: s.exit, first: s.first, pnl: s.pnl, resultPct: s.resultPct }));
    });
    return out;
  }
  // 가짜 5분봉의 거센 구간(폭풍 견본 매매 1차 시각 앞 70분)
  function burstAt(bt) {
    var t = NOW();
    return WHATIF_TRADES.some(function (s) { var at = t - s.days * 86400000; return s.storm && bt <= at && bt >= at - BURST_MS; });
  }
  // 가짜 오렌지엑스 WS의 지금 가격 — 열린 거미줄 매매가 있으면 그 단계의 가격(S.spider.px, 앱이 칸이 펼쳐지는 때를 알아보는 데 씀), 아니면 63600
  function fakePx() {
    var x = S.spider;
    return x && x.state === 'open' && typeof x.px === 'number' ? x.px : 63600;
  }
  function spiderTrades() {
    var x = S.spider;
    var out = sampleLines();
    if (x) out.push(tradeLine({ id: x.id || 'rv1', stage: x.stage, state: x.state, openedAt: x.openedAt, closedAt: x.closedAt, avg: x.avg, exit: x.exit, pnl: x.pnl, first: x.first }));
    return out;
  }
  // 종목마다 가격 자리·위상이 다른 5분봉(변동성 레이더 작은 게이지 바늘도 움직이게) — BTC는 예전 값 그대로
  var CANDLE_BASE = { BTC: 63600, ETH: 3400, SOL: 160, XRP: 0.62, DOGE: 0.16 };
  // limit(허브와 같이 1~3200, 기본 300)만큼 — '프로였다면' 칸은 3200봉(허브 chart.maxBars)을 받아 견본 매매 1차 시각의 날씨를 다시 판정
  var CANDLE_MAX = 3200;
  function candles(query) {
    var m = /[?&]symbol=([A-Za-z0-9]+)/.exec(query || '');
    var sym = m && CANDLE_BASE[m[1]] ? m[1] : 'BTC';
    var lm = /[?&]limit=(\d+)/.exec(query || '');
    var n = lm ? Math.min(CANDLE_MAX, Math.max(1, Number(lm[1]))) : 300;
    var k = CANDLE_BASE[sym] / 63600; // 가격 자리 배율(모양은 BTC와 같게)
    var ph = SYMS.indexOf(sym) * 1.9; // 종목마다 위상
    var out = [];
    var step = 300000;
    var end = Math.floor(NOW() / step) * step;
    for (var i = n - 1; i >= 0; i--) {
      var t = end - i * step;
      var c = (63600 + Math.sin(i / 9 + ph) * 180 + Math.sin(i / 37 + ph) * 1100) * k; // 거미줄 자리(50× 2·3·4차 −0.8~−1.6%)가 보이는 폭
      var wick = i === 0 ? Math.abs(Math.sin(NOW() / 7000 + ph)) * 260 * k : 0; // 지금 봉 위꼬리가 시간 따라 늘었다 줄어 — 변동성 게이지 바늘 값이 움직임
      var wild = sym === 'BTC' && burstAt(t) ? 900 * k : 0; // 폭풍 견본 매매 앞 거센 봉
      out.push([t, c - 12 * k, c + 30 * k + wick + wild, c - 30 * k - wild, c, 12.345]);
    }
    return { ok: true, symbol: sym, tf: '5m', at: NOW(), stale: false, candles: out };
  }
  function cmdResult(kind, args) {
    if (kind === 'settings') {
      settle();
      if (args && Object.prototype.hasOwnProperty.call(args, 'pro')) {
        if (!(S.pro && S.pro.elig === true)) return { ok: false, error: 'pro_elig' };
        S.pro.on = args.pro === true;
      }
      if (args && Object.prototype.hasOwnProperty.call(args, 'autoSl')) S.autoSl = args.autoSl === true;
      // 프로 기능 꺼 둠(2026-11-27 settings { proOff }) — 받아 두고 프로 상태 답 off 칸에 싣는다(서버 계약 차례 lev·storm·dca, 비면 칸 없음)
      if (args && Object.prototype.hasOwnProperty.call(args, 'proOff')) {
        if (!Array.isArray(args.proOff)) return { ok: false, error: 'bad_settings' };
        S.proOff = args.proOff.slice();
      }
      return { ok: true, error: null };
    }
    if (kind === 'on') {
      S.run = true;
      S.srv = 'on';
      S.startedAt = NOW();
      return { ok: true, error: null };
    }
    if (kind === 'off') {
      S.run = false;
      return { ok: true, error: null };
    }
    if (kind === 'ack') return { ok: true, error: null };
    return { ok: false, error: 'exec_off' }; // 주문 명령은 검토판에서 받지 않음(실제 주문 없음)
  }
  function oxCall(body) {
    var m = body && body.method;
    if (m === '/private/get_account_msg') return { result: { uid: 'REVIEW', nickname: 'review' } };
    if (m === '/private/get_assets_info') {
      if (S.eq == null) return { result: { PERPETUAL: {} } };
      var v = String(S.eq);
      return { result: { PERPETUAL: { wallet_balance: v, total_margin_balance: v, available_funds: v } } };
    }
    if (typeof m === 'string' && m.indexOf('/private/get_') === 0) return { result: [] };
    return null;
  }

  // ── 리치 서버 AI 분석(사무실 판정판·직원 말) — 허브 /v1/analysis/latest·item 꼴(app/lib/analysis-shape.js — 시험 견본 app-analysis-contract.json과 같은 칸).
  //    시각은 이 페이지를 연 때 기준. 문장에 가격 숫자를 넣지 않는다(사무실 차트는 바이낸스 시세라 숫자가 어긋나 보이지 않게) ──
  var MIN = 60000;
  var T_OPEN = Date.now();
  var STAFF = {
    taro: ['TARO', '기술적 분석'], vibe: ['VIBE', '센티먼트'], blitz: ['BLITZ', '스캘퍼'], guard: ['GUARD', '리스크 관리'], ace: ['ACE', '수석 트레이더'],
  };
  var turn = function (id, bubble, report) { return { id: id, name: STAFF[id][0], role: STAFF[id][1], turn: null, bubble: bubble, report: report, reconstructed: false }; };
  var ANA_SRC = [
    { symbol: 'BTC', side: 'LONG', conf: 68, ago: 4, rr: 1.6,
      entry: '5분봉이 직전 고점 위에서 마감하면 롱 · 지금 가격 추격 금지', stop: '직전 저점 아래 마감 시 무효', target: '전 고점대 · 증거금 +10% 부근',
      turns: [
        ['taro', '20·50 이동평균 위로 올라섰고 MACD가 0선 위에서 다시 벌어지는 중입니다.', '5분봉 기준 가격이 20·50 이동평균을 모두 위에 두고 있고 MACD 히스토그램이 세 봉째 늘고 있습니다. RSI는 58로 과열 전 구간입니다.'],
        ['vibe', '공포탐욕지수는 중립 위, 롱·숏 비율은 롱이 조금 많지만 쏠림은 아닙니다.', '심리는 중립에서 낙관 쪽으로 기울었지만 과열 신호는 없습니다. 펀딩비도 평소 수준입니다.'],
        ['blitz', '직전 고점 위 마감을 확인하고 들어가는 롱이 깔끔합니다.', '추격 진입은 피하고 직전 고점 위 5분봉 마감을 확인한 뒤 진입합니다. 실패하면 직전 저점 아래에서 바로 정리합니다.'],
        ['guard', '손절 폭이 청산 거리 안쪽이라 계획대로면 감당할 수 있습니다.', '손절이 청산 거리보다 충분히 가깝습니다. 비중은 평소 1차 그대로 두고 손절선은 옮기지 않습니다.'],
        ['ace', '롱 판정 · 확신도 68. 고점 위 마감 확인 뒤 진입, 직전 저점 아래면 무효입니다.', '추세와 모멘텀이 같은 쪽을 가리키고 심리도 과열 전이라 롱으로 판정합니다. 진입은 확인 뒤, 손절은 직전 저점 아래입니다.'],
      ] },
    { symbol: 'ETH', side: 'SHORT', conf: 64, ago: 11, rr: 1.5,
      entry: '반등이 20 이동평균에서 막히면 숏 · 바닥 추격 금지', stop: '50 이동평균 위 마감 시 무효', target: '최근 저점대 · 증거금 +10% 부근',
      turns: [
        ['taro', '20 이동평균 아래에서 고점이 낮아지고 MACD가 0선 아래로 내려갔습니다.', '1시간봉 고점이 세 번 연속 낮아졌고 5분봉 MACD가 0선 아래에서 벌어지고 있습니다. RSI 42로 아직 바닥은 아닙니다.'],
        ['vibe', '미결제약정은 늘고 롱 비율이 높아 아래로 밀리면 정리 물량이 나올 수 있습니다.', '가격이 빠지는데 롱 비율이 높아 롱 정리가 이어질 여지가 있습니다.'],
        ['blitz', '반등을 기다렸다가 20 이동평균에서 막히는 걸 보고 숏입니다.', '바로 숏을 잡기보다 20 이동평균까지 반등을 기다립니다. 거기서 윗꼬리가 나오면 진입합니다.'],
        ['guard', '50 이동평균 위로 마감하면 판정이 틀린 것이니 바로 정리합니다.', '손절은 50 이동평균 위 마감입니다. 청산 거리보다 가까워 계획대로면 문제없습니다.'],
        ['ace', '숏 판정 · 확신도 64. 반등이 막히는 걸 확인하고 진입합니다.', '하락 추세가 이어지고 롱 쏠림이 남아 숏으로 판정합니다. 50 이동평균 위 마감이면 무효입니다.'],
      ] },
    { symbol: 'SOL', side: 'LONG', conf: 61, ago: 19, rr: 1.4,
      entry: '박스 위쪽 돌파 마감 확인 뒤 롱', stop: '박스 안으로 다시 들어오면 무효', target: '박스 높이만큼 위 · 증거금 +10% 부근',
      turns: [
        ['taro', '네 시간째 박스권인데 위쪽을 두 번 두드렸고 거래량이 붙기 시작했습니다.', '박스 위쪽을 두 번 시험했고 마지막 시험에서 거래량이 평균보다 많았습니다. 돌파가 나오면 방향이 정해집니다.'],
        ['vibe', '센티먼트는 중립, 펀딩비는 낮아서 롱이 붐비지 않습니다.', '롱이 붐비지 않아 돌파가 나오면 따라붙는 매수가 나올 여지가 있습니다.'],
        ['blitz', '돌파 마감을 보고 들어갑니다. 미리 들어가지 않습니다.', '박스 위쪽 돌파 5분봉 마감을 확인하고 진입합니다. 박스 안으로 다시 들어오면 정리합니다.'],
        ['guard', '박스가 좁아 손절도 가깝습니다. 계획대로면 감당할 수 있습니다.', '손절이 박스 안쪽이라 가깝고 청산 거리 안에 있습니다.'],
        ['ace', '롱 판정 · 확신도 61. 박스 위 돌파 확인 뒤 진입합니다.', '돌파 준비 모양이 나와 롱으로 판정하되 확인 뒤에만 들어갑니다.'],
      ] },
    { symbol: 'XRP', side: 'SHORT', conf: 57, ago: 27, rr: 1.4,
      entry: '직전 저점 아래 마감 확인 뒤 숏', stop: '20 이동평균 위 마감 시 무효', target: '다음 지지대 · 증거금 +10% 부근',
      turns: [
        ['taro', '직전 저점을 다시 시험하는 중이고 반등 힘이 약합니다.', '반등 때마다 거래량이 줄고 RSI가 45 아래에 머뭅니다.'],
        ['vibe', '심리는 중립 아래, 큰 쏠림은 없습니다.', '뉴스 흐름이 조용하고 심리는 조금 약한 쪽입니다.'],
        ['blitz', '저점 아래 마감이 나오면 짧게 숏입니다.', '직전 저점 아래 5분봉 마감을 확인하고 진입합니다.'],
        ['guard', '확신이 높지 않으니 손절은 짧게 둡니다.', '확신도가 낮은 편이라 손절선은 20 이동평균 위 마감으로 짧게 잡습니다.'],
        ['ace', '숏 판정 · 확신도 57. 저점 아래 마감을 확인하고 짧게 갑니다.', '약세 흐름이지만 힘이 크지 않아 확인 뒤 짧게 숏으로 판정합니다.'],
      ] },
  ];
  function anaId(sym) {
    var h = 0x811c9dc5;
    var s = 'review|' + sym;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    var x = (h.toString(16) + '00000000').slice(0, 8) + ((h >>> 3) ^ 0x5a5a).toString(16);
    return 'a' + (x + '000000000000').slice(0, 12);
  }
  function makeAna(src) {
    var long = src.side === 'LONG';
    var ace = src.turns[src.turns.length - 1];
    return {
      v: 1, id: anaId(src.symbol), at: T_OPEN - src.ago * MIN, symbol: src.symbol, display: src.symbol, kind: 'crypto', mode: 'scalp',
      action: long ? 'BUY' : 'SELL', confidence: src.conf, pm: null, entry: src.entry, stop: src.stop, target: src.target,
      rationale: ace[2], report: src.turns.map(function (t) { return STAFF[t[0]][0] + ': ' + t[2]; }).join('\n\n'),
      scalp: { bias: src.side, entry: src.entry, stop: src.stop, target: src.target, note: '확인 뒤 진입 · 손절선은 옮기지 않음' },
      plan: null, rr: src.rr, riskOk: true,
      turns: src.turns.map(function (t) { return turn(t[0], t[1], t[2]); }), news: [],
    };
  }
  var ANA = {};
  ANA_SRC.forEach(function (x) { ANA[x.symbol] = makeAna(x); });
  // 그 밖 종목(사무실 입력칸에 친 것)은 같은 꼴로 그 자리에서 만든다 — 정밀 분석은 늘 재생으로 답함
  function anaFor(sym) {
    if (!ANA[sym]) {
      var n = 0;
      for (var i = 0; i < sym.length; i++) n += sym.charCodeAt(i);
      var base = ANA_SRC[n % ANA_SRC.length];
      ANA[sym] = makeAna({ symbol: sym, side: base.side, conf: 55 + (n % 9), ago: 6, rr: base.rr, entry: base.entry, stop: base.stop, target: base.target, turns: base.turns });
    }
    return ANA[sym];
  }
  var headOf = function (a) { return { id: a.id, at: a.at, symbol: a.symbol, display: a.display, action: a.action, confidence: a.confidence, bias: a.scalp.bias }; };
  var TRIAL_LIMIT = 5;
  function latest() {
    var a = ANA.BTC;
    var every = 10 * MIN;
    var next = a.at + every;
    while (next <= NOW()) next += every;
    return { ok: true, v: 1, up: true, stale: false, off: false, analysis: a,
      autopilot: { on: true, intervalMin: 10, nextAt: next, running: false, runningSymbol: null, lastRunAt: a.at, waiting: false },
      bySymbol: ANA_SRC.map(function (x) { return headOf(ANA[x.symbol]); }), levelsMaxMin: 60,
      sched: { up: true, symbols: ANA_SRC.map(function (x) { return x.symbol; }), running: false, runningSymbol: null, request: true, lastOkAt: a.at } };
  }
  // 정밀 분석(POST /v1/analysis/request) — 늘 그 종목의 최신 분석 재생(ready fresh). 활성화 전 기기는 체험 하루 5회(다 쓰면 limited trial)
  function analysisRequest(body, member) {
    var req = function (state, over) {
      return Object.assign({ ok: true, v: 1, state: state, ticket: null, symbol: null, ahead: 0, etaSec: 0, elapsedSec: 0, id: null, reason: null }, over || {});
    };
    if (!body || body.v !== 1 || typeof body.symbol !== 'string' || !/^[A-Z0-9]{1,20}$/.test(body.symbol)) return { status: 400, body: { ok: false, error: 'bad_request' } };
    var a = anaFor(body.symbol);
    S.requests.push(body.symbol);
    if (!member) {
      if (S.trialUsed >= TRIAL_LIMIT) return { status: 200, body: req('limited', { symbol: body.symbol, id: ANA.BTC.id, reason: 'trial' }) };
      S.trialUsed += 1;
    }
    return { status: 200, body: req('ready', { symbol: body.symbol, id: a.id, reason: 'fresh' }) };
  }
  function itemOf(id) {
    var k = Object.keys(ANA).filter(function (s) { return ANA[s].id === id; })[0];
    return k ? ANA[k] : null;
  }

  // 가짜 허브 길 하나 — { status, body, stream? }. 테스트(test/tools-pro-review.test.mjs)도 이 함수를 직접 부른다
  function route(method, path, query, headers, bodyText) {
    var body = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch (e) { body = null; }
    var auth = headers && (headers.authorization || headers.Authorization);
    var tok = typeof auth === 'string' && auth.indexOf('Bearer ') === 0 ? auth.slice(7) : null;
    var member = tok != null && S.tokens[tok] === true;
    var J = function (status, b) { return { status: status, body: b }; };
    if (method === 'POST' && path === '/v1/member/verify') {
      if (!body || typeof body.uid !== 'string' || ['s', 'j', 'g'].indexOf(body.edition) < 0) return J(400, { ok: false, error: 'bad_request' });
      if (String(body.uid).trim().toUpperCase() !== REVIEW_UID) return J(200, { ok: false, error: 'not_verified' });
      var t = 'pm1.review' + b64id(37); // 회원 토큰 꼴 pm1. + 43자(app/lib/member.js TOKEN_RE)
      S.tokens[t] = true;
      // 투빗을 아는 앱(본문 exs에 tb)에게만 거래소 칸 — 기본 투빗 회원(허브 명단 거래소 tb 흉내)
      var knowsTb = Array.isArray(body.exs) && body.exs.indexOf('tb') >= 0;
      return J(200, Object.assign({ ok: true, token: t, exp: NOW() + 30 * 86400000, test: true, testUntil: NOW() + 30 * 86400000 }, knowsTb ? { ex: S.ex } : {}));
    }
    if (method === 'GET' && path === '/v1/analysis/weather') {
      // 종목마다 조금씩 다르게(변동성 레이더가 순위로 보이게) — BTC·SOL은 고른 날씨 그대로(머리 칩 = 가장 나쁜 것), 나머지는 한두 단계 순하게
      var TIERS = ['clear', 'cloudy', 'storm'];
      var top = Math.max(0, TIERS.indexOf(S.wx));
      var down = [0, 1, 0, 2, 1];
      return J(200, { ok: true, v: 1, at: NOW(), items: SYMS.map(function (x, i) { return { symbol: x, tier: TIERS[Math.max(0, top - (down[i] || 0))] }; }) });
    }
    if (method === 'GET' && path === '/v1/analysis/results') return J(200, { ok: true, v: 1, on: false, items: [], summary: { n: 0, tp: 0, sl: 0, end: 0, open: 0 }, days: 7 });
    if (method === 'GET' && path === '/v1/analysis/latest') return J(200, latest());
    if (method === 'GET' && path.indexOf('/v1/analysis/item/') === 0) {
      var it = itemOf(path.slice('/v1/analysis/item/'.length));
      return it ? J(200, { ok: true, v: 1, analysis: it }) : J(404, { ok: false, error: 'not_found' });
    }
    if (method === 'POST' && path === '/v1/analysis/request') {
      var memberReq = tok != null && S.tokens[tok] === true;
      return analysisRequest(body, memberReq);
    }
    if (method === 'POST' && path === '/v1/analysis/mine') return J(200, { ok: true, v: 1, state: 'single' });
    // 체험 남은 횟수 — 활성화 전 기기(셸은 활성화 회원이면 묻지 않음)
    if (method === 'POST' && path === '/v1/analysis/trial') return J(200, { ok: true, v: 1, limit: TRIAL_LIMIT, left: Math.max(0, TRIAL_LIMIT - S.trialUsed) });
    if ((method === 'GET' && path === '/v1/analysis/gains') || (method === 'POST' && path === '/v1/analysis/gains/mine')) return J(200, { ok: true, v: 1, on: false, items: [] });
    if (method === 'GET' && path === '/v1/auto/state') {
      return J(200, { ok: true, autoOn: true, autoSymbols: ['BTC'], open: [], stats: { since: NOW() - 7 * 86400000, closed: 0, tp: 0, sl: 0, liq: 0, other: 0, unknown: 0 },
        seq: 1, updated: NOW(), stale: false, degraded: false, partner: { up: true } });
    }
    if (method === 'GET' && path === '/v1/auto/events') return J(200, { ok: true, events: [], seq: 1, more: false, gap: false });
    if (method === 'GET' && path === '/v1/candles') return J(200, candles(query));
    if (method === 'GET' && path === '/v1/ox/instruments') {
      return J(200, { ok: true, at: NOW(), items: [{ inst: 'BTC-USDT-PERPETUAL', maxLev: 200, minQty: 0.001, step: 0.001, tick: 0.1, minNotional: 10, active: true }] });
    }
    if (path.indexOf('/v1/member/') === 0 || path === '/v1/ox') {
      if (!member) return J(401, { ok: false, error: 'unauthorized' });
      if (method === 'GET' && path === '/v1/member/state') return J(200, memberState());
      if (method === 'GET' && path === '/v1/member/events') return J(200, { ok: true, events: [], seq: 100, more: false, gap: false });
      if (method === 'GET' && path === '/v1/member/stream') return { status: 200, stream: true };
      if (method === 'POST' && path === '/v1/member/refresh') return J(200, { ok: true, token: null });
      if (method === 'GET' && path === '/v1/member/push') return J(200, { ok: true, on: false, key: null, n: 0 });
      if (method === 'POST' && path === '/v1/member/follow/lease') return J(200, { ok: true, holder: false, until: null, now: NOW(), server: true });
      if (method === 'GET' && path === '/v1/member/server/state') return J(200, serverState());
      if (method === 'GET' && path === '/v1/member/server/pro') settle();
      if (method === 'GET' && path === '/v1/member/server/pro') return J(200, { ok: true, v: 1, pro: S.pro ? { elig: S.pro.elig, on: S.pro.on, ...(Array.isArray(S.proOff) && S.proOff.length ? { off: ['lev', 'storm', 'dca'].filter((k) => S.proOff.includes(k)) } : {}) } : null });
      if (method === 'POST' && path === '/v1/member/server/enroll') {
        S.srv = 'pending';
        S.onAt = NOW() + 2000;
        return J(202, { ok: true, id: rid('e'), now: NOW() });
      }
      if (method === 'POST' && path === '/v1/member/server/off') {
        S.run = false;
        S.srv = 'off';
        return J(200, { ok: true, id: null, now: NOW() });
      }
      if (method === 'POST' && path === '/v1/member/server/cmd') {
        if (!body || typeof body.kind !== 'string' || !body.args || typeof body.args !== 'object') return J(400, { ok: false, error: 'bad_request' });
        if (body.kind === 'settings' && (Object.prototype.hasOwnProperty.call(body.args, 'pro') || Object.prototype.hasOwnProperty.call(body.args, 'proOff')) && S.old) return J(503, { ok: false, error: 'exec_old' });
        var cid = rid('c');
        S.cmds[cid] = { ready: NOW() + 600, result: cmdResult(body.kind, body.args) };
        return J(202, { ok: true, id: cid, now: NOW() });
      }
      if (method === 'GET' && path.indexOf('/v1/member/server/cmd/') === 0) {
        var c = S.cmds[path.slice('/v1/member/server/cmd/'.length)];
        if (!c) return J(404, { ok: false, error: 'not_found' });
        var done = NOW() >= c.ready;
        return J(200, { ok: true, now: NOW(), state: done ? 'done' : 'queued', result: done ? c.result : null });
      }
      if (method === 'POST' && path === '/v1/ox') {
        if (S.ex === 'tb') return J(403, { ok: false, error: 'ex' }); // 투빗 회원은 오렌지엑스 중계를 쓰지 않음(허브와 같음)
        var r = oxCall(body);
        return r ? J(200, { ok: true, ox: r }) : J(403, { ok: false, error: 'not_allowed' });
      }
    }
    return J(404, { ok: false, error: 'not_found' });
  }

  // ── fetch ──
  var realFetch = typeof G.fetch === 'function' ? G.fetch.bind(G) : null;
  var urlOf = function (input) {
    try { return new URL(typeof input === 'string' ? input : (input && input.url) || String(input), G.location ? G.location.href : undefined); } catch (e) { return null; }
  };
  var block = function (what) {
    S.blocked.push(String(what).slice(0, 200));
    return Promise.reject(new TypeError('검토판: 바깥 요청 막음'));
  };
  var wait = function (ms, signal) {
    return new Promise(function (res, rej) {
      var t = setTimeout(res, ms);
      if (signal) signal.addEventListener('abort', function () { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); });
    });
  };
  function fakeFetch(input, init) {
    init = init || {};
    var u = urlOf(input);
    if (!u) return block(input);
    if (LOCAL && u.origin === LOCAL && realFetch) return realFetch(input, init); // 검토판 정적 파일
    if (u.origin !== HUB) return block(u.origin + u.pathname);
    var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
    var headers = {};
    try { new Headers(init.headers || (input && input.headers) || {}).forEach(function (v, k) { headers[k.toLowerCase()] = v; }); } catch (e) { /* 머리글 없음 */ }
    var bodyText = typeof init.body === 'string' ? init.body : null;
    var signal = init.signal;
    return wait(u.pathname === '/v1/member/verify' ? 800 : 120, signal).then(function () {
      var out = route(method, u.pathname, u.search, headers, bodyText);
      if (out.stream) {
        var ctl = null;
        var rs = new ReadableStream({
          start: function (c) { ctl = c; c.enqueue(new TextEncoder().encode(': review\n\n')); },
          cancel: function () { ctl = null; },
        });
        if (signal) signal.addEventListener('abort', function () { try { if (ctl) ctl.error(new DOMException('Aborted', 'AbortError')); } catch (e) { /* 닫힘 */ } });
        return new Response(rs, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'Content-Type': 'application/json' } });
    });
  }
  G.fetch = fakeFetch;

  // ── EventSource(공개 /v1/auto/stream) — 열리기만 하고 보내는 것 없음 ──
  function FakeEventSource(url) {
    var self = this;
    var u = urlOf(url);
    self.url = u ? u.href : String(url);
    self.readyState = 0;
    self.withCredentials = false;
    self._l = {};
    setTimeout(function () {
      if (self.readyState === 2) return;
      if (u && u.origin === HUB) {
        self.readyState = 1;
        self._fire('open', {});
      } else {
        S.blocked.push(self.url);
        self.readyState = 2;
        self._fire('error', {});
      }
    }, 50);
  }
  FakeEventSource.CONNECTING = 0;
  FakeEventSource.OPEN = 1;
  FakeEventSource.CLOSED = 2;
  FakeEventSource.prototype.addEventListener = function (t, fn) { (this._l[t] = this._l[t] || []).push(fn); };
  FakeEventSource.prototype.removeEventListener = function (t, fn) { this._l[t] = (this._l[t] || []).filter(function (x) { return x !== fn; }); };
  FakeEventSource.prototype.close = function () { this.readyState = 2; };
  FakeEventSource.prototype._fire = function (t, ev) {
    ev.type = t;
    ev.target = this;
    var h = this['on' + t];
    if (typeof h === 'function') h.call(this, ev);
    (this._l[t] || []).slice().forEach(function (fn) { fn.call(this, ev); }, this);
  };
  G.EventSource = FakeEventSource;

  // ── WebSocket(가짜 오렌지엑스 — JSON-RPC 흉내, 그 밖 주소는 열리지 않음) ──
  function FakeWebSocket(url) {
    var self = this;
    var u = urlOf(url);
    self.url = u ? u.href : String(url);
    self.readyState = 0;
    self.protocol = '';
    self.binaryType = 'blob';
    self.bufferedAmount = 0;
    self._l = {};
    self._timers = [];
    self._ok = !!u && u.protocol + '//' + u.host === OX_ORIGIN;
    setTimeout(function () {
      if (self.readyState !== 0) return;
      if (self._ok) {
        self.readyState = 1;
        self._fire('open', {});
      } else {
        S.blocked.push(self.url);
        self.readyState = 3;
        self._fire('error', {});
        self._fire('close', { code: 1006, reason: '', wasClean: false });
      }
    }, 40);
  }
  FakeWebSocket.CONNECTING = 0;
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSING = 2;
  FakeWebSocket.CLOSED = 3;
  FakeWebSocket.prototype.addEventListener = FakeEventSource.prototype.addEventListener;
  FakeWebSocket.prototype.removeEventListener = FakeEventSource.prototype.removeEventListener;
  FakeWebSocket.prototype._fire = FakeEventSource.prototype._fire;
  FakeWebSocket.prototype._reply = function (o) {
    var self = this;
    setTimeout(function () { if (self.readyState === 1) self._fire('message', { data: JSON.stringify(o) }); }, 30);
  };
  FakeWebSocket.prototype.send = function (data) {
    if (this.readyState !== 1) throw new DOMException('not open', 'InvalidStateError');
    var m;
    try { m = JSON.parse(String(data)); } catch (e) { return; }
    var t = NOW();
    var base = { jsonrpc: '2.0', id: m.id, usIn: t, usOut: t };
    var self = this;
    if (m.method === '/public/auth') {
      S.keysOn = true;
      this._reply(Object.assign(base, { result: { access_token: rid('fake-at-'), token_type: 'bearer', refresh_token: 'fake-rt', expires_in: 43199,
        scope: 'account:read block_trade:undefined trade:read_write wallet:read' } }));
    } else if (m.method === '/public/subscribe') {
      var ch = (m.params && m.params.channels) || [];
      this._reply(Object.assign(base, { result: ch }));
      ch.forEach(function (c) {
        var mm = /^ticker\.([A-Z0-9]+-USDT-PERPETUAL)\.raw$/.exec(c);
        if (!mm) return;
        var tick = function () {
          if (self.readyState !== 1) return;
          self._fire('message', { data: JSON.stringify({ jsonrpc: '2.0', method: 'subscription', params: { channel: c,
            data: { instrument_name: mm[1], last_price: String(fakePx()), mark_price: String(fakePx() - 1.5), timestamp: String(NOW()) } } }) });
        };
        tick();
        self._timers.push(setInterval(tick, 1000));
      });
    } else if (m.method === '/public/ping' || m.method === '/public/unsubscribe') {
      this._reply(Object.assign(base, { result: {} }));
    } else {
      this._reply(Object.assign(base, { error: { code: 1000, message: 'No service found' } })); // pro_preview 가짜 오렌지엑스와 같은 답 — 앱은 허브 중계(/v1/ox)로 잔고를 읽음
    }
  };
  FakeWebSocket.prototype.close = function (code) {
    if (this.readyState === 3) return;
    this._timers.forEach(clearInterval);
    this._timers = [];
    this.readyState = 3;
    var self = this;
    setTimeout(function () { self._fire('close', { code: code || 1000, reason: '', wasClean: true }); }, 0);
  };
  G.WebSocket = FakeWebSocket;

  // ── 30초 주기(띠 잔고 BALANCE.everyMs·회원 상태)를 2.5초로 — 손잡이로 바꾼 잔고가 곧 보이게(검토판만, 답은 모두 메모리 안) ──
  var realSetInterval = G.setInterval;
  G.setInterval = function (fn, ms) {
    var args = Array.prototype.slice.call(arguments, 2);
    return realSetInterval.apply(G, [fn, ms === 30000 ? 2500 : ms].concat(args));
  };

  // ── 그 밖의 바깥 길 막기 ──
  if (G.XMLHttpRequest && G.XMLHttpRequest.prototype) {
    var realOpen = G.XMLHttpRequest.prototype.open;
    G.XMLHttpRequest.prototype.open = function (method, url) {
      var u = urlOf(url);
      if (!u || u.origin !== LOCAL) {
        S.blocked.push(String(url));
        throw new TypeError('검토판: 바깥 요청 막음');
      }
      return realOpen.apply(this, arguments);
    };
  }
  if (G.navigator) {
    try { if (typeof G.navigator.sendBeacon === 'function') G.navigator.sendBeacon = function () { return false; }; } catch (e) { /* 못 바꿈 */ }
    // 서비스 워커는 검토판에서 쓰지 않는다(아티팩트 하위 경로·iframe — 캐시가 남지 않게, CSP worker-src 'none'과 같이)
    try {
      if (G.navigator.serviceWorker) {
        G.navigator.serviceWorker.register = function () { return Promise.reject(new Error('검토판: 서비스 워커 없음')); };
      }
    } catch (e) { /* 못 바꿈 */ }
  }

  // ── IndexedDB 메모리 흉내(vault.js가 쓰는 만큼 — open·upgradeneeded·objectStore get/put/delete/getAll·거래 complete/abort) ──
  function memIdb() {
    var dbs = {};
    var later = function (fn) { setTimeout(fn, 0); };
    var copy = function (v) {
      if (v === undefined) return undefined;
      try { return structuredClone(v); } catch (e) { return v; }
    };
    function makeDb(name) {
      var stores = {};
      var db = {
        name: name,
        objectStoreNames: { contains: function (n) { return Object.prototype.hasOwnProperty.call(stores, n); } },
        createObjectStore: function (n, opts) { stores[n] = { keyPath: opts && opts.keyPath, map: new Map() }; return {}; },
        close: function () {},
        onversionchange: null,
        transaction: function (names, mode) {
          var list = [].concat(names);
          var pending = 0;
          var aborted = false;
          var finished = false;
          var tx = { error: null, oncomplete: null, onerror: null, onabort: null };
          var check = function () {
            later(function () {
              if (finished || aborted || pending > 0) return;
              finished = true;
              if (typeof tx.oncomplete === 'function') tx.oncomplete({});
            });
          };
          var req = function (fn) {
            var r = { result: undefined, error: null, onsuccess: null, onerror: null };
            pending += 1;
            later(function () {
              if (aborted) return;
              try {
                r.result = fn();
                if (typeof r.onsuccess === 'function') r.onsuccess({ target: r });
              } catch (e) {
                r.error = e;
                tx.error = e;
                if (typeof r.onerror === 'function') r.onerror({ target: r });
                if (typeof tx.onerror === 'function') tx.onerror({});
              }
              pending -= 1;
              check();
            });
            return r;
          };
          tx.abort = function () {
            if (finished || aborted) return;
            aborted = true;
            later(function () { if (typeof tx.onabort === 'function') tx.onabort({}); });
          };
          tx.objectStore = function (n) {
            if (list.indexOf(n) < 0 || !stores[n]) throw new DOMException('no store', 'NotFoundError');
            var st = stores[n];
            var ro = mode !== 'readwrite';
            var guard = function () { if (ro) throw new DOMException('readonly', 'ReadOnlyError'); };
            return {
              get: function (k) { return req(function () { return copy(st.map.get(JSON.stringify(k))); }); },
              getAll: function () { return req(function () { return Array.from(st.map.values()).map(copy); }); },
              put: function (v, k) {
                guard();
                var key = st.keyPath ? v[st.keyPath] : k;
                var val = copy(v);
                return req(function () { st.map.set(JSON.stringify(key), val); return key; });
              },
              delete: function (k) { guard(); return req(function () { st.map.delete(JSON.stringify(k)); return undefined; }); },
            };
          };
          check();
          return tx;
        },
      };
      return db;
    }
    return {
      open: function (name) {
        var r = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
        later(function () {
          var fresh = !dbs[name];
          if (fresh) dbs[name] = makeDb(name);
          r.result = dbs[name];
          if (fresh && typeof r.onupgradeneeded === 'function') r.onupgradeneeded({ target: r });
          if (typeof r.onsuccess === 'function') r.onsuccess({ target: r });
        });
        return r;
      },
      deleteDatabase: function (name) {
        var r = { onsuccess: null };
        delete dbs[name];
        later(function () { if (typeof r.onsuccess === 'function') r.onsuccess({}); });
        return r;
      },
    };
  }
  try {
    Object.defineProperty(G, 'indexedDB', { configurable: true, enumerable: true, value: memIdb() });
  } catch (e) { /* 못 바꿈 — 앱이 메모리 저장소로 감 */ }

  // ── 모의 매매 한 판(2026-11-24): 가짜 서버 상태 BTC 롱 한 건이 신호 → 1차 → 2차 → 3차(평단 내려감) → 익절로 끝(closed로 trades에 남음).
  //    칸은 spiderTrades(서버 상태 trades v2 그대로 — 앱 checkServerState). 끝난 매매의 openedAt은 1차 체결 때, avg는 마지막 평단.
  //    시간표(ms, 속도 1 기준 24초): 신호 0 · 1차 4 · 2차 10 · 3차 16 · 익절 24. S.mockScale로 줄임(점검만 — 막대에는 손잡이 없음)
  var MOCK_STEPS = [
    { at: 0, name: 'signal', stage: 1, avg: null, px: null, state: 'opening' },
    { at: 4000, name: 'stage1', stage: 1, avg: 63600, px: 63600, state: 'open' },
    { at: 10000, name: 'stage2', stage: 2, avg: 63330, px: 63330, state: 'open' },
    { at: 16000, name: 'stage3', stage: 3, avg: 63120, px: 63120, state: 'open' },
    { at: 24000, name: 'tp', stage: 3, avg: 63120, px: 63330, state: 'closed' },
  ];
  // 단계 사이의 조용한 변화(이름 없는 단계 — onTick만 부름): 1차 13칸이 몇 칸씩 체결(평단이 칸 반 간격 13.25씩 내려옴, 가격은 방금 체결한 칸 자리 26.5씩),
  // 2차·3차 조건 시작선에 가격이 닿음(그 차수 칸이 펼쳐짐). 앱은 서버 상태 평단·차수와 지금 가격만 봄
  var MOCK_QUIET = [
    { at: 5500, k: 4 }, { at: 6500, k: 7 }, { at: 7500, k: 10 }, { at: 8500, k: 13 },
    { at: 9000, px: 63100, stage: 1 }, { at: 14500, px: 62790, stage: 2 },
  ];
  var mockTimers = [];
  var mockSeq = 0;
  var mock = {
    steps: MOCK_STEPS.map(function (x) { return x.name; }),
    totalMs: MOCK_STEPS[MOCK_STEPS.length - 1].at,
    stop: function () { mockTimers.forEach(clearTimeout); mockTimers = []; },
    // onStep(이름) — 단계마다(서버 상태를 이미 바꾼 뒤). 끝나면 풀리는 약속
    start: function (onStep, onTick) {
      mock.stop();
      mockSeq += 1;
      var id = 'mk' + mockSeq + Math.floor(NOW() / 1000).toString(36);
      var scale = typeof S.mockScale === 'number' && S.mockScale > 0 ? S.mockScale : 1;
      S.run = true; // 오토 모드 창이 도는 중으로(서버 상태 auto)
      S.srv = 'on';
      if (!S.startedAt) S.startedAt = NOW();
      S.spider = null;
      var firstAt = null;
      return new Promise(function (res) {
        MOCK_QUIET.forEach(function (qs) {
          mockTimers.push(setTimeout(function () {
            var x = S.spider;
            if (!x || x.id !== id || x.state !== 'open' || x.stage !== (qs.stage || 1)) return; // 그 사이 단계가 넘어갔으면 건너뜀
            if (qs.k) { x.avg = 63600 - (qs.k - 1) * 13.25; x.px = 63600 - (qs.k - 1) * 26.5; } else x.px = qs.px;
            if (typeof onTick === 'function') onTick();
          }, Math.round(qs.at * scale)));
        });
        MOCK_STEPS.forEach(function (st, i) {
          mockTimers.push(setTimeout(function () {
            var t = NOW();
            if (st.name === 'stage1') firstAt = t;
            var x = { id: id, stage: st.stage, avg: st.avg, px: st.px, state: st.state, openedAt: firstAt || t, first: firstAt ? MOCK_STEPS[1].avg : null }; // 1차 체결가 63600(1차 체결 뒤부터)
            if (st.state === 'closed') { x.closedAt = t; x.exit = Math.round(st.avg * 1.002 * 10) / 10; x.pnl = 3.9; }
            S.spider = x;
            if (typeof onStep === 'function') onStep(st.name);
            if (i === MOCK_STEPS.length - 1) res(st.name);
          }, Math.round(st.at * scale)));
        });
      });
    },
  };

  // ── 화면 손잡이 ──
  var hideFlag = false;
  function installVisibilityHook(doc) {
    try {
      var d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object.getPrototypeOf(doc)), 'visibilityState')
        || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(doc), 'visibilityState');
      Object.defineProperty(doc, 'visibilityState', { configurable: true, get: function () { return hideFlag ? 'hidden' : (d && d.get ? d.get.call(doc) : 'visible'); } });
    } catch (e) { /* 못 바꿈 */ }
  }
  function visible(el) { return !!el && el.getClientRects().length > 0; }
  function q(sel) { return document.querySelector(sel); }
  function setHash(h) {
    if (location.hash === h) return;
    location.hash = h;
  }
  function waitFor(fn, ms) {
    return new Promise(function (res) {
      var end = Date.now() + (ms || 8000);
      (function tick() {
        var v = null;
        try { v = fn(); } catch (e) { v = null; }
        if (v) return res(v);
        if (Date.now() > end) return res(null);
        setTimeout(tick, 120);
      })();
    });
  }
  function setValue(el, v) {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function proOpen() { var p = document.getElementById('pro-page'); return !!p && !p.hidden; }
  function openPro() {
    return waitFor(function () { return [q('#ar-pro-entry'), q('#ar-pro-entry-run')].filter(visible)[0]; }, 8000).then(function (e) {
      if (e && !proOpen()) e.click();
      return !!e;
    });
  }
  // 상태를 바꾼 뒤 앱이 바로 다시 받게: 숨김→보임(잔고·서버 상태)·#follow 다시 열기(프로 상태·날씨) — 열려 있던 프로 화면은 다시 연다
  function kick() {
    var was = proOpen();
    hideFlag = true;
    document.dispatchEvent(new Event('visibilitychange'));
    hideFlag = false;
    document.dispatchEvent(new Event('visibilitychange'));
    if (location.hash !== '#follow') return Promise.resolve();
    history.replaceState(null, '', '#settings');
    dispatchEvent(new HashChangeEvent('hashchange'));
    return new Promise(function (res) {
      setTimeout(function () {
        history.replaceState(null, '', '#follow');
        dispatchEvent(new HashChangeEvent('hashchange'));
        if (was) setTimeout(function () { openPro().then(res); }, 500);
        else res();
      }, 120);
    });
  }
  function nudge() {
    hideFlag = true;
    document.dispatchEvent(new Event('visibilitychange'));
    hideFlag = false;
    document.dispatchEvent(new Event('visibilitychange'));
  }
  function activate() {
    setHash('#verify');
    return waitFor(function () { var i = q('#verify-uid'); return visible(i) && i; }).then(function (inp) {
      if (!inp) return false;
      setValue(inp, REVIEW_UID);
      var b = q('#verify-submit');
      if (b) b.click();
      return waitFor(function () { var m = q('.verify-msg'); return m && /활성화/.test(m.textContent) && !/확인 중/.test(m.textContent); }, 8000);
    });
  }
  function connectKeys() {
    setHash('#keys');
    return waitFor(function () { var a = q('#keys-api'); return visible(a) && a; }).then(function (a) {
      if (!a) return false;
      setValue(a, 'review-client');
      setValue(q('#keys-secret'), 'review-secret');
      var b = q('#keys-submit');
      if (b) b.click();
      // 투빗 회원은 키를 이 기기에 저장만(거래소 로그인 없음) — 저장됨 줄, 오렌지엑스 회원은 가짜 오렌지엑스 WS 로그인까지
      return waitFor(function () {
        var k = q('.keys-ok');
        return visible(k) && k.textContent.trim() !== '' && (S.ex === 'tb' || S.keysOn);
      }, 15000);
    });
  }
  // 투빗 회원도 같은 프로 화면(2026-11-23 대표 결정 — 투빗은 가변 배율 닫힘이라 배율 글 없음)
  function goPro() {
    setHash('#follow');
    return openPro();
  }
  // 거미줄 보기(프로 회원 차트 연출): 활성화 → 프로 켬 → 트레이딩 탭 BTC 차트 — 1차 13칸이 깔리고 몇 칸씩 체결, 2차 조건 켜짐(칸 펼쳐짐)·체결(평단 내려감), 3차 조건 켜짐, 14초 뒤 익절로 끝
  var SPIDER_MSG = '1차 13칸 체결 · 6초 2차 켜짐 · 8초 2차 체결 · 10초 3차 켜짐 · 14초 익절';
  var spiderTimers = [];
  function spiderShow() {
    mock.stop();
    var memberOn = Object.keys(S.tokens).length > 0;
    return (memberOn ? Promise.resolve(true) : activate()).then(function () {
      apply({ s: 'on' });
      setHash('#follow');
      return kick();
    }).then(function () {
      // 앱이 프로 켜짐을 받은 뒤(오토 모드 창 줄 '켜짐')에 매매를 연다 — 프로가 아니면 거미줄을 그리지 않으므로
      return waitFor(function () { var e = q('#ar-pro-entry .ar-pro-entry-state'); return e && e.textContent === '켜짐'; }, 25000);
    }).then(function () {
      spiderTimers.forEach(clearTimeout);
      var t = NOW();
      S.spider = { stage: 1, avg: 63600, first: 63600, px: 63600, openedAt: t - 25 * 60000, state: 'open' };
      // 서버 상태는 앱이 30초마다 받음 — 바뀔 때마다 숨김→보임으로 바로 다시 받게(검토판만). 2차·끝 시계는 거미줄이 차트에 뜬 때부터
      setHash('#trade');
      var tries = 0;
      return waitFor(function () {
        tries += 1;
        if (tries % 15 === 1) nudge();
        var c = q('.chart-spider');
        return c && !c.hidden;
      }, 20000);
    }).then(function () {
      // 1차 13칸이 깔린 채 몇 칸씩 체결(평단이 칸 반 간격씩 내려옴 — 앱은 평단 변화로 칸 수를 어림, 가격은 방금 체결한 칸 자리) → 2차 조건 시작선에 가격이 닿음(칸 펼쳐짐)
      // → 2차 체결(칸이 밝아지고 평단이 크게 내려옴) → 3차 시작선에 닿음(3차 칸 펼쳐짐) → 가격이 올라와 익절로 끝
      var fill = function (k) { return function () { S.spider.avg = 63600 - (k - 1) * 13.25; S.spider.px = 63600 - (k - 1) * 26.5; nudge(); }; };
      spiderTimers = [
        setTimeout(fill(4), 1200),
        setTimeout(fill(7), 2400),
        setTimeout(fill(10), 3600),
        setTimeout(fill(13), 4800),
        setTimeout(function () { S.spider.px = 63100; nudge(); }, 5600),
        setTimeout(function () { S.spider.stage = 2; S.spider.avg = 63290; S.spider.px = 63290; nudge(); }, 8000),
        setTimeout(function () { S.spider.px = 62760; nudge(); }, 10000),
        setTimeout(function () { S.spider.px = 63380; nudge(); }, 12500),
        setTimeout(function () { S.spider.state = 'closed'; S.spider.closedAt = NOW(); S.spider.exit = 63417; nudge(); }, 14500),
      ];
      return SPIDER_MSG;
    });
  }
  // 모의 매매 한 판 — UID 활성화(안 했으면) → 오토 모드 도는 중 → 단계마다 서버 상태를 바로 다시 받게. 프로 켜짐이면 트레이딩 탭(거미줄), 아니면 오토 모드 창
  var MOCK_MSG = '신호 → 1차 → 2차 → 3차 → 익절 · 약 24초';
  function mockShow() {
    spiderTimers.forEach(clearTimeout);
    var memberOn = Object.keys(S.tokens).length > 0;
    return (memberOn ? Promise.resolve(true) : activate()).then(function () {
      S.spider = null;
      apply({ run: true });
      setHash(S.pro && S.pro.on ? '#trade' : '#follow');
      return kick();
    }).then(function () {
      mock.start(function () { nudge(); }, function () { nudge(); }); // 끝까지 기다리지 않음 — 막대는 바로 풀림
      nudge();
      return MOCK_MSG;
    });
  }
  // 잔고 직접 넣기 — 넣은 값이 가짜 총자산이 되고 프로 판정이 따라감(기준은 규칙 값). 오렌지엑스 회원은 키 연결 흉내가 먼저
  function eqPut(raw) {
    var v;
    try { v = parseEq(raw); } catch (e) { return Promise.resolve('숫자만 넣어 주세요 (0보다 큰 USDT)'); }
    var enter = enterEquity();
    apply({ eq: v });
    var first = S.ex === 'ox' && !S.keysOn && Object.keys(S.tokens).length > 0 ? connectKeys().then(function () { setHash('#follow'); }) : Promise.resolve();
    return first.then(kick).then(function () {
      var shown = v.toLocaleString('en-US', { maximumFractionDigits: 8 });
      if (v >= enter) {
        // 판정 전이 끝나면 앱이 바로 다시 받게
        setTimeout(function () { settle(); nudge(); kick(); }, S.judgeMs + 400);
        return shown + ' USDT 넣음 · 판정 중';
      }
      return shown + ' USDT 넣음 · 기준 미만';
    });
  }
  // '프로 모드란?' 보기 — 프로 화면을 열고 그 버튼을 누름(설명 창이 막대를 덮음 — 닫기로 돌아옴)
  function explainShow() {
    return goPro().then(function () {
      return waitFor(function () { var b = q('#pro-explain-btn'); return visible(b) && b; }, 8000);
    }).then(function (b) {
      if (!b) return false;
      b.click();
      return '';
    });
  }
  // 사무실 사본을 못 띄우는 곳: 사무실 자리(#panel-office)에 안내 한 줄 — 앱이 그 칸을 다시 채워도(replaceChildren) 다시 붙임, 깨진 그림 칸은 CSS로 가림
  function officeFallback() {
    if (OFFICE_URL) return;
    document.documentElement.classList.add('prv-office-off');
    var panel = document.getElementById('panel-office');
    if (!panel) return;
    var put = function () {
      if (panel.querySelector('.prv-office-note')) return;
      var n = document.createElement('p');
      n.className = 'prv-office-note';
      n.textContent = OFFICE_NOTE;
      panel.prepend(n);
    };
    put();
    try { new MutationObserver(put).observe(panel, { childList: true }); } catch (e) { /* 한 번만 */ }
  }
  // 회원 거래소 바꾸기 — 주소 ?ex=를 바꿔 새로 엶(메모리 저장이라 UID 활성화부터 다시)
  function switchEx(ex) {
    var u = new URL(location.href);
    if (ex === 'ox') u.searchParams.set('ex', 'ox');
    else u.searchParams.delete('ex');
    u.hash = '';
    location.replace(u.toString());
    return new Promise(function () {});
  }

  function buildBar() {
    var el = function (tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    document.documentElement.classList.add('pro-review');
    var bar = el('div', 'prv-bar');
    bar.id = 'prv-bar';
    var head = el('div', 'prv-head');
    var note = el('span', 'prv-note', '내부 검토판 · 실제 주문 없음');
    var tog = el('button', 'prv-toggle', '검토 ▲');
    tog.type = 'button';
    head.append(note, tog);
    var body = el('div', 'prv-body');
    body.hidden = true;
    tog.addEventListener('click', function () {
      body.hidden = !body.hidden;
      tog.textContent = body.hidden ? '검토 ▲' : '접기 ▼';
    });
    var msg = el('p', 'prv-msg');
    var busy = false;
    var btns = [];
    var run = function (b, fn) {
      if (busy) return;
      busy = true;
      msg.textContent = '바꾸는 중…';
      Promise.resolve().then(fn).then(function (out) {
        msg.textContent = typeof out === 'string' ? out : out === false ? '다시 눌러 주세요' : '';
      }, function () { msg.textContent = '다시 눌러 주세요'; }).then(function () { busy = false; paint(); });
    };
    var group = function (title, items) {
      var g = el('div', 'prv-group');
      g.append(el('div', 'prv-title', title));
      var row = el('div', 'prv-row');
      items.forEach(function (it) {
        var b = el('button', 'prv-btn', it.label);
        b.type = 'button';
        b.dataset.key = it.key || '';
        b.addEventListener('click', function () { run(b, it.go); });
        row.append(b);
        btns.push({ b: b, on: it.on });
      });
      g.append(row);
      return g;
    };
    // 잔고 직접 넣기: 숫자 칸 + 넣기
    var eqGroup = function () {
      var g = el('div', 'prv-group');
      g.append(el('div', 'prv-title', '잔고 직접 넣기'));
      var row = el('div', 'prv-row');
      var inp = el('input', 'prv-in');
      inp.type = 'text';
      inp.id = 'prv-eq';
      inp.setAttribute('inputmode', 'decimal');
      inp.setAttribute('placeholder', '총자산 USDT');
      inp.setAttribute('autocomplete', 'off');
      var b = el('button', 'prv-btn', '넣기');
      b.type = 'button';
      b.id = 'prv-eq-go';
      var go = function () { run(b, function () { return eqPut(inp.value); }); };
      b.addEventListener('click', go);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      row.append(inp, b);
      g.append(row);
      return g;
    };
    var needKeys = function (k) { return S.ex === 'ox' && SCEN[k].eq != null && !S.keysOn; }; // 투빗 회원 잔고는 서버 상태 bal(키 연결과 무관)
    var scen = function (k) {
      return { key: k, label: SCEN[k].label, on: function () { return S.s === k; }, go: function () {
        apply({ s: k });
        var first = needKeys(k) ? connectKeys().then(function () { setHash('#follow'); }) : Promise.resolve();
        return first.then(kick);
      } };
    };
    body.append(
      el('p', 'prv-uid', '검토용 UID ' + REVIEW_UID + ' · ' + (S.ex === 'tb' ? '투빗 회원' : '오렌지엑스 회원')),
      group('회원 거래소(새로 열림)', [
        { label: '투빗 회원', on: function () { return S.ex === 'tb'; }, go: function () { return switchEx('tb'); } },
        { label: '오렌지엑스 회원', on: function () { return S.ex === 'ox'; }, go: function () { return switchEx('ox'); } },
      ]),
      group('순서', [
        { label: '① UID 활성화', go: activate },
        { label: '② 키 연결 흉내', go: function () { return connectKeys().then(function (ok) { setHash('#follow'); return ok; }); } },
        { label: '③ 프로 화면', go: goPro },
      ]),
      group('프로 상태', Object.keys(SCEN).map(scen)),
      eqGroup(),
      group('날씨', Object.keys(WX).map(function (k) {
        return { key: k, label: WX[k], on: function () { return S.wx === k; }, go: function () { apply({ wx: k }); return kick(); } };
      })),
      group('연출', [
        { label: '거미줄 보기', go: spiderShow },
        { label: '프로 모드란? 보기', go: explainShow },
        { label: '모의 매매 한 판', go: mockShow },
      ]),
      group('오토 모드 창', [
        { label: '시작 전', on: function () { return !S.run; }, go: function () { apply({ run: false }); return kick(); } },
        { label: '도는 중', on: function () { return S.run; }, go: function () { apply({ run: true }); return kick(); } },
      ]),
      msg,
    );
    function paint() {
      btns.forEach(function (x) { if (x.on) x.b.classList.toggle('on', !!x.on()); });
    }
    paint();
    bar.append(head, body);
    document.body.append(bar);
  }

  G.__ptfProReview = { route: route, apply: apply, view: view, state: S, REVIEW_UID: REVIEW_UID, HUB: HUB, OX_ORIGIN: OX_ORIGIN,
    REVIEW_BASE: REVIEW_BASE, OFFICE_URL: OFFICE_URL, mock: mock, OFFICE_NOTE: OFFICE_NOTE, ANA: ANA };
  if (typeof document !== 'undefined' && document && typeof document.createElement === 'function' && typeof document.addEventListener === 'function') {
    installVisibilityHook(document);
    var start = function () {
      try { buildBar(); } catch (e) { /* 막대 없이 */ }
      try { officeFallback(); } catch (e) { /* 안내 없이 */ }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
}());
