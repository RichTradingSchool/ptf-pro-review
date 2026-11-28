// 프로 모드 단계 1(설계 2026-11-17, 계획 Task 10) — 프로 막대·스위치·날씨 계산(2026-11-23부터 따로 열리는 프로 모드 화면 screens/pro-page.js가 씀).
// - proView: 프로 아님이면 '프로 모드까지 N USDT' 막대(총자산 = 오렌지엑스 회원은 휴대폰이 오렌지엑스 WS로 읽은 띠 잔고의 total,
//   투빗 회원은 서버 상태 bal.equity — 투빗 띠 잔고와 같은 출처, 메모리 값만), 자격(실행기 보고 pro.elig — 허브 회원 경로
//   GET /v1/member/server/pro)이면 켬/끔 스위치, 규칙 없음이면 아무것도 없음. 투빗 회원도 같은 화면(대표 결정 2026-11-23)
// - proLevOn: 가변 배율 글을 보일 때 — 규칙 lev.on이고 그 회원 거래소가 가변 배율을 여는 곳(PRO_LEV_EXCHANGES — 실행기 pro.js와 같은 표, 투빗은 실측 전이라 닫힘)
// - wxTier: 공개 날씨(GET /v1/analysis/weather — 종목·날씨 낱말만)에서 고른 종목 중 가장 나쁜 날씨
// - proStateParts·proEntryText(2026-11-23 프로 모드 화면): 화면 상태 칸 하나·들어가는 줄 짧은 상태
// - proOptionsModel(2026-11-27): '프로 기능' 카드(기능마다 켬/끔·효과 숫자)·한눈 칸
//   (남은 금액 0 = 총자산은 넘었지만 실행기가 아직 자격을 안 줌 — 판정 전·옛 실행기 — 은 '확인 중')
// - proPollOk: 프로 상태·날씨를 받을 때(서버 판·서버 자동 자격 회원·#follow가 보임·문서가 숨지 않음)
// - createProFeed: 프로 상태·날씨를 같이 받는 묶음(간격 안에는 다시 받지 않음·겹치지 않음). 프로는 확정 답(200·404 옛 허브·꼴 틀림 → loadPro가 값|null)만
//   바꾸고, 잠깐 실패(loadPro가 던짐 — 끊김·시간 초과·5xx·429)는 지난 값을 지킨다(자격 회원 스위치가 막대로 깜빡이지 않게). 날씨는 실패면 null
import { AUTO_TEXT } from './follow-text.js';
import { safeGet, safeSet } from './store.js';

export const PRO_FEED_MS = 20000; // 회원 상태 30초 주기마다 한 번 꼴(등록 중 5초 주기여도 20초에 한 번)
export const PRO_HOLD_MS = 60000; // 스위치를 누른 뒤 실행기가 다음 보고(15초)에 싣기까지 누른 값을 지키는 시간 — 같은 답을 보면 바로 풂
export const WX_TIERS = Object.freeze(['clear', 'cloudy', 'storm']);

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export const PRO_LEV_EXCHANGES = Object.freeze(['ox']);

export const proLevOn = (rules, { isTb = false } = {}) =>
  !!rules && !!rules.lev && rules.lev.on === true && PRO_LEV_EXCHANGES.includes(isTb === true ? 'tb' : 'ox');

export function proView({ equity = null, pro = null, rules = null } = {}) {
  const enter = rules && rules.qualify ? rules.qualify.enterEquity : null;
  if (!num(enter) || enter <= 0) return { show: 'none' };
  if (pro && pro.elig === true) return { show: 'switch', on: pro.on === true };
  if (!num(equity)) return { show: 'bar', left: null, ratio: 0 };
  return { show: 'bar', left: Math.max(0, Math.ceil(enter - equity)), ratio: Math.min(1, Math.max(0, equity / enter)) };
}

