// 거미줄 연출(2026-11-23 대표 요청, 2026-11-25 '1% 칸이 촤르륵 깔리는 모양', 같은 날 '진짜 거미줄' 판 — 프로 회원 전용): 트레이딩 탭 차트에 그 회원 오토 모드 매매의 진입 계획을 그린다. 그리기만 — 주문 방식은 그대로(시장가만, D36).
// 보이는 조건: 프로 켜짐(실행기 보고 pro.elig && pro.on)인 회원의 그 종목 열린 오토 매매(서버 상태 trades — 오렌지엑스·투빗 회원 같은 출처). 프로가 아니면 null(지금 차트 그대로).
// 모양: 칸 하나 = 잔고 1% 증거금 주문.
//   1차 = 13칸: 첫 칸은 진입점(1차 체결가 first), 나머지 12칸은 증거금 1%씩 아래(숏이면 위)로. 진입 때 깔린다.
//   2·3·4차: 그 차수 몫의 칸들을 조건 시작선(condPct)부터 1%씩 — 지금 평단 기준(차수가 들어가면 새 평단으로 다시 자리 잡고, 들어간 차수는 본 자리 그대로).
//     미리 보이지 않는다(2026-11-25) — 그 차수 조건이 켜진 순간(또는 체결 때) 처음 나타나 한 번 더 펼쳐진다.
//   칸 수 줄임: 실제 칸 수는 차수 몫(availPct 15·33·약 93)만큼이라 화면에는 round(availPct^0.6)을 6~16으로 잘라 6·8·16칸으로 줄여 그린다(모양·간격만 같게 — 숫자는 안 보임).
//   배율이 50을 넘으면 선 %를 지금 코드처럼 pro-lev stagePctFor(청산 거리 비율로 줄인 값)로 — 실행기 stageLine과 같은 식(가격 = 기준가 × (1 − 방향 × % ÷ (100 × 배율))).
// 칸의 상태: 깔림(p — 진입점에서 칸 자리로 실이 뻗음, 수십 ms 간격) → 도착 불꽃(spark) → 체결(fill — 번쩍 flash 뒤 밝고 굵게). 조건이 켜진 순간 = 그 차수의 시작선에 지금 가격이 닿음
//   (RSI·볼린저 대신 화면이 아는 지금 가격으로 근사, 한 번 켜지면 체결·끝까지 유지). 1차 칸은 평단이 1차 체결가에서 내려온 만큼(평단 = 체결한 칸들의 평균이라는 식) 몇 칸 들어갔는지 어림해 앞칸부터 밝게.
//   평단 선은 체결마다 조금씩 움직인다(프레임 값만 부드럽게 따라감). 익절 = follow-math tpPriceFor와 같은 식(평단·익절 %·배율 — 틱 반올림만 없음).
// 확대(zoom): 1차가 깔릴 때와 2·3·4차가 켜질 때마다 차트가 그 칸 묶음 자리로 잠깐 확대됐다 되돌아온다 — 시간표는 확대 정도 k(0~1)와 보여 줄 가격 범위(lo~hi)만 준다(차트 조작은 modes/trade.js).
//   움직임 줄이기(reduced)면 확대도 없이 끝 모양만. 회원이 차트를 만지면 cancelZoom.
// 그리지 않는 것(CLAUDE.md 규칙 18): 4차 뒤 선·손절 자리·청산가·남은 거리 — 이 파일에는 그 값이 없다(칸도 글도). 이름표는 '1차'~'4차'·'익절' 낱말만, 가격 숫자 없음.
// createSpiderTimeline: 연출 시간표(순수 — 시계를 넘겨받음). frame(지금 가격)이 지금 그릴 것(칸마다 깔림·투명도·굵기·불꽃)을 준다. reduced(prefers-reduced-motion)면 움직임 없이 끝 모양만.
//   화면 그리기는 screens/chart-spider.js(캔버스 — 이 시간표의 frame만 그림)
import { stageRule } from './dca-rules.js';
import { stagePctFor } from './pro-lev.js';
import { dirOf } from './follow-math.js';

