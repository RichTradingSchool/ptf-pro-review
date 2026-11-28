// '프로였다면' 칸(대표 결정 2026-11-28 — 동업자 '거미줄로 본 이득 말고 프로 모드였을 때 봤을 이득', '프로 쓰는 회원에겐 안 보이게'):
// 프로를 안 쓰는 회원의 최근 끝난 오토 모드 매매(서버 상태 trades — app/lib/server-exec.js 매매 줄 v1~v3)를 지금 pro-rules 그대로 다시 셈한다.
// 순수 함수만(DOM·시계·저장·받기 없음). 숫자는 받은 값으로 계산한 것 그대로(반올림만) — 손해 본 매매는 손해 그대로 더한다.
//
// 넣은 것
//  - 진입 때 날씨: 비프로 매매에는 날씨 낱말이 없어 그 매매 1차 시각(openedAt)의 5분봉(허브 봉 중계 — 변동성 레이더와 같은 길)으로 다시 판정.
//    허브 hub/lib/weather.js와 같은 식(그 시각까지 historyBars봉 → 닫힌 봉마다 volBars봉 rangePct → 마지막 값의 분포 위치) — 같은 값임은 시험이 허브 함수로 박는다.
//    그 시각 앞에 historyBars봉이 다 없으면(허브와 다른 분포) 셈 밖. 봉 중계 상한 3200봉이면 판정할 수 있는 매매는 최근 약 4.1일((3200 − 2016) × 5분)
//  - 폭풍 1차 줄임(weather.stormFirstCutPct): 폭풍 판정 매매는 1차 증거금 × (1 − cut). 2·3·4차는 실행기처럼 '남은 운용 금액 × 그 차수 비율'이라
//    남은 금액이 커진 만큼(k = (1 − c·f1) ÷ (1 − f1)) 같이 커진다. 차수 몫은 dca-rules(1차 firstPct·2차 15%·3차 33%·4차 min(95, 100 − 배율×0.48)% +
//    마지막 차수 더 넣기 TOPUP_MAX번 — exec/lib/dca-path.js·follow-math dcaMarginFor와 같은 비율, 운용 금액·사용 가능 잔고 상한은 모름 → 비율만)
//    · 손절·정리로 끝난 매매: 같은 체결가·같은 청산가에서 크기만 바뀐 손익(1차 몫 손익은 1차 체결가 first·평단·청산가로 나눔)
//    · 익절로 끝난 매매(resultPct ≈ tpPct): 익절은 평단 기준 같은 증거금 %라 손익 × (새 증거금 ÷ 옛 증거금)
//  - 가변 배율(proLevOn(rules) — 지금 저장소 lev.on false라 효과 없음): 날씨별 배율(levForVol) ÷ 그 매매 배율로 손익 비례(같은 증거금·같은 청산가),
//    익절 매매는 같은 증거금 %라 그대로, 손실은 증거금 밖으로 가지 않음
// 뺀 것(이번 판 — 화면 꼬리 글로 범위를 밝힘): 날씨별 2·3·4차 앞당김(weather.dcaShift — 5분봉만으로는 앞당긴 선의 체결 차례·가격·조건(RSI·볼린저)을
//    다시 짓기 어려움), 배율이 바뀔 때 차수 선·익절가 자리가 달라지는 것, 크기가 바뀐 뒤 평단이 달라져 차수·익절 시각이 달라지는 것
// 손절가·청산가·남은 거리는 읽지도 내지도 않는다(보안 규칙 18 — exit는 회원 자기 정리 체결가)
import { AUTO_TEXT } from './follow-text.js';
import { rangePct, levForVol } from './pro-lev.js';
import { proLevOn, fmtLeft } from './pro-view.js';
import { stageRule, stageMarginPct } from './dca-rules.js';