// 프로 모드 화면 상태 칸(2026-11-23) — 세 경우 중 하나만: { stage, text: 글|null, ratio: 막대 값|null(null이면 막대 숨김), sub: 총자산 줄|null }
//   bar(10,000 미만 — 남은 금액 글·막대·'총자산 지금 / 10,000') · unknown(잔고 모름 — 글만, 막대 숨김) · judging(총자산은 넘었고 자격 판정 기다림 — '잔고 확인 중', 0 USDT라 쓰지 않음)
//   · switch(자격 — 글 없음, 화면이 스위치) · none
export function proStateParts(v, text, { equity = null, enter = null } = {}) {
  const empty = (stage) => ({ stage, text: null, ratio: null, sub: null });
  if (!v || v.show === 'none') return empty('none');
  if (v.show === 'switch') return empty('switch');
  if (v.left == null) return { stage: 'unknown', text: text.barUnknown, ratio: null, sub: null };
  if (v.left === 0) return { stage: 'judging', text: text.judging, ratio: null, sub: null };
  const sub = num(equity) && num(enter) ? text.equity(fmtEq(equity), fmtLeft(enter)) : null;
  return { stage: 'bar', text: text.bar(fmtLeft(v.left)), ratio: v.ratio, sub };
}

// 트레이딩 탭 활성화 게이지(대표 요청 2026-11-25 — 판정과 ⚡ 카드 사이) | null(규칙 없음 — 게이지 없음)
// { stage, text, sub, ratio(0~1 — 판정 전·자격은 가득), on }
export function proGaugeModel({ equity = null, pro = null, rules = null } = {}, text = AUTO_TEXT.pro) {
  const v = proView({ equity, pro, rules });
  if (v.show === 'none') return null;
  if (v.show === 'switch') return { stage: 'switch', text: v.on ? text.gauge.on : text.gauge.off, sub: null, ratio: 1, on: v.on === true };
  const parts = proStateParts(v, text, { equity, enter: rules.qualify.enterEquity });
  if (parts.stage === 'unknown') return { stage: 'unknown', text: parts.text, sub: null, ratio: 0, on: false };
  if (parts.stage === 'judging') return { stage: 'judging', text: parts.text, sub: null, ratio: 1, on: false };
  return { stage: 'bar', text: parts.text, sub: parts.sub, ratio: parts.ratio, on: false };
}

// 오토 모드 창 들어가는 줄 오른쪽 짧은 상태 | null(줄 없음)
export function proEntryText(v, text) {
  if (!v || v.show === 'none') return null;
  if (v.show === 'switch') return v.on ? text.entry.on : text.entry.off;
  if (v.left == null) return text.entry.unknown;
  if (v.left === 0) return text.entry.judging;
  return text.entry.left(fmtLeft(v.left));
}

// 폭풍일 때 프로 1차 비중(실행기 engine firstPctFor와 같은 식 — firstPct × (1 − stormFirstCutPct/100), 소수 한 자리) | null(규칙·값 없음·줄이지 않음)
export function stormFirstPct(firstPct, rules) {
  const cut = rules && rules.weather ? rules.weather.stormFirstCutPct : null;
  if (!num(firstPct) || firstPct <= 0 || !num(cut) || cut <= 0 || cut >= 100) return null;
  return Math.round(((firstPct * (100 - cut)) / 100) * 10) / 10;
}