export const SPIDER_TEXT = Object.freeze({ stage: (n) => `${n}차`, tp: '익절' });
export const SPIDER_STAGES = Object.freeze([2, 3, 4]);
export const SPIDER_FIRST_CELLS = 13; // 1차 칸 수 — 잔고 1%씩 13칸(첫 칸은 진입점)
// 칸 간격 = 증거금 1%(대표 2026-11-25 '50배 기준 1%' — 가격 간격 1% ÷ 배율, 50배면 0.02%). 1차는 진입점부터 1%마다 13칸(증거금 0~−12%),
// 2·3·4차는 조건 시작선부터 1%마다(그 차수 칸 수만큼)
export const SPIDER_GAP_PCT = 1;
export const SPIDER_MS = Object.freeze({
  ripple: 900, firstStart: 300, firstGap: 40, cellDur: 220, // 1차 칸마다 40ms 간격으로 실이 뻗음(13칸 약 0.5초 — 드르르륵)
  tpStart: 2000, tpDur: 600,
  onGap: 45, fillGap: 30, fillDur: 160, // 조건이 켜져 펼쳐지는 칸(폭발형) · 체결로 밝아지는 칸
  spark: 320, flash: 360, // 도착 불꽃 · 체결 번쩍
  settleAfter: 800, settle: 1200, // 다 깔린 뒤 은은한 정지 모양으로 가라앉는 시간
  zoomIn: 450, zoomHold: 700, zoomOut: 600, // 확대: 들어감 · (깔리는 시간 + 이만큼) 머묾 · 되돌아감
  avg: 600, fade: 700,
});
export const SPIDER_WEB_REST = 0.35; // 정지 모양의 실 진하기(깔리는 동안 1)
export const SPIDER_ZOOM_FILL = 0.4; // 확대했을 때 칸 묶음이 차트 높이에서 차지하는 비율
const FORCE_GAP_DEFAULT = 3; // dca-path FORCE_LIQ_GAP — 규칙 파일이 없을 때 같은 식
const SYM_RE = /^[A-Z0-9]{1,20}$/;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// 서버 상태(checkServerState를 지난 값)에서 그 종목의 열린 오토 매매 하나 | null — 신호 매매만(직접 연 매매·리허설·옛 줄 빼고), 평단·배율이 있는 것
export function spiderTrade(st, symbol) {
  const list = st && st.ok === true && Array.isArray(st.trades) ? st.trades : [];
  if (typeof symbol !== 'string' || !SYM_RE.test(symbol)) return null;
  return list.find((t) => isObj(t) && t.symbol === symbol && t.state === 'open' && t.rehearsal !== true
    && (t.src === undefined || t.src === 'signal') && fin(t.avg) && t.avg > 0 && Number.isInteger(t.lev) && t.lev > 0 && dirOf(t.side) !== 0) || null;
}

// 선 %(실행기 stageLine과 같은 식) — 50배 이하는 표 값 그대로, 넘으면 pro-lev로 줄임
function scaled(pct, lev, proRules) {
  if (!fin(pct)) return null;
  if (!(lev > 50)) return pct;
  const scale = proRules && proRules.dcaScale && fin(proRules.dcaScale.gapPct) ? proRules : { dcaScale: { gapPct: FORCE_GAP_DEFAULT } };
  return stagePctFor(pct, lev, scale);
}
// 차수 n 강제 선 %(실행기 stageLine과 같은 식) | null
export function stageForcePct(dcaRules, n, lev, proRules = null) {
  const rule = stageRule(dcaRules, n);
  return rule ? scaled(rule.forcePct, lev, proRules) : null;
}
// 차수 n 조건 시작선 % | null
export function stageCondPct(dcaRules, n, lev, proRules = null) {
  const rule = stageRule(dcaRules, n);
  return rule ? scaled(rule.condPct, lev, proRules) : null;
}
// 차수 n 칸 수(화면용으로 줄인 값 — 위 머리 설명)
export function stageCells(dcaRules, n) {
  const rule = stageRule(dcaRules, n);
  return rule && fin(rule.availPct) ? Math.max(6, Math.min(16, Math.round(rule.availPct ** 0.6))) : 6;
}

// 익절 % — 오토 모드 고정 값(follow-rules autoRun.tpPct), 없으면 회원 기본값
export function tpPctOf(followRules) {
  const a = followRules && followRules.autoRun;
  if (a && fin(a.tpPct)) return a.tpPct;
  const m = followRules && followRules.member && followRules.member.tpPct;
  return m && fin(m.default) ? m.default : null;
}

const priceAt = (base, dir, lev, pct) => base * (1 - (dir * pct) / (100 * lev));
// n칸의 가격 — pct from → to를 같은 간격으로(마지막 칸은 to 그대로)
function spread(base, dir, lev, from, to, n) {
  const out = [];
  for (let j = 0; j < n; j += 1) out.push(priceAt(base, dir, lev, j === n - 1 ? to : from + ((to - from) * j) / (n - 1)));
  return out;
}

