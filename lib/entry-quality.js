// 거미줄로 본 이득(프로 모드 화면 칸 — 2026-11-24 대표 '일반 매매 대비 얼마나 이득을 봤는지 거미줄로 본 이득'): 추가 진입(2·3·4차)이 들어간 회원 자기 오토 모드 매매가
// 한 번에 들어갔을 때(1차 체결가)보다 평단을 얼마나 유리하게 만들었는지의 평균.
// 평단 이득 % = 방향 × (1차 체결가 − 평단) ÷ 1차 체결가 × 100 (롱은 평단이 내려가면 +, 숏은 올라가면 +, 가격 기준). 1차만 들어간 매매는 셈에 넣지 않는다(추가 진입이 없음).
// 입력 = 회원 서버 상태 trades 줄(app/lib/server-exec.js — 평단 avg·차수 stage·방향 side·시각 openedAt·1차 체결가 first(숫자|null)).
// 1차 체결가를 모르는 매매는 셈에서 빼고 지어내지 않는다. 순수 함수 — DOM·시계·저장 없음. 손절가·청산가·남은 거리는 읽지도 내지도 않는다(보안 규칙 18)
export const EQ_WINDOW = Object.freeze({ days: 30, max: 20, futureMs: 5 * 60000 });
export const EQ_LEVELS = 8; // 막대 높이 단계(css eq-l0 ~ eq-l8)
const COUNTED_STATES = Object.freeze(['open', 'closing', 'closed']);

export const EQ_TEXT = Object.freeze({
  title: '거미줄로 본 이득',
  empty: '아직 기록이 없습니다',
  noData: '아직 셈할 기록이 없습니다',
  label: { plus: '한 번에 들어갔을 때보다 평단이 유리', minus: '한 번에 들어갔을 때보다 평단이 불리', zero: '한 번에 들어갔을 때와 평단이 같음' },
  recent: (n, x) => `최근 ${n}건 중 거미줄이 쓰인 매매 ${x}건`,
});

const pos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const SIDE = Object.freeze({ long: 1, short: -1 });

// 평단 이득 % (모르면 null)
export function improvementPct(side, first, avg) {
  const dir = SIDE[side];
  if (!dir || !pos(first) || !pos(avg)) return null;
  const v = (dir * (first - avg)) / first * 100;
  return Number.isFinite(v) ? v : null;
}

const round2 = (v) => Math.round(v * 100) / 100;

function countable(t, now, since) {
  if (!t || typeof t !== 'object') return false;
  if (!SIDE[t.side] || !Number.isInteger(t.stage) || t.stage < 1 || !pos(t.avg)) return false;
  if (!COUNTED_STATES.includes(t.state) || t.rehearsal === true) return false;
  if (t.src !== undefined && t.src !== 'signal') return false; // 오토 모드(신호) 매매만 — 직접 주문은 아님
  if (typeof t.openedAt !== 'number' || !Number.isFinite(t.openedAt)) return false;
  return t.openedAt >= since && t.openedAt <= now + EQ_WINDOW.futureMs;
}

// → { ok, n, extraN, measuredN, avgPct|null, rows[오래된→최근, 셈이 된 추가 진입 매매만 { id, symbol, side, stage, pct }] }
export function entryQuality(trades, { now = Date.now(), days = EQ_WINDOW.days, max = EQ_WINDOW.max } = {}) {
  const empty = { ok: Array.isArray(trades), n: 0, extraN: 0, measuredN: 0, avgPct: null, rows: [] };
  if (!Array.isArray(trades)) return empty;
  const since = now - days * 86400000;
  const picked = trades.filter((t) => countable(t, now, since)).sort((a, b) => a.openedAt - b.openedAt).slice(-max);
  const extra = picked.filter((t) => t.stage >= 2);
  const rows = [];
  for (const t of extra) {
    const pct = improvementPct(t.side, t.first, t.avg);
    if (pct !== null) rows.push({ id: typeof t.id === 'string' ? t.id : null, symbol: typeof t.symbol === 'string' ? t.symbol : '', side: t.side, stage: t.stage, pct: round2(pct) });
  }
  return {
    ok: true,
    n: picked.length,
    extraN: extra.length,
    measuredN: rows.length,
    avgPct: rows.length === 0 ? null : round2(rows.reduce((s, r) => s + r.pct, 0) / rows.length),
    rows,
  };
}

// 글자 꼴: +1.50% · −3.00%(U+2212) · 0.00%
export function fmtSignedPct(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const a = Math.abs(v).toFixed(2);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${a}%`;
}

// 화면 모양: { empty: 글|null, noData: 글|null, big: 글|null, label: 글|null, lines[], bars[{ level 0~8, neg }] }
export function qualityView(r) {
  if (!r || r.n === 0) return { empty: EQ_TEXT.empty, noData: null, big: null, label: null, lines: [], bars: [] };
  const lines = [EQ_TEXT.recent(r.n, r.extraN)];
  if (r.measuredN === 0 || r.avgPct === null) return { empty: null, noData: EQ_TEXT.noData, big: null, label: null, lines, bars: [] };
  const top = Math.max(0, ...r.rows.map((x) => Math.abs(x.pct)));
  const bars = r.rows.map((x) => ({ level: top === 0 ? 0 : Math.round((EQ_LEVELS * Math.abs(x.pct)) / top), neg: x.pct < 0 }));
  const label = r.avgPct > 0 ? EQ_TEXT.label.plus : r.avgPct < 0 ? EQ_TEXT.label.minus : EQ_TEXT.label.zero;
  return { empty: null, noData: null, big: fmtSignedPct(r.avgPct), label, lines, bars };
}