// ── '프로 기능' 카드(대표 요청 2026-11-27 — 옛 '프로에서 달라지는 것' 글 줄 셋을 바꿈): 기능마다 카드·켬/끔·효과 숫자 ──
// 서버 기능(꺼 둘 수 있는 낱말 — 실행기 settings { proOff: [...] }, 프로 상태 GET /v1/member/server/pro의 off 칸 — 옛 서버는 칸 없음 = [])과
// 화면 연출 거미줄(이 기기 localStorage만 — 주문과 무관). 효과 숫자는 기능마다 따로 보여 주고 곱하거나 더한 합산 숫자는 만들지 않는다(과장 광고 규제)
export const PRO_OFF_KEYS = Object.freeze(['lev', 'storm', 'dca']); // 서버 계약 차례(exec/lib/wire.js PRO_OPT_KEYS — 보고·serverPro가 이 차례만 받음)
export const PRO_OPT_KEYS = Object.freeze(['lev', 'storm', 'dca', 'spider']); // 화면 순서
export const PRO_STORM_LOSS_CUT_PCT = 20; // 폭풍 1차 비중 줄임 — 1년 시뮬레이션의 폭풍 손절 손실 감소 %
export const PRO_DCA_GAIN_PCT = 64; // 날씨별 2·3·4차 앞당김 — 최근 실제 신호 기준 수익 개선 %(대표 결정 2026-11-25 글과 같은 값)
export const PRO_SPIDER_OFF_KEY = 'ptf.proSpiderOff';

export const normProOff = (a) => (Array.isArray(a) ? PRO_OFF_KEYS.filter((k) => a.includes(k)) : []);
export const proOffOf = (pro) => normProOff(pro && typeof pro === 'object' ? pro.off : null);
export const sameProOff = (a, b) => {
  const x = normProOff(a);
  const y = normProOff(b);
  return x.length === y.length && x.every((k, i) => k === y[i]);
};
// 거미줄 화면 끄기(이 기기만) — 저장소가 막혀도(사생활 보호 모드·iframe) 던지지 않음: 읽기 실패 = 켬, 쓰기 실패 = false
export const readSpiderOff = (storage) => safeGet(PRO_SPIDER_OFF_KEY, '0', storage) === '1';
export const writeSpiderOff = (off, storage) => safeSet(PRO_SPIDER_OFF_KEY, off === true ? '1' : '0', storage);

const dcaShiftOn = (rules) => {
  const ds = rules && rules.weather ? rules.weather.dcaShift : null;
  return !!ds && typeof ds === 'object' && Object.values(ds).some((v) => num(v) && v > 0);
};
const stormCutOn = (rules) => {
  const cut = rules && rules.weather ? rules.weather.stormFirstCutPct : null;
  return num(cut) && cut > 0 && cut < 100;
};
const bigNum = (value, digits, sign, unit, from = 0) => ({ from, value, digits, sign, unit, text: `${sign}${value.toFixed(digits)}${unit}` });