export const WI_MAX = 10; // 최근 끝난 매매 몇 건 안에서
export const WI_BARS = 3200; // 허브 봉 중계 상한(hub/lib/candles.js CHART_DEFAULTS.maxBars)
export const WI_TOPUP_MAX = 3; // = exec/lib/dca-path.js TOPUP_MAX(시험이 비교 — 앱은 실행기 모듈을 가져오지 않음)
export const WI_TP_TOL = 1; // 익절로 끝났다고 보는 결과 % 여유(시장가 익절 미끄러짐)
const TF_MS = 300000;
const MIN_MS = 60000;
const FLAT = 1e-4; // 청산가 ÷ 평단 − 1 이 이보다 작으면 1차 몫을 나눌 수 없음(셈 밖)

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const pos = (v) => fin(v) && v > 0;
const SIDE = Object.freeze({ long: 1, short: -1 });
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// ── 날씨(허브 hub/lib/weather.js weatherSeries·weatherTier·one()과 같은 식) ──
// bars = 앱이 받은 봉 { t, o, h, l, c, v }(오래된 → 최신), at = 그 매매 1차 시각 → { tier, volPct } | null(판정 못 함)
export function wxAt(bars, at, rules) {
  const w = rules && rules.weather;
  const volBars = rules && rules.lev ? rules.lev.volBars : null;
  if (!w || !Number.isInteger(volBars) || volBars < 1 || !Array.isArray(bars) || !fin(at)) return null;
  // 허브: candles.get(limit = historyBars) = 그때까지의 줄 끝 historyBars개(지금 봉 포함) — 그 시각 앞 봉이 그만큼 없으면 허브와 다른 분포
  const upTo = bars.filter((b) => b && Number.isInteger(b.t) && b.t <= at).sort((a, b) => a.t - b.t);
  if (upTo.length < w.historyBars) return null;
  const rows = upTo.slice(-w.historyBars);
  // 끝 닫힌 봉이 maxAgeMin보다 오래면 허브는 날씨 없음
  let lastT = null;
  for (const r of rows) if (r.t + TF_MS <= at && (lastT === null || r.t > lastT)) lastT = r.t;
  if (lastT === null || at - (lastT + TF_MS) > w.maxAgeMin * MIN_MS) return null;
  const ok = [];
  for (const r of rows) {
    const { t, h, l, c } = r;
    if (t + TF_MS > at) continue;
    if (!fin(h) || !fin(l) || !fin(c) || !(c > 0) || !(l > 0) || h < l || c > h || c < l) continue;
    ok.push({ t, h, l, c });
  }
  const series = [];
  for (let i = volBars - 1; i < ok.length; i += 1) {
    const v = rangePct(ok.slice(i - volBars + 1, i + 1), volBars);
    if (v !== null) series.push(v);
  }
  if (!series.length) return null;
  const last = series.at(-1);
  if (!fin(last)) return null;
  const vals = series.filter(fin);
  if (vals.length < w.historyBars / 2) return null;
  const p = vals.filter((v) => v < last).length / vals.length;
  const tier = p >= w.stormPctile ? 'storm' : p >= w.cloudPctile ? 'cloudy' : 'clear';
  return { tier, volPct: last };
}

// ── 차수 증거금 몫(운용 금액 C = 1) — 1차 f1 = firstPct/100, n차 = 남은 몫 × stageMarginPct, 마지막 차수 체결 뒤 같은 비율 WI_TOPUP_MAX번 ──
export function marginShares(stage, lev, firstPct, dcaRules) {
  const f1 = pos(firstPct) ? firstPct / 100 : null;
  if (f1 === null || f1 >= 1 || !Number.isInteger(stage) || stage < 1) return null;
  if (stage === 1) return { f1, total: f1 };
  const list = dcaRules && Array.isArray(dcaRules.stages) ? dcaRules.stages.filter((s) => s && Number.isInteger(s.stage)) : [];
  if (!list.length) return null;
  const lastStage = Math.max(...list.map((s) => s.stage));
  let used = f1;
  for (let j = 2; j <= stage; j += 1) {
    const rule = stageRule(dcaRules, j);
    if (!rule) return null;
    const pct = stageMarginPct(rule, lev) / 100;
    if (!(pct > 0)) return null;
    used += (1 - used) * pct;
    if (j === lastStage) for (let k = 0; k < WI_TOPUP_MAX; k += 1) used += (1 - used) * pct;
  }
  return { f1, total: used };
}

const stormCut = (rules) => {
  const cut = rules && rules.weather ? rules.weather.stormFirstCutPct : null;
  return fin(cut) && cut > 0 && cut < 100 ? cut : 0;
};

// 매매 하나의 '프로였다면' 손익 | null(셀 수 없음 — 날씨 모름·1차 몫을 나눌 수 없음 등)
// wx = wxAt 결과, o = { rules, dcaRules, firstPct, tpPct, isTb }
export function proTradePnl(t, wx, { rules = null, dcaRules = null, firstPct = null, tpPct = null, isTb = false } = {}) {
  if (!t || !wx || !wx.tier) return null;
  const dir = SIDE[t.side];
  const pnl = t.pnlUsdt;
  if (!dir || !fin(pnl) || !pos(t.avg) || !pos(t.exit) || !Number.isInteger(t.lev) || t.lev < 1) return null;
  const cut = wx.tier === 'storm' ? stormCut(rules) : 0;
  const c = 1 - cut / 100;
  const L2 = proLevOn(rules, { isTb }) ? levForVol({ volPct: wx.volPct, symbol: t.symbol, rules, wx: wx.tier }) : t.lev;
  if (cut === 0 && L2 === t.lev) return pnl;
  const tpExit = fin(t.resultPct) && fin(tpPct) && Math.abs(t.resultPct - tpPct) <= WI_TP_TOL;
  const g = t.exit / t.avg - 1;
  let out;
  let mr; // 새 증거금 ÷ 옛 증거금
  if (cut === 0) {
    out = pnl;
    mr = 1;
  } else if (t.stage === 1) {
    out = pnl * c;
    mr = c;
  } else {
    const sh = marginShares(t.stage, t.lev, firstPct, dcaRules);
    if (!sh || !pos(t.first) || Math.abs(g) < FLAT) return null;
    const k = (1 - c * sh.f1) / (1 - sh.f1);
    mr = (c * sh.f1 + k * (sh.total - sh.f1)) / sh.total;
    const pnl1 = (pnl * (sh.f1 / sh.total) * (t.exit / t.first - 1)) / g;
    out = tpExit ? pnl * mr : c * pnl1 + k * (pnl - pnl1);
  }
  if (L2 !== t.lev && !tpExit) {
    out = (out * L2) / t.lev;
    if (Math.abs(g) >= FLAT) {
      const margin = Math.abs(pnl / (t.lev * g)) * mr; // 그 매매 증거금(손익 = 방향 × 배율 × 증거금 × (청산가 ÷ 평단 − 1)) × 크기 비율
      out = Math.max(out, -margin);
    }
  }
  return out;
}

