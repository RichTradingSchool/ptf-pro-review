// 시장 날씨 위젯·변동성 레이더(프로 모드) 순수 계산 — 공개 날씨(GET /v1/analysis/weather → { at, items:[{ symbol, tier }] })만 쓴다.
// - radarRows: 가장 거친 종목부터(폭풍 → 흐림 → 맑음, 같은 단계는 분위 값이 큰 쪽 먼저·그 밖엔 받은 순서). 받은 칸에 분위 pctile(0~1)이 있을 때만 ratio로 쓰고(없거나 범위 밖이면 null — 꾸며 내지 않음)
// - widgetRows: 트레이딩 탭 위 날씨 한 줄 — 프로 자격(pro.elig === true)이고 날씨가 있을 때만 줄을 주고, 아니면 빈 줄(화면이 숨김)
import { rangePct } from './pro-lev.js';
export const RADAR_TEXT = Object.freeze({ title: '변동성 레이더', widgetLabel: '시장 날씨', gaugeWord: '변동성' });

const LEVEL = Object.freeze({ clear: 1, cloudy: 2, storm: 3 });
export const RADAR_SEGS = 3;

export const radarLevel = (tier) => (typeof tier === 'string' && Object.hasOwn(LEVEL, tier) ? LEVEL[tier] : 0);

const ratioOf = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

export function radarRows(weather) {
  const items = weather && Array.isArray(weather.items) ? weather.items : [];
  const seen = new Set();
  const rows = [];
  for (const x of items) {
    if (!x || typeof x.symbol !== 'string' || x.symbol === '' || seen.has(x.symbol)) continue;
    const level = radarLevel(x.tier);
    if (level === 0) continue;
    seen.add(x.symbol);
    rows.push({ symbol: x.symbol, tier: x.tier, level, ratio: ratioOf(x.pctile), at: rows.length });
  }
  rows.sort((a, b) => b.level - a.level || (b.ratio ?? -1) - (a.ratio ?? -1) || a.at - b.at);
  return rows.map(({ at, ...r }, i) => ({ ...r, rank: i + 1 }));
}

export function widgetRows({ pro = null, weather = null } = {}) {
  if (!pro || pro.elig !== true) return [];
  return radarRows(weather);
}

// ── 실시간 변동성 게이지(2026-11-25) ──
// 칸(맑음·흐림·폭풍)의 진실은 허브 날씨다. 허브 계산법(hub/lib/weather.js·pro-rules.json weather): 5분봉 12봉(lev.volBars)의
// 변동폭 R = (최고가 − 최저가) ÷ 종가 × 100 을 봉마다 줄로 만들고, 마지막 R이 그 줄(7일 = historyBars 2016봉) 안에서 차지하는 분위
// P = (R보다 작은 개수) ÷ 개수. P ≥ stormPctile 폭풍, P ≥ cloudPctile 흐림, 그 밖은 맑음.
// 바늘은 앱이 이미 받는 5분봉(허브 /v1/candles)·시세로 같은 식을 셈한 값(분포는 받은 봉 안)이고, 허브 칸 구간 밖으로는 나가지 않는다(clampToTier).
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
export const GAUGE_ZONES = 3;
export const GAUGE_NEAR = 0.045; // 바늘이 칸 경계에서 이만큼 안쪽이면 이웃 칸이 희미하게 켜짐(표시 위치 0~1 기준)
const EDGE = 0.012; // 허브 칸 구간 안쪽 여백(표시 위치) — 바늘이 경계에 걸쳐 다른 칸을 켜지 않게

export function gaugeCuts(rules) {
  const w = rules && rules.weather;
  const cloud = w && fin(w.cloudPctile) ? w.cloudPctile : 0.5;
  const storm = w && fin(w.stormPctile) ? w.stormPctile : 0.8;
  return cloud > 0 && storm > cloud && storm < 1 ? { cloud, storm } : { cloud: 0.5, storm: 0.8 };
}
export const gaugeVolBars = (rules) => (rules && rules.lev && Number.isInteger(rules.lev.volBars) && rules.lev.volBars > 0 ? rules.lev.volBars : 12);