// 카드·한눈 칸 계산 | null(규칙 없음·화면 없음). view = 화면에 보이는 프로 상태(proView — 누른 값 지키기 뒤), off = 서버 꺼 둔 낱말, spiderOff = 이 기기 거미줄 끔
// stage: locked(자격 없음 — 카드는 켠 모양·토글 잠김·문턱 글) · pending(자격·프로 꺼짐 — 토글 됨·'프로를 켜면 적용') · live(프로 켜짐)
export function proOptionsModel({ rules = null, firstPct = null, baseLev = null, isTb = false, view = null, off = [], spiderOff = false } = {}, text = AUTO_TEXT.pro.opts) {
  const enter = rules && rules.qualify ? rules.qualify.enterEquity : null;
  if (!num(enter) || enter <= 0 || !view || (view.show !== 'bar' && view.show !== 'switch')) return null;
  const stage = view.show === 'bar' ? 'locked' : view.on === true ? 'live' : 'pending';
  const locked = stage === 'locked';
  const offSet = new Set(normProOff(off));
  const note = (key) => (locked ? text.lockFrom(fmtLeft(enter)) : stage === 'pending' ? text.pending : key === 'spider' ? text.spider.note : text.next);
  const cards = [];
  const add = (key, { label = null, num: n = null, sub = [], effect = null, offEffect = null }) => {
    const on = locked ? true : key === 'spider' ? spiderOff !== true : !offSet.has(key);
    const T = text[key];
    const big = n ? (on ? n.text : text.same) : on ? effect : offEffect;
    cards.push({ key, name: T.name, desc: T.desc, label: n ? label : null, num: n, big, sub, on, locked, note: note(key) });
  };
  if (proLevOn(rules, { isTb })) {
    const bw = rules.lev.byWeather;
    const clear = bw && num(bw.clear) ? bw.clear : rules.lev.max;
    const ratio = num(baseLev) && baseLev > 0 && num(clear) ? Math.round((clear / baseLev) * 10) / 10 : null;
    const sub = bw && num(bw.clear) && num(bw.cloudy) && num(bw.storm) ? [text.lev.sub(bw.clear, bw.cloudy, bw.storm)] : [];
    add('lev', ratio == null ? { sub, effect: text.lev.plain, offEffect: text.same } : { label: text.lev.label, num: bigNum(ratio, 1, '', '배', 1), sub });
  }
  // 폭풍: 긍정형 '20%'(부호 없음 — 이름표 '폭풍 때 손실 줄임', 아래 화살표는 CSS) · 비중 숫자 줄 없음(2026-11-28 동업자 의견)
  if (stormCutOn(rules)) add('storm', { label: text.storm.label, num: bigNum(PRO_STORM_LOSS_CUT_PCT, 0, '', '%'), sub: [text.storm.sim] });
  if (dcaShiftOn(rules)) add('dca', { label: text.dca.label, num: bigNum(PRO_DCA_GAIN_PCT, 0, '+', '%'), sub: [text.dca.sub] });
  add('spider', { sub: [text.spider.sub], effect: text.spider.effect, offEffect: text.spider.offEffect });
  const onN = cards.filter((c) => c.on).length;
  const offN = cards.length - onN;
  const chipOf = (c) => {
    const T = text[c.key];
    if (!c.num) return T.chip || T.name;
    return typeof T.chipNum === 'function' ? T.chipNum(c.num.text) : `${c.label} ${c.num.text}`;
  };
  const chips = cards.map((c) => ({ key: c.key, text: chipOf(c), on: c.on }));
  const hero = {
    on: onN, total: cards.length, pct: cards.length ? Math.round((onN / cards.length) * 100) : 0, chips, ringLabel: locked ? text.ringLocked : text.ringOn,
    state: locked ? text.lockHero(fmtLeft(enter)) : offN > 0 ? text.offN(offN) : text.allOn,
    allOnBtn: !locked && offN > 0, note: stage === 'pending' ? text.pending : null,
  };
  return { stage, cards, hero };
}

// '프로 모드란?' 설명 연출 장면(2026-11-23) — 장면마다 글 한 줄 + 그림 낱말(key). 배율 장면은 가변 배율 글을 보일 때만(proLevOn — 투빗 회원은 없음)
// 장면 하나 1.8초(대표 요청 2026-11-24 '너무 느림' — 처음 5초), 거미줄 모드 장면만 글이 두 줄이라 2.6초(scene.ms), 끝에 explainSummary 요약 칸에서 멈춤.
// 순서(대표 문구 2026-11-24): 변동성 세 단계 → 높은 변동성 비중 낮춤 → 거미줄 모드(1%씩 아래 줄) → (배율) → 스위치 → 마지막 활성화 기준
export const EXPLAIN_SCENE_MS = 1800;
export const EXPLAIN_LADDER_MS = 2600;
export const LADDER_CELLS = Object.freeze([10, 5, 7, 9]); // 거미줄 모드 그림 — 1·2·3·4차 칸 수(1% 칸이 차수마다 한 묶음으로 깔림 — 그림만, 실제 칸 수는 줄여 그린 값)
// 거미줄 진입(1%씩 촘촘한 진입 — 장면 글 ladderSub) 1년 시뮬레이션 기준 손절 감소 %
export const PRO_LADDER_SL_CUT_PCT = 40;
// 막대 폭(CSS 칸 pxe-w5~pxe-w100 — style 속성을 쓰지 않음): 5% 단위, 0보다 크면 최소 5
const w5 = (ratio) => Math.min(100, Math.max(5, Math.round((ratio * 100) / 5) * 5));
// 일반 100 대비 프로 지수 막대 둘 — 긴 쪽이 100
const cmpBars = (pro, X) => {
  const top = Math.max(100, pro);
  return [
    { who: 'base', label: X.sumBase, value: 100, w: w5(100 / top) },
    { who: 'pro', label: X.sumPro, value: pro, w: w5(pro / top) },
  ];
};

