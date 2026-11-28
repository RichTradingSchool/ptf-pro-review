// 프로 모드 화면(2026-11-23 — 앱 주인이 고른 방향: 오토 모드 창의 '프로 모드 ›' 줄을 누르면 따로 열리는 화면). 오토 모드 창(screens/auto-run.js)이 만들어
// 자기 본문(#follow-body) 끝에 붙인다 — 덮는 화면(.screen) 안의 position:fixed 칸이라 화면 머리까지 덮는다(app.css .pro-page).
// - 머리: [← 돌아가기](닫기)·제목 '프로 모드'·날씨 칩(공개 날씨 — 고른 종목 중 가장 나쁜 것, 아이콘은 꾸밈 클래스 clear·cloudy·storm의 ::before)
// - 상태 칸 하나(proStateParts): 10,000 미만 = 남은 금액 글·<progress>·'총자산 지금 / 10,000'(잔고 모름이면 막대·총자산 줄 숨김) | 판정 전 = '잔고 확인 중 …' |
//   자격 = 켬·끔 스위치 + 바로 아래 하는 일 한 줄 + 결과 한 줄(업데이트 필요 'exec_old' 포함 — 스위치 바로 아래)
// - '프로였다면'(2026-11-28 대표 결정 — screens/pro-whatif.js): 상태 칸 바로 아래, 프로를 안 쓰는 회원에게만·다시 셈한 이득이 0보다 클 때만
// - '프로 기능'(2026-11-27 대표 요청 — 옛 '프로에서 달라지는 것' 글 줄 셋을 바꿈, 계산은 lib/pro-view.js proOptionsModel): 한눈 칸(켠 기능 수 고리·
//   '모두 켜면' 효과 칩 — 켠 것만 불 들어옴·꺼 둔 기능 N개·[모두 켜기]) + 기능 카드(배율 자동 — 가변 배율 글을 보일 때만·폭풍 비중 줄임·추가 진입 속도 조절 —
//   dcaShift가 있을 때만·거미줄 차트) — 카드마다 움직이는 작은 그림(app.css 키프레임, 화면이 열린 동안만 .po.run·움직임 줄이기면 멈춤)·이름·한 줄·효과 숫자
//   (열 때·켤 때 숫자가 올라감 — requestAnimationFrame, 움직임 줄이기·창 없음이면 바로 끝 값)·켬/끔 토글·'다음 매매부터 적용'.
//   서버 기능 토글 = onProOff(정렬·중복 없는 꺼 둠 배열 — settings { proOff }), 누른 값은 스위치와 같게 PRO_HOLD_MS 지킴·같은 답을 보면 풂, 실패 글도 스위치와 같음.
//   거미줄 토글은 이 기기 화면 연출만(onSpiderOff — app.js가 localStorage에 적고 차트 거미줄을 다시 그림, 서버에 보내지 않음).
//   자격 없음(막대)이면 카드는 켠 모양으로 보이되 토글 잠김 + 문턱 글, 프로 스위치가 꺼져 있으면 토글은 되고 '프로를 켜면 적용'
// - 날씨 뜻 세 줄
// 투빗 회원(isTb)도 같은 화면(대표 결정 2026-11-23) — 가변 배율은 닫혀 있어(실측 전) levOn이 늘 거짓: 하는 일·기능 카드·확인 창 모두 배율 글 없음
// 스위치: 켬은 확인 창(confirmFn — confirm(levOn) 그대로) 뒤에만, 끔은 확인 없이(onPro — settings {pro}). 누른 값은 보내는 동안·보낸 뒤 PRO_HOLD_MS 지키고 같은 답을 보면 풂.
// 닫기: [← 돌아가기]·Esc·휴대폰 뒤로가기(열 때 history 한 칸을 쌓고 popstate로 닫음 — 입금·사용 가이드 창 guide-view.js와 같음). 열린 동안 html.pro-open.
// DOM은 createElement·textContent만(CSP — style 속성·HTML 문자열 없음, 막대는 <progress> 값만)
import { AUTO_TEXT } from '../lib/follow-text.js';
import {
  proView, proStateParts, proLevOn, wxTier, explainScenes, explainSummary, PRO_HOLD_MS, WX_TIERS,
  proOptionsModel, proOffOf, normProOff, sameProOff, PRO_OPT_KEYS,
} from '../lib/pro-view.js';
import { createProExplain } from './pro-explain.js';
import { cmdErrText } from '../lib/server-cmd-flow.js';
import { createRadarList } from './pro-radar.js';
import { createEntryQuality } from './entry-quality.js';
import { createProWhatif } from './pro-whatif.js';