// ── 고르기: 끝난 오토 모드(신호) 매매 — 연습 매매·손익 모름·청산가 모름 뺌, 끝난 시각 순 최근 max건 ──
const endAt = (t) => (fin(t.closedAt) ? t.closedAt : t.openedAt);
function countable(t) {
  if (!t || typeof t !== 'object' || t.state !== 'closed' || t.rehearsal === true) return false;
  if (t.src !== undefined && t.src !== 'signal') return false;
  return !!SIDE[t.side] && Number.isInteger(t.stage) && t.stage >= 1 && Number.isInteger(t.lev) && t.lev > 0
    && pos(t.avg) && pos(t.exit) && fin(t.pnlUsdt) && fin(t.openedAt) && typeof t.symbol === 'string' && t.symbol !== '';
}
export function whatifPick(trades, { max = WI_MAX } = {}) {
  if (!Array.isArray(trades)) return [];
  return trades.filter(countable).sort((a, b) => endAt(a) - endAt(b)).slice(-max);
}
export const whatifSymbols = (picked) => [...new Set((Array.isArray(picked) ? picked : []).map((t) => t.symbol))];

// 모아 셈 → { n, mine, pro, gain, rows[{ id, symbol, tier, mine, pro }] } — barsBy = Map(종목 → 봉)
export function proWhatif(trades, { barsBy = new Map(), rules = null, dcaRules = null, firstPct = null, tpPct = null, isTb = false, max = WI_MAX } = {}) {
  const rows = [];
  for (const t of whatifPick(trades, { max })) {
    const bars = barsBy instanceof Map ? barsBy.get(t.symbol) : null;
    const wx = bars ? wxAt(bars, t.openedAt, rules) : null;
    const p = wx ? proTradePnl(t, wx, { rules, dcaRules, firstPct, tpPct, isTb }) : null;
    if (p === null || !fin(p)) continue;
    rows.push({ id: typeof t.id === 'string' ? t.id : null, symbol: t.symbol, tier: wx.tier, mine: t.pnlUsdt, pro: p });
  }
  const mine = round(rows.reduce((s, r) => s + r.mine, 0), 2);
  const pro = round(rows.reduce((s, r) => s + r.pro, 0), 2);
  return { n: rows.length, mine, pro, gain: round(pro - mine, 2), rows };
}

// 글자 꼴: +12.3 USDT · −4.1 USDT(U+2212) · 0.0 USDT
export function fmtUsdtSigned(v) {
  const r = round(v, 1);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)} USDT`;
}
// 막대 폭(CSS 칸 pxe-w5~pxe-w100 — style 속성 없음)
const w5 = (ratio) => Math.min(100, Math.max(5, Math.round((ratio * 100) / 5) * 5));

// 화면 모양 | null(숨김): 프로 켜짐·규칙 없음·셀 매매 없음·이득이 0.0 이하면 숨김
// view = 화면에 보이는 프로 상태(proView — 누른 값 지키기 뒤)
export function whatifView(r, { view = null, rules = null, isTb = false } = {}, text = AUTO_TEXT.pro.whatif) {
  const enter = rules && rules.qualify ? rules.qualify.enterEquity : null;
  if (!view || !(view.show === 'bar' || (view.show === 'switch' && view.on !== true))) return null;
  if (!r || !(r.n > 0) || !fin(r.gain) || !fin(r.mine) || !fin(r.pro)) return null;
  const gain = round(r.gain, 1);
  if (!(gain > 0)) return null;
  const top = Math.max(Math.abs(r.mine), Math.abs(r.pro));
  const bar = (who, label, v) => ({ who, label, text: fmtUsdtSigned(v), w: top > 0 ? w5(Math.abs(v) / top) : 5, neg: v < 0 });
  return {
    num: { from: 0, value: gain, digits: 1, sign: '+', unit: ' USDT', text: `+${gain.toFixed(1)} USDT` },
    line: text.line(r.n, r.pro < 0),
    bars: [bar('mine', text.mine, r.mine), bar('pro', text.pro, r.pro)],
    foot: view.show === 'bar' ? (fin(enter) ? text.lockFoot(fmtLeft(enter)) : null) : text.offFoot,
    src: text.src(proLevOn(rules, { isTb })),
  };
}