// 끝 성과판(대표 요청 2026-11-28 — 옛 '한눈에' 글 줄·'좋은 점' 줄을 바꿈) | null(규칙 없음)
// { title, cap, tiles: [{ key, name, metric, num(bigNum — 0에서 올라감), src(출처 꼬리), bars }], wxTitle, weather: [{ tier, name, lev, word, w, cut }] | null, pills }
// 타일은 기능마다 그 기능 숫자 하나씩(proOptionsModel 카드와 같은 조건·같은 값) — 곱하거나 더한 합산 숫자는 만들지 않는다(과장 광고 규제)
export function explainSummary({ rules = null, firstPct = null, isTb = false, baseLev = null, text = null } = {}) {
  const X = text || AUTO_TEXT.pro.explain;
  const enter = rules && rules.qualify ? rules.qualify.enterEquity : null;
  if (!num(enter) || enter <= 0 || !X) return null;
  const tiles = [];
  const tile = (key, n, proIdx, src) => tiles.push({ key, name: X.tile[key].name, metric: X.tile[key].metric, num: n, src, bars: cmpBars(proIdx, X) });
  if (dcaShiftOn(rules)) tile('dca', bigNum(PRO_DCA_GAIN_PCT, 0, '+', '%'), 100 + PRO_DCA_GAIN_PCT, X.srcReal);
  // 줄어드는 효과는 긍정형(부호 없는 '40%'·'20%' + '… 줄임' — 아래 화살표는 CSS, 2026-11-28 동업자 의견)
  tile('ladder', bigNum(PRO_LADDER_SL_CUT_PCT, 0, '', '%'), 100 - PRO_LADDER_SL_CUT_PCT, X.srcSim);
  if (stormCutOn(rules)) tile('storm', bigNum(PRO_STORM_LOSS_CUT_PCT, 0, '', '%'), 100 - PRO_STORM_LOSS_CUT_PCT, X.srcSim);
  const lev = proLevOn(rules, { isTb });
  const bw = lev && rules.lev.byWeather && WX_TIERS.every((t) => num(rules.lev.byWeather[t])) ? rules.lev.byWeather : null;
  if (lev) {
    const clear = bw ? bw.clear : rules.lev.max;
    const ratio = num(baseLev) && baseLev > 0 && num(clear) ? Math.round((clear / baseLev) * 10) / 10 : null;
    if (ratio != null && ratio > 1) tile('lev', bigNum(ratio, 1, '', '배', 1), Math.round(ratio * 100), X.srcLev(clear, baseLev));
  }
  // 날씨 세 칸 — 비중 숫자 없이 낱말(평소대로·폭풍만 손실 줄임)과 1차 크기 막대 그림(폭풍 = 100 − stormFirstCutPct). 폭풍 줄임도 배율 글도 없으면 칸 없음
  const cutOn = stormCutOn(rules);
  const W = AUTO_TEXT.pro.weather;
  const weather = !cutOn && !bw ? null : WX_TIERS.map((tier) => {
    const cut = tier === 'storm' && cutOn;
    return {
      tier, name: W[tier], lev: bw ? `${bw[tier]}×` : null,
      word: cut ? X.wxCut : X.wxSame, w: cut ? w5(1 - rules.weather.stormFirstCutPct / 100) : 100, cut,
    };
  });
  return { title: X.sumTitle, cap: X.sumCap, tiles, wxTitle: X.wxTitle, weather, pills: [X.sumToggle, X.sumGauge(fmtLeft(enter))] };
}
export function explainScenes({ rules = null, firstPct = null, isTb = false, text = null } = {}) {
  const X = text || { ...AUTO_TEXT.pro.explain, levAuto: AUTO_TEXT.pro.levAuto };
  const enter = rules && rules.qualify ? rules.qualify.enterEquity : null;
  if (!num(enter) || enter <= 0 || !X) return [];
  // 폭풍 장면 그림 꼬리: 옛 1차 비중 13%→9.1% 숫자 대신 '손실 20% 줄임'·'1년 시뮬레이션 기준'(2026-11-28 동업자 의견 — 폭풍 줄임이 있는 규칙만)
  const cutOn = stormCutOn(rules);
  const out = [
    { key: 'weather', text: X.weather },
    { key: 'storm', text: X.storm, gain: cutOn ? X.stormGain(PRO_STORM_LOSS_CUT_PCT) : null, src: cutOn ? X.srcSim : null },
    { key: 'ladder', text: X.ladder, sub: X.ladderSub, ms: EXPLAIN_LADDER_MS },
  ];
  if (proLevOn(rules, { isTb })) out.push({ key: 'lev', text: X.levAuto, range: `${rules.lev.min}~${rules.lev.max}×` });
  out.push({ key: 'switch', text: X.sw }, { key: 'gauge', text: X.gauge(fmtLeft(enter)) });
  return out;
}

