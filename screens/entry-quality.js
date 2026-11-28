// 프로 모드 화면의 '거미줄로 본 이득' 칸(2026-11-24) — 큰 숫자 하나(추가 진입 매매의 평균 평단 이득 %)·그 아래 한 줄·짧은 줄 하나·막대(오래된 → 최근).
// 계산은 lib/entry-quality.js(순수). 서버 상태 trades가 아직 없으면(null — 상태를 모름) 칸을 숨기고, 상태가 왔는데 기록이 없으면 '아직 기록이 없습니다' 한 줄,
// 1차 체결가를 아는 추가 진입 매매가 없으면 '아직 셈할 기록이 없습니다' 한 줄.
// 프로 자격·켜짐과 상관없이 기록이 있으면 보인다 — 회원 자기 지난 매매 숫자일 뿐이고, 이 칸은 약속·예상 없이 지난 기록만.
// DOM은 createElement·textContent만(CSP — style 속성·HTML 문자열 없음, 막대 높이는 클래스 eq-l0~eq-l8)
import { entryQuality, qualityView, EQ_TEXT } from '../lib/entry-quality.js';

export function createEntryQuality({ doc = globalThis.document, getTrades = () => null, now = () => Date.now() } = {}) {
  const node = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const el = node('div', 'pro-sec eq-box');
  el.id = 'eq-box';
  el.hidden = true;
  const title = node('h3', 'pro-sec-title eq-title', EQ_TEXT.title);
  const empty = node('p', 'eq-empty', EQ_TEXT.empty);
  const noData = node('p', 'eq-empty eq-nodata', EQ_TEXT.noData);
  const big = node('p', 'eq-big');
  const label = node('p', 'eq-label');
  const lines = node('div', 'eq-lines');
  const bars = node('div', 'eq-bars');
  bars.setAttribute('aria-hidden', 'true'); // 막대는 꾸밈 — 같은 값이 위 글에 있음
  el.append(title, empty, noData, big, label, lines, bars);

  const tryGet = (fn) => {
    try {
      return fn();
    } catch {
      return null;
    }
  };

  function refresh() {
    const trades = tryGet(getTrades);
    if (!Array.isArray(trades)) {
      el.hidden = true;
      return null;
    }
    const v = qualityView(entryQuality(trades, { now: tryGet(now) ?? Date.now() }));
    el.hidden = false;
    empty.hidden = v.empty == null;
    noData.hidden = v.noData == null;
    big.hidden = v.big == null;
    big.textContent = v.big ?? '';
    label.hidden = v.label == null;
    label.textContent = v.label ?? '';
    lines.replaceChildren(...v.lines.map((t) => node('p', 'eq-line', t)));
    bars.replaceChildren(...v.bars.map((b) => node('span', `eq-bar eq-l${b.level}${b.neg ? ' neg' : ''}`)));
    bars.hidden = v.bars.length === 0;
    return v;
  }

  return { el, refresh };
}
