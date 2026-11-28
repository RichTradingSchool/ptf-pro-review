// 프로 스킨·프로 금색 연출(2026-11-24) — 프로가 켜진 회원(실행기 보고 pro.elig && pro.on)의 앱 전체 검정·금색 옷과 매매 알림 반짝.
// 켜고 끄는 판단은 순수 함수(proSkinOn·shouldShine), 문서 루트 클래스·알림 배너 클래스만 만진다(CSS는 app.css 맨 끝 프로 스킨 덩어리).
// 새 알림 문구·소리는 없다 — 알림은 modes/auto.js 배너 그대로, 여기서는 배너에 클래스 하나만 얹는다.

export const PRO_SKIN_CLASS = 'pro-skin';
export const PRO_SHINE_CLASS = 'pro-shine';

// 반짝을 더하는 매매 사건 — 1차 진입(entry)·추가 진입(dca)·익절(tp). 손절·정리·조정은 그대로
const SHINE_KINDS = Object.freeze(['entry', 'dca', 'tp']);

// 스킨 켜짐 = 프로 자격 있음 + 켜짐(둘 다 참 값 그대로) + 서버 자동 자격 회원(로그아웃·비활성화면 옛 값이 남아도 끔)
export const proSkinOn = ({ pro = null, capable = false } = {}) => capable === true && !!pro && pro.elig === true && pro.on === true;

export const goldKind = (ev) => (ev && SHINE_KINDS.includes(ev.kind) ? ev.kind : null);

export const shouldShine = ({ proOn = false, ev = null } = {}) => proOn === true && goldKind(ev) !== null;

export function applyProSkin(root, on) {
  if (!root || !root.classList) return;
  root.classList.toggle(PRO_SKIN_CLASS, on === true);
}

// 알림 배너에 반짝 클래스를 더하거나 뺀다(늘 먼저 빼서 프로가 꺼졌거나 다른 사건이면 남지 않음). 연달아 뜨면 애니메이션을 다시 시작
export function shineAlert(box, ev, proOn) {
  if (!box || !box.classList) return;
  box.classList.remove(PRO_SHINE_CLASS);
  if (!shouldShine({ proOn, ev })) return;
  try {
    void box.offsetWidth; // 같은 애니메이션을 다시 시작하려면 한 번 계산을 거쳐야 한다(가짜 DOM에는 없음)
  } catch {
    // 계산 실패는 무시
  }
  box.classList.add(PRO_SHINE_CLASS);
}