// 받기 조건(계획 2026-11-17 Task 10 검토 3 — 비활성화 기기·자격 없는 회원은 날씨도 묻지 않음)
// trade(거미줄 연출 — 2026-11-23): 트레이딩 탭이 보이고 그 회원 오토 매매가 열려 있음 — 프로 켜짐일 때만 차트에 그리므로 그때도 받는다
export const proPollOk = ({ serverOk, capable, screen, hidden, trade = false }) => serverOk === true && capable === true && (screen === 'follow' || trade === true) && hidden !== true;

// 남은 금액 글(정수 쉼표 — 800 · 4,800)
export const fmtLeft = (n) => Math.round(n).toLocaleString('en-US');
// 지금 총자산 글(내림 — 9,999.7이 10,000 / 10,000으로 보이지 않게)
const fmtEq = (n) => Math.floor(n).toLocaleString('en-US');

// 고른 종목 중 가장 나쁜 날씨 낱말 | null(날씨 없음·그 종목 없음)
export function wxTier(weather, symbols) {
  const items = weather && Array.isArray(weather.items) ? weather.items : [];
  const want = new Set(Array.isArray(symbols) ? symbols : []);
  let worst = -1;
  for (const x of items) {
    if (!x || !want.has(x.symbol)) continue;
    worst = Math.max(worst, WX_TIERS.indexOf(x.tier));
  }
  return worst >= 0 ? WX_TIERS[worst] : null;
}

export function createProFeed({ loadPro = async () => null, loadWeather = async () => null, now = () => Date.now(), gapMs = PRO_FEED_MS, onChange = () => {} } = {}) {
  let pro = null;
  let weather = null;
  let at = null;
  let busy = false;
  const loadProKeep = async () => {
    try {
      return { ok: true, v: (await loadPro()) ?? null };
    } catch {
      return { ok: false }; // 잠깐 실패 — 지난 값 그대로
    }
  };
  const safe = async (fn) => {
    try {
      return (await fn()) ?? null;
    } catch {
      return null;
    }
  };
  async function poll({ force = false } = {}) {
    if (busy) return false;
    if (!force && at != null && now() - at < gapMs) return false;
    busy = true;
    at = now();
    try {
      const [p, w] = await Promise.all([loadProKeep(), safe(loadWeather)]);
      if (p.ok) pro = p.v;
      weather = w;
    } finally {
      busy = false;
    }
    try {
      onChange();
    } catch {
      // 화면 그리기 실패가 받기를 멈추지 않게
    }
    return true;
  }
  return { poll, pro: () => pro, weather: () => weather };
}