export const PRO_OPEN_CLASS = 'pro-open';
const rootOf = (doc) => (doc && doc.documentElement && doc.documentElement.classList ? doc.documentElement : null);

export function createProPage({
  doc = globalThis.document, win = globalThis.window, proRules = null, firstPct = null,
  getPro = () => null, getTrades = () => null, getEquity = () => null, getWeather = () => null, getSymbols = () => [], isTb = () => false,
  onPro = async () => ({ ok: false, error: 'down' }), confirmFn = (m) => globalThis.confirm(m), now = () => Date.now(),
  onChange = () => {}, onOpen = () => {}, onClose = () => {},
  loadBars = null, getPx = () => null, // 변동성 게이지 바늘 재료(app.js — 허브 5분봉 중계·지금 시세)
  // 프로 기능 카드(2026-11-27): 기본 배율(맑음 수익 배수의 밑 — 규칙 autoRun.lev)·서버 기능 꺼 둠 보내기(settings { proOff })·거미줄 화면 끄기(이 기기만)
  baseLev = null, onProOff = async () => ({ ok: false, error: 'down' }), getSpiderOff = () => false, onSpiderOff = () => {},
  // '프로였다면' 칸(2026-11-28): 추가 진입 표(빌드 CONFIG.dcaRules — 차수 증거금 몫)·오토 모드 익절 %(규칙 autoRun.tpPct — 익절로 끝난 매매 알아보기)
  dcaRules = null, tpPct = null,
} = {}) {
  const T = AUTO_TEXT.pro;
  const node = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const button = (cls, text, id = null) => {
    const b = node('button', cls, text);
    b.type = 'button';
    if (id) b.id = id;
    return b;
  };
  const tryGet = (fn) => {
    try {
      return fn();
    } catch {
      return null;
    }
  };
  const tbNow = () => tryGet(isTb) === true;
  const levOn = () => proLevOn(proRules, { isTb: tbNow() });
  const enter = proRules && proRules.qualify ? proRules.qualify.enterEquity : null;

  const root = node('div', 'pro-page');
  root.id = 'pro-page';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', T.title);
  root.hidden = true;
  // ── 머리 ──
  const top = node('div', 'pro-top');
  const back = button('back-btn pro-back', T.back, 'pro-back');
  back.addEventListener('click', () => close());
  const title = node('h2', 'pro-title', T.title);
  const wx = node('span', 'pro-wx');
  wx.hidden = true;
  top.append(back, title, wx);
  // ── 상태 칸 ──
  const box = node('div', 'pro-state');
  const stText = node('p', 'pro-state-text');
  const stBar = node('progress', 'pro-bar');
  stBar.max = 1;
  stBar.value = 0;
  stBar.setAttribute('aria-label', T.title);
  const stSub = node('p', 'pro-state-sub');
  const swRow = node('div', 'pro-sw-row');
  const chips = node('div', 'ar-chips');
  swRow.append(node('div', 'pro-sw-label', T.switchLabel), chips);
  const sws = [['on', AUTO_TEXT.on, true], ['off', AUTO_TEXT.off, false]].map(([v, label, val]) => {
    const b = button('ar-chip pro-sw', label);
    b.dataset.v = v;
    b.addEventListener('click', () => { choose(val); });
    chips.append(b);
    return b;
  });
  const does = node('p', 'pro-does');
  const msg = node('p', 'pro-msg');
  msg.setAttribute('role', 'status');
  // '프로 모드란?'(2026-11-23) — 막대 화면·자격 화면 모두 상태 칸 맨 아래, 누르면 전체 화면 설명 연출(screens/pro-explain.js)
  const explainBtn = button('pro-explain-btn', T.explainBtn, 'pro-explain-btn');
  box.append(stText, stBar, stSub, swRow, does, msg, explainBtn);
  // 배율 규칙(lev.on)에 따라 하는 일 한 줄 — refresh마다 같은 값이면 그대로(규칙 객체가 바뀌면 따라감)
  let levShown = null;
  const paintLev = () => {
    const lv = levOn();
    if (lv === levShown) return;
    levShown = lv;
    does.textContent = lv ? T.doesLev : T.does;
  };
  paintLev();
  // ── 프로 기능(한눈 칸 + 기능 카드) ──
  const O = T.opts;
  const opts = node('div', 'pro-sec po');
  const hero = node('div', 'po-hero');
  const ring = node('div', 'po-ring p100');
  const ringNum = node('span', 'po-ring-num');
  const ringLabel = node('span', 'po-ring-label', O.ringOn);
  ring.append(ringNum, ringLabel);
  const heroMain = node('div', 'po-hero-main');
  const chipRow = node('div', 'po-chips');
  const chipEls = new Map(PRO_OPT_KEYS.map((k) => {
    const c = node('span', `po-chip po-chip-${k}`);
    c.dataset.k = k;
    c.hidden = true;
    chipRow.append(c);
    return [k, c];
  }));
  const heroState = node('p', 'po-hero-state');
  const allOn = button('po-allon', O.allOnBtn, 'po-allon');
  allOn.addEventListener('click', () => { allOnNow(); });
  const heroNote = node('p', 'po-hero-note');
  heroMain.append(node('p', 'po-hero-cap', O.heroCap), chipRow, heroState, allOn, heroNote);
  hero.append(ring, heroMain);
  // 카드 그림 조각(모양·움직임은 app.css — 조각은 빈 span, 글자 없음)
  const ART = Object.freeze({
    lev: ['po-dial', 'po-needle', 'po-hub'],
    storm: ['po-cloud', 'po-drop', 'po-drop', 'po-drop', 'po-bar-track', 'po-bar-fill'],
    dca: ['po-entry', 'po-cell', 'po-cell', 'po-cell', 'po-cell', 'po-cell', 'po-cell'],
    spider: ['po-price', 'po-web', 'po-web', 'po-web', 'po-web', 'po-dot'],
  });
  const cardList = node('div', 'po-cards');
  const makeCard = (k) => {
    const c = node('div', `po-card po-${k}`);
    c.dataset.k = k;
    c.hidden = true;
    const art = node('div', `po-art po-art-${k}`);
    art.setAttribute('aria-hidden', 'true');
    for (const cls of ART[k]) art.append(node('span', cls));
    const main = node('div', 'po-main');
    const head = node('div', 'po-head');
    const name = node('h4', 'po-name');
    const tog = button('po-tog');
    tog.dataset.k = k;
    tog.setAttribute('role', 'switch');
    const togText = node('span', 'po-tog-text');
    tog.append(node('span', 'po-tog-knob'), togText);
    tog.addEventListener('click', () => { chooseOpt(k); });
    head.append(name, tog);
    const desc = node('p', 'po-desc');
    const eff = node('div', 'po-eff');
    const label = node('span', 'po-label');
    const big = node('span', 'po-big');
    eff.append(label, big);
    const subs = node('div', 'po-subs');
    const note = node('p', 'po-note');
    main.append(head, desc, eff, subs, note);
    c.append(art, main);
    cardList.append(c);
    return { c, name, tog, togText, desc, label, big, subs, note, target: null, subKey: null, raf: 0 };
  };
  const cardEls = new Map(PRO_OPT_KEYS.map((k) => [k, makeCard(k)]));
  const optMsg = node('p', 'po-msg');
  optMsg.setAttribute('role', 'status');
  opts.append(node('h3', 'pro-sec-title po-title', O.title), hero, cardList, optMsg);
  // ── 날씨 뜻 ──
  const wxSec = node('div', 'pro-sec');
  const wxList = node('ul', 'pro-wx-list');
  for (const tier of WX_TIERS) wxList.append(node('li', `pro-wx-item ${tier}`, T.wxMeaning[tier]));
  wxSec.append(node('h3', 'pro-sec-title pro-wx-title', T.wxTitle), wxList);
  const body = node('div', 'pro-body');
  const radar = createRadarList({ doc, win, getWeather, getSymbols, rules: proRules, loadBars, getPx, now });
  // '프로였다면' 칸(screens/pro-whatif.js — 2026-11-28) — 상태 칸 바로 아래(프로를 안 쓰는 회원·이득이 있을 때만 보임), 그 아래 진입 품질 칸(screens/entry-quality.js)
  const whatif = createProWhatif({ doc, win, getTrades, rules: proRules, dcaRules, firstPct, tpPct, isTb: tbNow, loadBars, now });
  const quality = createEntryQuality({ doc, getTrades, now });
  body.append(box, whatif.el, quality.el, opts, radar.el, wxSec);
  root.append(top, body);
  const explainScenesNow = () => explainScenes({ rules: proRules, firstPct, isTb: tbNow() });
  const explain = createProExplain({ doc, win, host: root, scenes: explainScenesNow, summary: () => explainSummary({ rules: proRules, firstPct, isTb: tbNow(), baseLev }) });
  explainBtn.hidden = explainScenesNow().length === 0;
  explainBtn.addEventListener('click', () => explain.open());

  // ── 상태 ──
  let local = null; // 누른 값 { on, until }
  let busy = false;
  let shownNow = { show: 'none' };
  let isOpen = false;
  let pushed = false;
  let backFocus = null;
  let optLocal = null; // 누른 꺼 둠 { off: [...], until }
  let optBusy = false;
  let optModel = null;

  // 효과 숫자 올라가는 연출 — 화면이 열려 있고 창이 그리기 틀을 줄 때만(움직임 줄이기면 바로 끝 값)
  const COUNT_MS = 700;
  const reduced = () => !!(win && typeof win.matchMedia === 'function' && tryGet(() => win.matchMedia('(prefers-reduced-motion: reduce)').matches) === true);
  const canCount = () => isOpen && !!win && typeof win.requestAnimationFrame === 'function' && !reduced();
  const stopCount = (e) => {
    if (e.raf && win && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(e.raf);
    e.raf = 0;
  };
  const numText = (n, v) => `${n.sign}${v.toFixed(n.digits)}${n.unit}`;
  function countTo(e, n) {
    if (e.target === n.text) return; // 이미 그 값(또는 그 값으로 올라가는 중)
    e.target = n.text;
    stopCount(e);
    if (!canCount()) { e.big.textContent = n.text; return; }
    let t0 = null;
    const step = (ts) => {
      e.raf = 0;
      if (t0 == null) t0 = ts;
      const p = Math.min(1, (ts - t0) / COUNT_MS);
      e.big.textContent = p >= 1 ? n.text : numText(n, n.from + (n.value - n.from) * (1 - (1 - p) ** 3));
      if (p < 1) e.raf = win.requestAnimationFrame(step);
    };
    e.big.textContent = numText(n, n.from);
    e.raf = win.requestAnimationFrame(step);
  }
  const serverOffNow = () => proOffOf(tryGet(getPro));
  const spiderOffNow = () => tryGet(getSpiderOff) === true;

  function paintOpts(shown) {
    const serverOff = serverOffNow();
    if (optLocal && !optBusy && (now() >= optLocal.until || sameProOff(serverOff, optLocal.off))) optLocal = null;
    const m = proOptionsModel({ rules: proRules, firstPct, baseLev, isTb: tbNow(), view: shown, off: optLocal ? optLocal.off : serverOff, spiderOff: spiderOffNow() }, O);
    optModel = m;
    opts.hidden = !m;
    if (!m) return;
    opts.classList.toggle('locked', m.stage === 'locked');
    ring.className = `po-ring p${m.hero.pct}`;
    ringNum.textContent = `${m.hero.on}/${m.hero.total}`;
    ringLabel.textContent = m.hero.ringLabel;
    const byKey = new Map(m.cards.map((c) => [c.key, c]));
    for (const [k, chip] of chipEls) {
      const x = m.hero.chips.find((h) => h.key === k);
      chip.hidden = !x;
      if (!x) continue;
      if (chip.textContent !== x.text) chip.textContent = x.text;
      chip.classList.toggle('on', x.on);
    }
    heroState.textContent = m.hero.state;
    allOn.hidden = !m.hero.allOnBtn;
    allOn.disabled = optBusy;
    heroNote.hidden = m.hero.note == null;
    heroNote.textContent = m.hero.note ?? '';
    for (const [k, e] of cardEls) {
      const cd = byKey.get(k);
      e.c.hidden = !cd;
      if (!cd) { stopCount(e); e.target = null; continue; }
      e.c.classList.toggle('off', !cd.on);
      e.c.classList.toggle('locked', cd.locked);
      e.name.textContent = cd.name;
      e.desc.textContent = cd.desc;
      e.label.hidden = cd.label == null;
      e.label.textContent = cd.label ?? '';
      if (cd.on && cd.num) countTo(e, cd.num);
      else {
        stopCount(e);
        e.target = cd.big;
        e.big.textContent = cd.big;
      }
      const subKey = cd.sub.join('\n');
      if (e.subKey !== subKey) {
        e.subKey = subKey;
        e.subs.replaceChildren(...cd.sub.map((t) => node('p', 'po-sub', t)));
      }
      e.note.textContent = cd.note;
      e.tog.classList.toggle('on', cd.on);
      e.tog.setAttribute('aria-checked', cd.on ? 'true' : 'false');
      e.tog.setAttribute('aria-label', cd.name);
      e.tog.disabled = cd.locked || (optBusy && k !== 'spider');
      e.togText.textContent = cd.on ? AUTO_TEXT.on : AUTO_TEXT.off;
    }
  }

  async function sendOff(next) {
    optBusy = true;
    optLocal = { off: next, until: Infinity };
    optMsg.textContent = '';
    paintOpts(shownNow);
    onChange();
    let r;
    try {
      r = await onProOff(next);
    } catch {
      r = { ok: false, error: 'down' };
    }
    optBusy = false;
    if (r && r.ok === true) optLocal = { off: next, until: now() + PRO_HOLD_MS };
    else {
      optLocal = null;
      optMsg.textContent = r && r.error === 'exec_old' ? T.needUpdate : cmdErrText(r && r.error);
    }
    paintOpts(shownNow);
    onChange();
  }
  const offNow = () => (optLocal ? optLocal.off : serverOffNow());
  function spiderSet(off) {
    try { onSpiderOff(off); } catch { /* 저장 실패는 무시 — 화면은 다음 그리기에서 저장된 값대로 */ }
  }
  function chooseOpt(k) {
    const m = optModel;
    const cd = m && m.stage !== 'locked' ? m.cards.find((c) => c.key === k) : null;
    if (!cd) return;
    if (k === 'spider') {
      spiderSet(cd.on);
      paintOpts(shownNow);
      onChange();
      return;
    }
    if (optBusy) return;
    const cur = offNow();
    sendOff(cd.on ? normProOff([...cur, k]) : normProOff(cur.filter((x) => x !== k)));
  }
  function allOnNow() {
    const m = optModel;
    if (!m || m.stage === 'locked') return;
    if (m.cards.some((c) => c.key === 'spider' && !c.on)) spiderSet(false);
    const shownKeys = new Set(m.cards.map((c) => c.key));
    const cur = offNow();
    const next = normProOff(cur.filter((k) => !shownKeys.has(k)));
    if (!optBusy && !sameProOff(cur, next)) { sendOff(next); return; }
    paintOpts(shownNow);
    onChange();
  }

  function refresh() {
    paintLev();
    quality.refresh();
    const v = proView({ equity: tryGet(getEquity), pro: tryGet(getPro), rules: proRules });
    if (local && !busy && (now() >= local.until || (v.show === 'switch' && v.on === local.on))) local = null;
    const shown = local && v.show === 'switch' ? { show: 'switch', on: local.on } : v;
    shownNow = shown;
    whatif.refresh(shown);
    paintOpts(shown);
    const parts = proStateParts(shown, T, { equity: tryGet(getEquity), enter });
    stText.hidden = parts.text == null;
    stText.textContent = parts.text ?? '';
    stBar.hidden = parts.ratio == null;
    if (parts.ratio != null) stBar.value = parts.ratio;
    stSub.hidden = parts.sub == null;
    stSub.textContent = parts.sub ?? '';
    const sw = parts.stage === 'switch';
    swRow.hidden = !sw;
    does.hidden = !sw;
    msg.hidden = !sw;
    if (sw) {
      for (const b of sws) {
        const on = (b.dataset.v === 'on') === shown.on;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
    const tier = wxTier(tryGet(getWeather), tryGet(getSymbols));
    wx.className = tier ? `pro-wx ${tier}` : 'pro-wx';
    wx.textContent = tier ? T.weather[tier] : '';
    wx.hidden = !tier;
    radar.refresh();
    if (isOpen && shown.show === 'none') close({ silent: true }); // 규칙이 없어지거나 투빗 회원이 됨 — 들어가는 줄도 없음
    return shown;
  }

  async function choose(want) {
    if (busy || shownNow.show !== 'switch' || shownNow.on === want) return;
    if (want === true) {
      let yes = false;
      try {
        yes = confirmFn(T.confirm(levOn())) === true;
      } catch {
        yes = false;
      }
      if (!yes) return;
    }
    busy = true;
    local = { on: want, until: Infinity };
    msg.textContent = '';
    refresh();
    onChange();
    let r;
    try {
      r = await onPro(want);
    } catch {
      r = { ok: false, error: 'down' };
    }
    busy = false;
    if (r && r.ok === true) local = { on: want, until: now() + PRO_HOLD_MS };
    else {
      local = null;
      msg.textContent = r && r.error === 'exec_old' ? T.needUpdate : cmdErrText(r && r.error);
    }
    refresh();
    onChange();
  }

  const onKey = (e) => {
    if (!e || e.key !== 'Escape') return;
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    if (explain.isOpen()) { explain.close(); return; } // 설명 창이 떠 있으면 그것만
    close();
  };
  const onPop = () => { pushed = false; close({ silent: true }); };

  function open() {
    if (isOpen) return true;
    if (refresh().show === 'none') return false;
    isOpen = true;
    backFocus = doc.activeElement || null;
    root.hidden = false;
    const r = rootOf(doc);
    if (r) r.classList.add(PRO_OPEN_CLASS);
    if (doc.addEventListener) doc.addEventListener('keydown', onKey);
    // 휴대폰 뒤로가기 = 닫기 — 같은 주소로 한 칸 쌓는다(hashchange 없음)
    if (win && win.history && typeof win.history.pushState === 'function') {
      try {
        win.history.pushState({ ptfPro: 1 }, '');
        pushed = true;
        if (win.addEventListener) win.addEventListener('popstate', onPop);
      } catch { pushed = false; }
    }
    if (typeof back.focus === 'function') back.focus({ preventScroll: true });
    radar.start(); // 게이지 움직임은 이 화면이 열려 있는 동안만
    whatif.start(); // '프로였다면' 봉 받기·숫자 올라가기도 열린 동안만
    // 기능 카드 그림 움직임·효과 숫자 올라가기도 열린 동안만 — 열 때마다 숫자를 처음부터
    opts.classList.add('run');
    for (const e of cardEls.values()) e.target = null;
    paintOpts(shownNow);
    try { onOpen(); } catch { /* 받기 실패는 무시 */ }
    onChange();
    return true;
  }
  // silent: 뒤로가기·주소가 이미 바뀐 때(쌓은 칸을 되돌리지 않음)
  function close({ silent = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    radar.stop();
    whatif.stop();
    opts.classList.remove('run');
    for (const e of cardEls.values()) {
      if (e.raf) { stopCount(e); if (e.target != null) e.big.textContent = e.target; }
    }
    explain.close();
    root.hidden = true;
    const r = rootOf(doc);
    if (r) r.classList.remove(PRO_OPEN_CLASS);
    if (doc.removeEventListener) doc.removeEventListener('keydown', onKey);
    if (win && win.removeEventListener) win.removeEventListener('popstate', onPop);
    if (!silent && pushed && win && win.history && typeof win.history.back === 'function') win.history.back();
    pushed = false;
    const prev = backFocus;
    backFocus = null;
    if (prev && prev !== doc.body && prev.isConnected === true && typeof prev.focus === 'function') prev.focus();
    try { onClose(); } catch { /* 무시 */ }
    onChange();
  }

  return { el: root, open, close, refresh, isOpen: () => isOpen, shown: () => shownNow, levOn };
}
