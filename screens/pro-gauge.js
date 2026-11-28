// 트레이딩 탭 PRO 모드 활성화 게이지(대표 요청 2026-11-25) — 판정 상자와 ⚡ 오토 모드 카드 사이 자리(.trade-pro, app/modes/trade.js onOrderSlot의 pro).
// 'PRO 모드' + 상태 글('프로 모드까지 N USDT'·'잔고 확인 중'·'사용 가능 · 꺼짐'·'켜짐') + 막대(progress — 프로 화면 pro-page.js와 같은 꼴) + 총자산 줄.
// 모델은 app/lib/pro-view.js proGaugeModel(null이면 자리를 비움 — .trade-pro:empty 숨김). 게이지 전체가 버튼 하나 — 누르면 onOpen(프로 모드 화면).
// DOM은 createElement·textContent로만(CSP — 꾸밈 속성 없음). 한 번 만들고 글·값만 바꾼다
import { AUTO_TEXT } from '../lib/follow-text.js';

export function renderProGauge(slot, { doc = globalThis.document, onOpen = () => {} } = {}) {
  const G = AUTO_TEXT.pro.gauge;
  const node = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const btn = node('button', 'pro-gauge');
  btn.type = 'button';
  btn.id = 'pro-gauge';
  const head = node('span', 'pg-head');
  const title = node('span', 'pg-title', G.title);
  const text = node('span', 'pg-text');
  const go = node('span', 'pg-go', G.go);
  head.append(title, text, go);
  const bar = node('progress', 'pro-bar pg-bar');
  bar.max = 1;
  bar.value = 0;
  bar.setAttribute('aria-label', G.title);
  const sub = node('span', 'pg-sub');
  btn.append(head, bar, sub);
  btn.addEventListener('click', () => { try { onOpen(); } catch { /* 화면 열기 실패는 무시 */ } });

  let shown = false;
  function update(m) {
    if (!m) {
      slot.replaceChildren();
      shown = false;
      return;
    }
    text.textContent = m.text || '';
    bar.value = typeof m.ratio === 'number' && Number.isFinite(m.ratio) ? Math.min(1, Math.max(0, m.ratio)) : 0;
    sub.textContent = m.sub || '';
    sub.hidden = !m.sub;
    btn.classList.toggle('on', m.on === true);
    btn.classList.toggle('ready', m.stage === 'switch' || m.stage === 'judging');
    if (!shown) slot.replaceChildren(btn);
    shown = true;
  }
  return { update, el: btn };
}
