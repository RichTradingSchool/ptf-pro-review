// 프로 모드 배율·자리 계산식(설계 2026-11-17 — 단계 1). 순수 함수만(DOM·저장소·거래소 모름). rules = pro-rules.json(validateProRules로 검사한 객체).
// 청산 상수는 auto-sl.js 추정 청산 식 avg × (1 − dir × (1/L − liqBuffer))와 같은 값을 가져다 쓴다 — 증거금 기준 청산 거리 % = 100 × (1 − L × liqBuffer).
import { AUTO_SL } from './auto-sl.js';

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const EPS = 1e-9; // 나눗셈 반올림 오차로 내림이 한 칸 빠지지 않게

// 마지막 n봉의 (최고 고가 − 최저 저가) ÷ 마지막 종가 × 100. 봉이 n개 미만·숫자 아님·종가 0 이하면 null
export function rangePct(rows, n) {
  if (!Array.isArray(rows) || !Number.isInteger(n) || n < 1 || rows.length < n) return null;
  const last = rows.slice(-n);
  let hi = -Infinity;
  let lo = Infinity;
  for (const r of last) {
    if (!r || !fin(r.h) || !fin(r.l) || !fin(r.c)) return null;
    if (r.h > hi) hi = r.h;
    if (r.l < lo) lo = r.l;
  }
  const c = last.at(-1).c;
  if (!(c > 0)) return null;
  return ((hi - lo) / c) * 100;
}

// 변동폭 → 배율. 꺼짐·변동폭 없음이면 min. 잔잔(calmPct)이면 max, 거침(wildPct)이면 min, 사이는 직선으로 내림.
// [min, max]로 자르고, highLevSymbols 밖 종목은 otherMax, 거래소 종목 최대 배율(exMax — 정수일 때만)로 한 번 더 자른다
// 날씨별 배율(lev.byWeather — 대표 결정 2026-11-27): 칸이 있으면 변동폭 대신 wx(clear·cloudy·storm) 칸 값, 날씨를 모르면(낡음·없음·모르는 낱말) cloudy 칸(기본 회원 배율 50과 같은 값).
// 꺼짐이면 min — 이 판에서 꺼짐은 엔진이 부르지 않음(프로 아님 = 지금 배율)
export function levForVol({ volPct, symbol, rules, exMax, wx = null } = {}) {
  const L = rules.lev;
  if (!L.on) return L.min;
  let lev;
  if (L.byWeather && typeof L.byWeather === 'object') {
    lev = WX_TIERS.includes(wx) ? L.byWeather[wx] : L.byWeather.cloudy;
  } else {
    if (!fin(volPct)) return L.min;
    const t = (volPct - L.calmPct) / (L.wildPct - L.calmPct);
    lev = Math.floor(L.max - t * (L.max - L.min) + EPS);
  }
  lev = Math.min(L.max, Math.max(L.min, lev));
  if (!L.highLevSymbols.includes(symbol)) lev = Math.min(lev, L.otherMax);
  if (Number.isInteger(exMax) && exMax > 0) lev = Math.min(lev, exMax);
  return lev;
}

// 증거금 기준 추정 청산 거리 % = 100 − 0.38 × lev
export const liqMarginPct = (lev) => 100 * (1 - lev * AUTO_SL.liqBuffer);

// 차수 선 %(dca-rules stage forcePct·condPct) — 50배 이하는 그대로, 넘으면 청산 거리 비율로 줄이고 청산 거리 − gapPct 안쪽
export function stagePctFor(pct, lev, rules) {
  if (!(lev > 50)) return pct;
  const m = liqMarginPct(lev);
  return Math.min((pct * m) / liqMarginPct(50), m - rules.dcaScale.gapPct);
}

// 날씨별 2·3·4차 앞당김 식(대표 결정 2026-11-25 — 실행기 dca-path stageLine·dcaForLev와 빌드 검사가 같은 함수)
export const WX_TIERS = Object.freeze(['clear', 'cloudy', 'storm']);
export const DCA_SHIFT_MIN_COND = 5; // 줄인 뒤 조건부 선 아래 끝(증거금 %)
// 그 표를 shift만큼 줄여도 안전한가(표 전체 — 한 차수만 틀려도 거짓)
function shiftSafe(dcaRules, shift) {
  const st = Array.isArray(dcaRules && dcaRules.stages) ? [...dcaRules.stages].filter((s) => s && typeof s === 'object').sort((a, b) => a.stage - b.stage) : [];
  if (!st.length) return false;
  let prevForce = -Infinity;
  for (const s of st) {
    const c = s.condPct - shift;
    const f = s.forcePct - shift;
    if (!Number.isFinite(c) || !Number.isFinite(f) || c < DCA_SHIFT_MIN_COND || !(f > c) || c < prevForce - 1e-9) return false;
    prevForce = f;
  }
  return true;
}
// wxShiftOf(dca, wx, pro) → 앞당김 % (0이면 앞당기지 않음)
export function wxShiftOf(dcaRules, wx, pro = null) {
  if (!WX_TIERS.includes(wx)) return 0;
  const d = pro && pro.weather && pro.weather.dcaShift;
  const v = d && typeof d === 'object' ? d[wx] : null;
  if (!(typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 30)) return 0;
  return shiftSafe(dcaRules, v) ? v : 0;
}
