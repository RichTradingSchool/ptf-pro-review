// 프로 모드 규칙 파일(pro-rules.json, 설계 2026-11-17 §0·'Claude 판단' — 단계 1) 검사. 빌드(tools/build.mjs)는 검사한 값을 config.js proRules에 찍고,
// 실행기·허브는 저장소 맨 위 pro-rules.json을 직접 읽어 같은 함수로 검사한다. follow-rules.js처럼 모르는 칸·빠진 칸·범위 밖이면 실패
// (엔진이 읽는 항목을 먼저 늘림 — 조용히 무시하지 않음). 던지지 않고 { ok:true, rules(얼린 사본) } | { ok:false, error } 를 돌려준다.
// 칸: qualify(프로 자격 — 들어가는 총자산·나가는 총자산·나가기 유예 시간) · lev(가변 배율 — 켜기·50~125 안 min~max·잔잔/거침 변동폭 %·봉 수·시세 나이·
// 60배 넘는 배율을 받는 종목·그 밖 종목 상한) · dcaScale(gapPct) · late(marginPct) · weather(날씨 — 흐림/폭풍 분위·분포 봉 수·나이·폭풍 1차 비중 깎기 %).
// highLevSymbols는 follow-rules.json autoRun.symbols 안 종목만 — 그 목록을 opts.symbols로 넘긴다(없으면 검사할 수 없어 실패 — 닫힌 쪽).
import { isObj, isNum } from './follow-rules.js';

export const PRO_RULES_KEYS = Object.freeze(['v', 'qualify', 'lev', 'dcaScale', 'late', 'weather']);
export const PRO_QUALIFY_KEYS = Object.freeze(['enterEquity', 'exitEquity', 'exitHoldHours']);
export const PRO_LEV_KEYS = Object.freeze(['on', 'min', 'max', 'calmPct', 'wildPct', 'volBars', 'maxAgeMin', 'highLevSymbols', 'otherMax']);
// 날씨별 배율(대표 결정 2026-11-27 '1번' — 맑음 60·흐림 50·폭풍 40): 있으면 가변 배율을 변동폭 직선 대신 1차 때 그 종목 날씨 낱말로 고른다(없으면 지금 변동폭 식)
export const PRO_LEV_OPTIONAL_KEYS = Object.freeze(['byWeather']);
export const PRO_LEV_WX_KEYS = Object.freeze(['clear', 'cloudy', 'storm']);
export const PRO_DCA_SCALE_KEYS = Object.freeze(['gapPct']);
export const PRO_LATE_KEYS = Object.freeze(['marginPct']);
export const PRO_WEATHER_KEYS = Object.freeze(['cloudPctile', 'stormPctile', 'historyBars', 'maxAgeMin', 'stormFirstCutPct', 'dcaShift']);
// 2·3·4차 추가 진입 기준선(dca-rules condPct·forcePct)을 그 매매 1차 때 날씨로 앞당기는 증거금 % (2026-11-25 대표 결정) — 맑음 ≥ 흐림 ≥ 폭풍
export const PRO_DCA_SHIFT_KEYS = Object.freeze(['clear', 'cloudy', 'storm']);

const LEV_FLOOR = 40; // 가변 배율 아래 끝(설계 §0은 50~80 — 대표 결정 2026-11-27 날씨별 40~60으로 40까지. 50 이하는 차수 선을 줄이지 않음 — pro-lev stagePctFor)
const LEV_CEIL = 125; // 오렌지엑스 배율 천장(trade-rules tabs.*.lev와 같은 상한)
const SYM_RE = /^[A-Z0-9]{1,20}$/;
const SYMBOLS_MAX = 20;

class ProRulesError extends Error {}
const fail = (m) => { throw new ProRulesError(`pro-rules.json: ${m}`); };
// follow-rules.js onlyKeys 꼴 — 모르는 칸·빠진 칸
function onlyKeys(obj, keys, where, optional = []) {
  if (!isObj(obj)) fail(`${where}가 객체가 아닙니다`);
  for (const k of Object.keys(obj)) if (!keys.includes(k) && !optional.includes(k)) fail(`${where}에 모르는 칸 ${k} — 엔진이 읽는 항목을 먼저 늘리세요`);
  for (const k of keys) if (!Object.hasOwn(obj, k)) fail(`${where}.${k}가 없습니다`);
}
const isInt = (v) => Number.isInteger(v);
function int(v, lo, hi, where) {
  if (!isInt(v) || v < lo || v > hi) fail(`${where}는 ${lo}~${hi} 정수`);
}
function num(v, lo, hi, where) {
  if (!isNum(v) || v < lo || v > hi) fail(`${where}는 ${lo}~${hi}`);
}
// 0 < v < 1 (분위)
function frac(v, where) {
  if (!isNum(v) || v <= 0 || v >= 1) fail(`${where}는 0 초과 1 미만`);
}