const ZONE_OF = Object.freeze({ clear: 0, cloudy: 1, storm: 2 });
export const zoneOfTier = (tier) => (typeof tier === 'string' && Object.hasOwn(ZONE_OF, tier) ? ZONE_OF[tier] : -1);
// 분위 P → 바늘 표시 위치 0~1 (세 칸을 같은 너비로: 맑음 [0, cloud] → [0, 1/3], 흐림 → [1/3, 2/3], 폭풍 → [2/3, 1])
export function posOfP(p, cuts) {
  const x = Math.min(1, Math.max(0, p));
  if (x < cuts.cloud) return (x / cuts.cloud) / 3;
  if (x < cuts.storm) return (1 + (x - cuts.cloud) / (cuts.storm - cuts.cloud)) / 3;
  return (2 + (x - cuts.storm) / (1 - cuts.storm)) / 3;
}
// 표시 위치를 허브 칸 구간 안으로 묶는다 — 켜지는 칸 = 허브 칸
export function clampToZone(pos, zone) {
  if (zone < 0 || zone >= GAUGE_ZONES || !fin(pos)) return null;
  const lo = zone / GAUGE_ZONES + EDGE;
  const hi = (zone + 1) / GAUGE_ZONES - EDGE;
  return Math.min(hi, Math.max(lo, pos));
}
export const zoneCenter = (zone) => (zone + 0.5) / GAUGE_ZONES;
export const zoneAt = (pos) => Math.min(GAUGE_ZONES - 1, Math.max(0, Math.floor(pos * GAUGE_ZONES)));
// 바늘이 칸 경계 가까이면 이웃 칸 번호(희미하게 켜짐), 아니면 -1
export function nearZone(pos) {
  const z = zoneAt(pos);
  if (z > 0 && pos - z / GAUGE_ZONES < GAUGE_NEAR) return z - 1;
  if (z < GAUGE_ZONES - 1 && (z + 1) / GAUGE_ZONES - pos < GAUGE_NEAR) return z + 1;
  return -1;
}

// 봉(객체 { t, h, l, c }) → 그 봉까지 n봉 변동폭 줄(오래된 것 → 최신). 허브 weatherSeries와 같은 식(rangePct)
export function volSeries(bars, n) {
  if (!Array.isArray(bars) || !Number.isInteger(n) || n < 1) return [];
  const ok = bars.filter((b) => b && Number.isInteger(b.t) && fin(b.h) && fin(b.l) && fin(b.c) && b.c > 0 && b.l > 0 && b.h >= b.l && b.c <= b.h && b.c >= b.l);
  const out = [];
  for (let i = n - 1; i < ok.length; i += 1) {
    const v = rangePct(ok.slice(i - n + 1, i + 1), n);
    if (v !== null) out.push(v);
  }
  return out;
}

// 지금 값: 받은 봉 줄(마지막 봉 = 아직 닫히지 않은 봉, 시세 px가 있으면 그 봉에 반영) → R, 분위 P(= 닫힌 봉 줄에서 R보다 작은 개수 ÷ 개수).
// 닫힌 줄이 MIN_SERIES 미만이면 null — 꾸며 내지 않음
export const MIN_SERIES = 24;
export function gaugeReading({ bars, px = null, volBars = 12 } = {}) {
  if (!Array.isArray(bars) || bars.length < volBars + MIN_SERIES) return null;
  const list = bars.map((b) => ({ ...b }));
  const last = list.at(-1);
  if (fin(px) && px > 0 && last && Math.abs(px / last.c - 1) <= 0.02) { // 봉 출처와 2% 넘게 다른 시세는 안 씀(출처가 다른 가격이 고저를 늘리지 않게)
    last.c = px;
    if (px > last.h) last.h = px;
    if (px < last.l) last.l = px;
  }
  const win = list.slice(-volBars);
  if (win.some((b) => !b || !fin(b.h) || !fin(b.l) || !fin(b.c))) return null;
  const hi = Math.max(...win.map((b) => b.h));
  const lo = Math.min(...win.map((b) => b.l));
  const c = win.at(-1).c;
  if (!(c > 0) || !(hi >= lo)) return null;
  const r = ((hi - lo) / c) * 100;
  const past = volSeries(list.slice(0, -1), volBars);
  if (past.length < MIN_SERIES) return null;
  const k = past.filter((v) => v < r).length;
  return { r, hi, lo, c, k, n: past.length, p: k / past.length };
}

// 바늘 목표(표시 위치) — 허브 칸 안으로 묶음. 반환 live=false면 시세를 못 받아 칸 안 가운데 잔잔히 흔드는 모양
export function gaugeTarget({ tier, reading = null, cuts }) {
  const zone = zoneOfTier(tier);
  if (zone < 0) return null;
  if (!reading) return { zone, pos: zoneCenter(zone), live: false, clamped: false };
  const raw = posOfP(reading.p, cuts);
  const pos = clampToZone(raw, zone);
  return { zone, pos, live: true, clamped: Math.abs(pos - raw) > 1e-9 };
}

// 바늘 한 걸음(스프링 — 튕기며 따라감). 반환 { pos, vel }
export function needleStep({ pos, vel }, target, dt) {
  const d = Math.min(0.05, Math.max(0, dt));
  const k = 60;
  const damp = 7;
  const nv = vel + ((target - pos) * k - vel * damp) * d;
  return { pos: pos + nv * d, vel: nv };
}

// 바늘 떨림(연출 — 값이 아님): 표시 위치에 더하는 작은 흔들림. t는 초. amp는 표시 위치 단위
export function needleSway(t, amp) {
  return amp * (0.55 * Math.sin(t * 5.3) + 0.3 * Math.sin(t * 11.7 + 1.3) + 0.15 * Math.sin(t * 23.1 + 0.4));
}