// 그릴 계획 | null(프로 아님·매매 없음·규칙 없음).
//   first = 1차 칸 { label, cells(가격 13개), filled(들어간 칸 수) } | null(1차 체결가를 모르는 옛 줄이 이미 2차 뒤)
//   levels = 아직 안 들어간 차수만 { stage, label, price(끝 칸), start(시작 칸), cells } — 가격은 지금 평단 기준, filled = 들어간 추가 차수 번호
export function spiderPlan({ trade = null, proOn = false, dcaRules = null, proRules = null, followRules = null } = {}) {
  if (proOn !== true || !isObj(trade) || !dcaRules) return null;
  const dir = dirOf(trade.side);
  const { avg, lev } = trade;
  const stage = Number.isInteger(trade.stage) && trade.stage >= 1 ? trade.stage : 1;
  const anchor = fin(trade.first) && trade.first > 0 ? trade.first : (stage === 1 ? avg : null); // 1차 체결가(없으면 1차 때만 평단 = 1차 가격)
  let first = null;
  const c2 = stageCondPct(dcaRules, 2, lev, proRules);
  if (anchor != null && fin(c2) && c2 > 0) {
    const cells = spread(anchor, dir, lev, 0, SPIDER_GAP_PCT * (SPIDER_FIRST_CELLS - 1), SPIDER_FIRST_CELLS);
    let filled = SPIDER_FIRST_CELLS; // 2차가 들어갔으면 1차 칸은 다 찬 것으로
    if (stage === 1) {
      const step = Math.abs(cells[1] - cells[0]);
      const shift = Math.max(0, dir * (anchor - avg)); // 체결한 칸들의 평균 = 평단이니 평단이 내려온 폭 ≈ (들어간 칸 수 − 1) ÷ 2 칸
      filled = step > 0 ? Math.max(1, Math.min(SPIDER_FIRST_CELLS, 1 + Math.round((2 * shift) / step))) : 1;
    }
    first = { label: SPIDER_TEXT.stage(1), cells, filled };
  }
  const levels = [];
  for (const n of SPIDER_STAGES) {
    if (n <= stage) continue;
    const from = stageCondPct(dcaRules, n, lev, proRules);
    const to = stageForcePct(dcaRules, n, lev, proRules);
    if (!fin(from) || !fin(to) || to <= 0) continue;
    const k = stageCells(dcaRules, n);
    const cells = spread(avg, dir, lev, from, from + SPIDER_GAP_PCT * (k - 1), k);
    levels.push({ stage: n, label: SPIDER_TEXT.stage(n), price: cells[cells.length - 1], start: cells[0], cells });
  }
  const tpPct = tpPctOf(followRules);
  const tp = fin(tpPct) ? avg * (1 + (dir * tpPct) / (100 * lev)) : null; // follow-math tpPriceFor와 같은 식(거래소 틱 반올림만 없음 — 그리기용)
  const filled = SPIDER_STAGES.filter((n) => n <= stage);
  return { id: trade.id, symbol: trade.symbol, side: trade.side, at: trade.openedAt, avg, lev, stage, entry: anchor != null ? anchor : avg, first, levels, filled, tp: fin(tp) ? { label: SPIDER_TEXT.tp, price: tp } : null };
}