function check(r, symbols) {
  onlyKeys(r, PRO_RULES_KEYS, '맨 위');
  if (r.v !== 1) fail('v는 1');
  const q = r.qualify;
  onlyKeys(q, PRO_QUALIFY_KEYS, 'qualify');
  num(q.enterEquity, 1, 10_000_000, 'qualify.enterEquity');
  if (!isNum(q.exitEquity) || q.exitEquity <= 0 || q.exitEquity >= q.enterEquity) fail(`qualify.exitEquity는 0 초과 enterEquity(${q.enterEquity}) 미만`);
  int(q.exitHoldHours, 1, 168, 'qualify.exitHoldHours');

  const l = r.lev;
  onlyKeys(l, PRO_LEV_KEYS, 'lev', PRO_LEV_OPTIONAL_KEYS);
  if (typeof l.on !== 'boolean') fail('lev.on은 true/false');
  int(l.min, LEV_FLOOR, LEV_CEIL, 'lev.min');
  int(l.max, LEV_FLOOR, LEV_CEIL, 'lev.max');
  if (l.min > l.max) fail(`lev.min(${l.min})은 lev.max(${l.max}) 이하`);
  num(l.wildPct, 0, 20, 'lev.wildPct');
  if (!isNum(l.calmPct) || l.calmPct <= 0 || l.calmPct >= l.wildPct) fail(`lev.calmPct는 0 초과 wildPct(${l.wildPct}) 미만`);
  int(l.volBars, 3, 150, 'lev.volBars');
  int(l.maxAgeMin, 1, 60, 'lev.maxAgeMin');
  const hs = l.highLevSymbols;
  if (!Array.isArray(hs) || hs.length > SYMBOLS_MAX || !hs.every((s) => typeof s === 'string' && SYM_RE.test(s)) || new Set(hs).size !== hs.length) {
    fail(`lev.highLevSymbols는 대문자 종목 이름 0~${SYMBOLS_MAX}개·겹침 없음`);
  }
  if (!Array.isArray(symbols)) fail('lev.highLevSymbols를 검사할 종목 목록(follow-rules.json autoRun.symbols — opts.symbols)이 없습니다');
  const outside = hs.filter((s) => !symbols.includes(s));
  if (outside.length) fail(`lev.highLevSymbols ${outside.join(',')}는 follow-rules.json symbols(${symbols.join(',')}) 밖`);
  if (!isInt(l.otherMax) || l.otherMax < l.min || l.otherMax > l.max) fail(`lev.otherMax는 lev.min(${l.min})~lev.max(${l.max}) 정수`);
  if (Object.hasOwn(l, 'byWeather')) {
    const bw = l.byWeather;
    onlyKeys(bw, PRO_LEV_WX_KEYS, 'lev.byWeather');
    for (const k of PRO_LEV_WX_KEYS) int(bw[k], l.min, l.max, `lev.byWeather.${k}`);
    if (bw.cloudy > bw.clear) fail(`lev.byWeather.cloudy(${bw.cloudy})는 clear(${bw.clear}) 이하`);
    if (bw.storm > bw.cloudy) fail(`lev.byWeather.storm(${bw.storm})는 cloudy(${bw.cloudy}) 이하`);
  }

  onlyKeys(r.dcaScale, PRO_DCA_SCALE_KEYS, 'dcaScale');
  num(r.dcaScale.gapPct, 1, 20, 'dcaScale.gapPct'); // 1 이상(최종 검토 T6 — 0이면 강제 선이 청산 거리에 붙음)
  onlyKeys(r.late, PRO_LATE_KEYS, 'late');
  num(r.late.marginPct, 0.5, 20, 'late.marginPct');

  const w = r.weather;
  onlyKeys(w, PRO_WEATHER_KEYS, 'weather');
  frac(w.cloudPctile, 'weather.cloudPctile');
  frac(w.stormPctile, 'weather.stormPctile');
  if (w.cloudPctile >= w.stormPctile) fail(`weather.cloudPctile(${w.cloudPctile})은 stormPctile(${w.stormPctile}) 미만`);
  int(w.historyBars, 288, 3200, 'weather.historyBars');
  int(w.maxAgeMin, 1, 60, 'weather.maxAgeMin');
  num(w.stormFirstCutPct, 0, 90, 'weather.stormFirstCutPct');
  const ds = w.dcaShift;
  onlyKeys(ds, PRO_DCA_SHIFT_KEYS, 'weather.dcaShift');
  for (const k of PRO_DCA_SHIFT_KEYS) num(ds[k], 0, 30, `weather.dcaShift.${k}`);
  if (ds.cloudy > ds.clear) fail(`weather.dcaShift.cloudy(${ds.cloudy})는 clear(${ds.clear}) 이하`);
  if (ds.storm > ds.cloudy) fail(`weather.dcaShift.storm(${ds.storm})는 cloudy(${ds.cloudy}) 이하`);
}

function deepFreeze(o) {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

// opts.symbols = follow-rules.json autoRun.symbols(빌드·실행기·허브가 넘김)
export function validateProRules(obj, opts = {}) {
  try {
    check(obj, opts && opts.symbols);
    return { ok: true, rules: deepFreeze(structuredClone(obj)) };
  } catch (e) {
    if (e instanceof ProRulesError) return { ok: false, error: e.message };
    return { ok: false, error: `pro-rules.json: ${e && e.message ? e.message : String(e)}` };
  }
}
