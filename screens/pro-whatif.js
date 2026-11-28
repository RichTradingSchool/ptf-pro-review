// 프로 모드 화면의 '프로였다면' 칸(대표 결정 2026-11-28) — 프로를 안 쓰는 회원(막대 = 자격 전 · 스위치 끔)에게만, 다시 셈한 이득이 0보다 클 때만 보인다.
// 큰 숫자(+N USDT — 0에서 올라감)·한 줄·'내 결과'/'프로였다면' 막대 둘·안내(자격 전 문턱 · 자격·끔 스위치)·출처 꼬리. 계산은 lib/pro-whatif.js(순수).
// 봉: 화면이 열린 동안만(start/stop), 셈할 매매의 종목마다 허브 5분봉 중계에서 WI_BARS(3200)봉을 한 번에 하나씩 — 받은 뒤 10분은 다시 받지 않음
// (덜 받았거나 실패면 1분 뒤). 숫자 올라가기는 열린 동안·창이 그리기 틀을 줄 때만(움직임 줄이기면 바로 끝 값 — pro-page 효과 숫자와 같은 결).
// DOM은 createElement·textContent·classList만(CSP — style 속성·HTML 문자열 없음, 막대 폭은 CSS 칸 pxe-wNN)
import { AUTO_TEXT } from '../lib/follow-text.js';
import { proWhatif, whatifView, whatifPick, whatifSymbols, WI_BARS } from '../lib/pro-whatif.js';

const RELOAD_MS = 10 * 60000;
const RETRY_MS = 60000;
const COUNT_MS = 900;

export function createProWhatif({
  doc = globalThis.document, win = null, getTrades = () => null, rules = null, dcaRules = null, firstPct = null, tpPct = null,
  isTb = () => false, loadBars = null, now = () => Date.now(),
} = {}) {
  const T = AUTO_TEXT.pro.whatif;
  const node = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const tryGet = (fn) => {
    try {
      return fn();
    } catch {
      return null;
    }
  };
  const el = node('div', 'pro-sec pw');
  el.id = 'pw-box';
  el.hidden = true;
  const title = node('h3', 'pro-sec-title pw-title', T.title);
  const big = node('p', 'pw-big');
  const line = node('p', 'pw-line');
  const cmp = node('div', 'pw-cmp');
  const rowEls = ['mine', 'pro'].map((who) => {
    const row = node('div', `pw-row ${who}`);
    const label = node('span', 'pw-who');
    const track = node('span', 'pw-track');
    const fill = node('span', 'pw-fill');
    track.append(fill);
    const val = node('span', 'pw-val');
    row.append(label, track, val);
    cmp.append(row);
    return { row, label, fill, val };
  });
  const foot = node('p', 'pw-foot');
  const src = node('p', 'pw-src');
  el.append(title, big, line, cmp, foot, src);

  const barsBy = new Map();
  const loadedAt = new Map(); // 종목 → { at, ok }
  let inflight = false;
  let running = false;
  let epoch = 0;
  let lastView = null;
  let target = null;
  let raf = 0;
  const reduced = () => !!(win && typeof win.matchMedia === 'function' && tryGet(() => win.matchMedia('(prefers-reduced-motion: reduce)').matches) === true);
  const canCount = () => running && !!win && typeof win.requestAnimationFrame === 'function' && !reduced();
  const stopCount = () => {
    if (raf && win && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(raf);
    raf = 0;
  };
  const numText = (n, v) => `${n.sign}${v.toFixed(n.digits)}${n.unit}`;
  function countTo(n) {
    if (target === n.text) return;
    target = n.text;
    stopCount();
    if (!canCount()) { big.textContent = n.text; return; }
    let t0 = null;
    const step = (ts) => {
      raf = 0;
      if (t0 == null) t0 = ts;
      const p = Math.min(1, (ts - t0) / COUNT_MS);
      big.textContent = p >= 1 ? n.text : numText(n, n.from + (n.value - n.from) * (1 - (1 - p) ** 3));
      if (p < 1) raf = win.requestAnimationFrame(step);
    };
    big.textContent = numText(n, n.from);
    raf = win.requestAnimationFrame(step);
  }

  const picked = () => whatifPick(tryGet(getTrades));
  function due(sym) {
    const x = loadedAt.get(sym);
    const t = tryGet(now) ?? Date.now();
    return !x || t - x.at >= (x.ok ? RELOAD_MS : RETRY_MS);
  }
  async function load(sym) {
    const my = epoch;
    inflight = true;
    const at = tryGet(now) ?? Date.now();
    loadedAt.set(sym, { at, ok: false });
    let got = null;
    try {
      got = await loadBars(sym, WI_BARS);
    } catch {
      got = null;
    }
    // 닫은 뒤에 온 답도 봉은 남긴다(다시 열 때 바로 씀) — 그리기·다음 받기는 지금 열린 회차만
    if (Array.isArray(got)) {
      barsBy.set(sym, got);
      loadedAt.set(sym, { at, ok: got.length >= WI_BARS - 12 }); // 덜 받았으면(허브가 아직 다 안 가짐) 1분 뒤 다시
    }
    if (my !== epoch) return;
    inflight = false;
    paint();
    pump();
  }
  function pump() {
    if (!running || inflight || typeof loadBars !== 'function' || (doc && doc.hidden === true)) return;
    const sym = whatifSymbols(picked()).find(due);
    if (sym) load(sym);
  }

  function paint() {
    const r = proWhatif(tryGet(getTrades), { barsBy, rules, dcaRules, firstPct, tpPct, isTb: tryGet(isTb) === true });
    const v = whatifView(r, { view: lastView, rules, isTb: tryGet(isTb) === true }, T);
    el.hidden = !v;
    if (!v) {
      stopCount();
      target = null;
      return null;
    }
    countTo(v.num);
    line.textContent = v.line;
    v.bars.forEach((b, i) => {
      const e = rowEls[i];
      e.label.textContent = b.label;
      e.val.textContent = b.text;
      e.fill.className = `pw-fill pxe-w${b.w}${b.neg ? ' neg' : ''}`;
    });
    foot.hidden = v.foot == null;
    foot.textContent = v.foot ?? '';
    src.textContent = v.src;
    return v;
  }

  // view = 화면에 보이는 프로 상태(pro-page shownNow)
  function refresh(view) {
    lastView = view || null;
    const v = paint();
    pump();
    return v;
  }
  function start() {
    if (running) return;
    running = true;
    target = null; // 열 때마다 숫자를 처음부터
    paint();
    pump();
  }
  function stop() {
    if (!running) return;
    running = false;
    epoch += 1;
    inflight = false; // 늦게 온 답은 epoch가 달라 이 값을 건드리지 않음
    for (const [sym, x] of loadedAt) if (!x.ok && !barsBy.has(sym)) loadedAt.delete(sym); // 받다 닫은 종목은 다시 열면 바로 다시
    if (raf) { stopCount(); if (target != null) big.textContent = target; }
  }
  return { el, refresh, start, stop };
}