const ease = (x) => 1 - (1 - x) * (1 - x);
// 연출 시간표 — update(plan)으로 계획을 넣고 frame(지금 가격)으로 지금 그릴 것을 받는다. 매매 하나만(다른 매매가 오면 처음부터)
export function createSpiderTimeline({ now = () => Date.now(), reduced = () => false } = {}) {
  // cur = { id, side, at, entry, t0, stage, ladders: Map(차수 → { n, label, cells, filled, fillAt[], onAt }), tp, avgFrom, avgTo, avgAt, fadeAt, zoom }
  let cur = null;
  const newLadder = (n, label, cells) => ({ n, label, cells, filled: 0, fillAt: cells.map(() => null), onAt: null });
  const gapOf = (n) => (n === 1 ? SPIDER_MS.firstGap : SPIDER_MS.onGap);
  // 확대 시작 — 그 차수 칸 묶음이 차트 높이의 SPIDER_ZOOM_FILL을 차지하게(lo~hi는 그때 보여 줄 가격 범위). 움직임 줄이기면 안 함
  function startZoom(L, t) {
    if (reduced() || !cur) return;
    const ps = L.cells.filter(fin);
    if (ps.length < 2) return;
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    const e = ((hi - lo) * (1 / SPIDER_ZOOM_FILL - 1)) / 2;
    if (!(hi > lo)) return;
    cur.zoom = { t0: t, lo: lo - e, hi: hi + e, hold: (L.cells.length - 1) * gapOf(L.n) + SPIDER_MS.cellDur + SPIDER_MS.zoomHold, prev: zoomAt(t) };
  }
  // 지금 확대 상태 { k(0~1), lo, hi } | null
  function zoomAt(t) {
    const z = cur && cur.fadeAt == null ? cur.zoom : null;
    if (!z) return null;
    const el = t - z.t0;
    const { zoomIn, zoomOut } = SPIDER_MS;
    if (el >= zoomIn + z.hold + zoomOut) {
      cur.zoom = null;
      return null;
    }
    const pk = z.prev ? z.prev.k : 0;
    if (el < zoomIn) {
      const e = ease(clamp01(el / zoomIn));
      return z.prev ? { k: pk + (1 - pk) * e, lo: z.prev.lo + (z.lo - z.prev.lo) * e, hi: z.prev.hi + (z.hi - z.prev.hi) * e } : { k: e, lo: z.lo, hi: z.hi };
    }
    if (el < zoomIn + z.hold) return { k: 1, lo: z.lo, hi: z.hi };
    return { k: 1 - ease(clamp01((el - zoomIn - z.hold) / zoomOut)), lo: z.lo, hi: z.hi };
  }
  function turnOn(L, t) {
    if (L.onAt != null) return;
    L.onAt = reduced() ? t - 1e6 : t;
    startZoom(L, t);
  }
  function fillTo(L, k, t, gap) {
    for (let i = L.filled; i < k && i < L.cells.length; i += 1) L.fillAt[i] = reduced() ? t - 1e6 : t + (i - L.filled) * gap;
    if (k > L.filled) L.filled = Math.min(k, L.cells.length);
  }
  function update(plan) {
    const t = now();
    if (!plan) {
      if (cur && cur.fadeAt == null) cur.fadeAt = reduced() ? t - SPIDER_MS.fade : t;
      return;
    }
    if (!cur || cur.id !== plan.id || cur.fadeAt != null) {
      cur = { id: plan.id, side: plan.side, at: plan.at, entry: plan.entry, t0: reduced() ? t - 1e6 : t, stage: plan.stage, ladders: new Map(), tp: null, avgFrom: plan.avg, avgTo: plan.avg, avgAt: t - 1e6, fadeAt: null, zoom: null };
    }
    cur.stage = plan.stage;
    if (plan.first) {
      let L = cur.ladders.get(1);
      if (!L) {
        L = newLadder(1, plan.first.label, plan.first.cells);
        cur.ladders.set(1, L);
        for (let i = 0; i < plan.first.filled; i += 1) L.fillAt[i] = reduced() ? t - 1e6 : cur.t0 + SPIDER_MS.firstStart + i * SPIDER_MS.firstGap + SPIDER_MS.cellDur; // 처음부터 들어가 있던 칸은 깔리면서 바로 밝게
        L.filled = plan.first.filled;
        if (plan.stage === 1) startZoom(L, t); // 막 열린 1차만 확대 — 이미 2차 뒤인 매매를 처음 보는 때는 확대하지 않음
      } else {
        fillTo(L, plan.first.filled, t, 60);
      }
    }
    for (const l of plan.levels) {
      const old = cur.ladders.get(l.stage);
      if (!old) cur.ladders.set(l.stage, newLadder(l.stage, l.label, l.cells));
      else if (old.filled === 0) old.cells = l.cells; // 새 평단 기준으로 다시 자리 잡음(들어간 차수는 본 자리 그대로)
    }
    for (const n of plan.filled) {
      const L = cur.ladders.get(n);
      if (L && L.filled < L.cells.length) {
        turnOn(L, t);
        fillTo(L, L.cells.length, t, SPIDER_MS.fillGap);
      }
    }
    if (plan.avg !== cur.avgTo) {
      cur.avgFrom = avgNow(t);
      cur.avgTo = plan.avg;
      cur.avgAt = reduced() ? t - 1e6 : t;
    }
    cur.tp = plan.tp ? plan.tp.price : null;
  }
  const avgNow = (t) => cur.avgFrom + (cur.avgTo - cur.avgFrom) * ease(clamp01((t - cur.avgAt) / SPIDER_MS.avg));
  // 지금 차트에 나와 있는 칸·선의 가격들(자동 눈금이 그 자리를 넣게) — 아직 안 켜진 차수 칸은 빠짐
  function shown() {
    if (!cur) return [];
    const out = [cur.avgTo];
    for (const L of cur.ladders.values()) if (L.n === 1 || L.onAt != null || L.filled > 0) out.push(...L.cells);
    if (cur.tp != null) out.push(cur.tp);
    return out.filter(fin);
  }
  function frame(px) {
    if (!cur) return null;
    const t = now();
    const alpha = cur.fadeAt == null ? 1 : clamp01(1 - (t - cur.fadeAt) / SPIDER_MS.fade);
    if (alpha <= 0) {
      cur = null;
      return null;
    }
    const age = t - cur.t0;
    const dir = dirOf(cur.side) || 1;
    // 다음 차수의 조건이 켜졌는지 — 지금 가격이 그 시작선에 닿거나 지나감(한 번 켜지면 유지)
    const next = cur.ladders.get(cur.stage + 1);
    if (next && next.onAt == null && fin(px) && dir * (px - next.cells[0]) <= 0) turnOn(next, t);
    const zoom = zoomAt(t);
    let animating = alpha < 1 || zoom != null;
    const ladders = [];
    for (const n of [1, ...SPIDER_STAGES]) {
      const L = cur.ladders.get(n);
      if (!L) continue;
      const first = n === 1;
      if (!first && L.onAt == null && L.filled === 0) continue; // 켜지기 전 차수 — 아직 안 보임
      const base = first ? cur.t0 + SPIDER_MS.firstStart : L.onAt;
      const gap = gapOf(n);
      const g = first ? 0.35 : 0.5; // 체결 전 밝기(1차는 흐리게, 켜진 차수는 중간)
      const cells = L.cells.map((price, i) => {
        const start = base + i * gap;
        const p = clamp01((t - start) / SPIDER_MS.cellDur);
        const fill = L.fillAt[i] == null ? 0 : clamp01((t - L.fillAt[i]) / SPIDER_MS.fillDur);
        const spark = p >= 1 ? clamp01(1 - (t - start - SPIDER_MS.cellDur) / SPIDER_MS.spark) : 0;
        const flash = L.fillAt[i] != null && t >= L.fillAt[i] ? clamp01(1 - (t - L.fillAt[i]) / SPIDER_MS.flash) : 0;
        if (p < 1 || (L.fillAt[i] != null && fill < 1) || spark > 0 || flash > 0) animating = true;
        return { price, p, fill, spark, flash, a: p * (g + (1 - g) * fill), w: 1 + fill };
      });
      const lastDone = base + (L.cells.length - 1) * gap + SPIDER_MS.cellDur;
      const web = SPIDER_WEB_REST + (1 - SPIDER_WEB_REST) * (1 - clamp01((t - lastDone - SPIDER_MS.settleAfter) / SPIDER_MS.settle));
      if (web > SPIDER_WEB_REST) animating = true;
      const b = first ? null : (t - L.onAt) / 520;
      const burst = b != null && b >= 0 && b < 1 ? b : null; // 켜진 차수 자리에서 퍼지는 폭발 고리
      if (burst != null) animating = true;
      ladders.push({ stage: n, label: L.label, on: true, filled: L.filled, labelA: cells.length ? Math.max(cells[0].a, 0.5 * cells[0].p) : 0, web, burst, cells });
    }
    const tpP = clamp01((age - SPIDER_MS.tpStart) / SPIDER_MS.tpDur);
    const tp = cur.tp == null ? null : { label: SPIDER_TEXT.tp, price: cur.tp, progress: tpP };
    if (tp && tpP < 1) animating = true;
    const ripple = age < SPIDER_MS.ripple ? clamp01(age / SPIDER_MS.ripple) : null;
    if (ripple != null) animating = true;
    const avgP = clamp01((t - cur.avgAt) / SPIDER_MS.avg);
    if (avgP < 1) animating = true;
    return { id: cur.id, side: cur.side, alpha, entry: { price: cur.entry, at: cur.at, ripple }, avg: { price: avgNow(t), a: clamp01((age - SPIDER_MS.firstStart) / 300) }, ladders, tp, zoom, animating };
  }
  return { update, frame, shown, cancelZoom: () => { if (cur) cur.zoom = null; }, clear: () => { cur = null; } };
}
