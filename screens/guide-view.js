// 입금·사용 가이드 창(2026-10-28 대표 요청 — 'PDF가 새 창으로 열리면 돌아오는 법을 몰라 앱을 껐다 켠다'). 상단 띠 '📄 가이드'를 누르면
// PDF 대신 앱 안 전체 화면 창에 같은 쪽 그림(guide/ox-deposit-pages/<n>.webp — tools/make_deposit_pages.py)을 세로로 띄운다.
// 닫기: 오른쪽 위 ✕ · Esc · 휴대폰 뒤로가기(열 때 history 한 칸을 쌓고 popstate로 닫음). 열린 동안 html.guide-open. DOM은 createElement·textContent만(CSP)
export const GUIDE_VIEW_TEXT = Object.freeze({
  title: '입금·사용 가이드',
  tbTitle: '투빗 입금·사용 가이드',
  close: '✕',
  closeLabel: '닫기',
  page: (n) => `가이드 ${n}쪽`,
});
export const GUIDE_OPEN_CLASS = 'guide-open';
export const GUIDE_PAGES_DIR = 'guide/ox-deposit-pages';
// 투빗 입금·사용 가이드(2026-11-23 — 업비트 → 투빗, tools/make_tb_deposit_guide.py): 빌드가 투빗이 켜진 s·j판에만 싣는다(PDF + 쪽 그림)
export const TB_GUIDE_PAGES_DIR = 'guide/tb-deposit-pages';
export const TB_DEPOSIT_PDF = 'guide/tb-deposit.pdf';
const PAGE_RE = /^[0-9]{1,2}\.webp$/;
const rootOf = (doc) => (doc && doc.documentElement && doc.documentElement.classList ? doc.documentElement : null);

// pages = ['1.webp', …](loadGuidePages로 받음). 비면 open이 false — 부르는 쪽이 PDF 링크로. dir = 쪽 그림 폴더(오렌지엑스 기본·투빗 TB_GUIDE_PAGES_DIR)
export function createGuideView({ doc = document, win = window, pages = [], dir = GUIDE_PAGES_DIR, title = GUIDE_VIEW_TEXT.title } = {}) {
  const clean = (ps) => (Array.isArray(ps) ? ps.filter((p) => typeof p === 'string' && PAGE_RE.test(p)).slice(0, 20) : []);
  let list = clean(pages);
  let box = null;
  let pushed = false;
  let back = null;
  const onKey = (e) => {
    if (!e || e.key !== 'Escape') return;
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    close();
  };
  const onPop = () => { pushed = false; close({ fromPop: true }); };

  function close({ fromPop = false } = {}) {
    if (!box) return;
    box.remove();
    box = null;
    if (doc.removeEventListener) doc.removeEventListener('keydown', onKey);
    if (win && win.removeEventListener) win.removeEventListener('popstate', onPop);
    const root = rootOf(doc);
    if (root) root.classList.remove(GUIDE_OPEN_CLASS);
    // ✕·Esc로 닫으면 열 때 쌓은 한 칸을 되돌린다(뒤로가기로 닫았으면 이미 빠짐)
    if (!fromPop && pushed && win && win.history && typeof win.history.back === 'function') win.history.back();
    pushed = false;
    const prev = back;
    back = null;
    if (prev && prev !== doc.body && prev.isConnected === true && typeof prev.focus === 'function') prev.focus();
  }

  function open() {
    if (!doc || !doc.body || !list.length) return false;
    if (box) return true;
    back = doc.activeElement || null;
    const el = (tag, cls, text) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const m = el('div', 'guide-view');
    m.id = 'guide-view';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', title);
    const bar = el('div', 'guide-view-bar');
    const x = el('button', 'guide-view-close', GUIDE_VIEW_TEXT.close);
    x.type = 'button';
    x.setAttribute('aria-label', GUIDE_VIEW_TEXT.closeLabel);
    x.addEventListener('click', () => close());
    bar.append(el('h2', 'guide-view-title', title), x);
    const body = el('div', 'guide-view-body');
    list.forEach((p, i) => {
      const img = el('img', 'guide-view-page');
      img.src = `${dir}/${p}`;
      img.alt = GUIDE_VIEW_TEXT.page(i + 1);
      img.loading = i === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      body.append(img);
    });
    m.append(bar, body);
    box = m;
    doc.body.append(m);
    if (doc.addEventListener) doc.addEventListener('keydown', onKey);
    const root = rootOf(doc);
    if (root) root.classList.add(GUIDE_OPEN_CLASS);
    // 휴대폰 뒤로가기 = 닫기 — 같은 주소로 한 칸 쌓는다(hashchange 없음)
    if (win && win.history && typeof win.history.pushState === 'function') {
      try {
        win.history.pushState({ ptfGuide: 1 }, '');
        pushed = true;
        if (win.addEventListener) win.addEventListener('popstate', onPop);
      } catch { pushed = false; }
    }
    if (typeof x.focus === 'function') x.focus({ preventScroll: true });
    return true;
  }

  return { open, close, isOpen: () => !!box, pages: () => [...list], setPages: (ps) => { list = clean(ps); } };
}

// <dir>/pages.json(빌드가 가이드를 실은 판에만 복사) → 쪽 이름 목록 | [](없음·실패 — 그때는 띠 가이드가 PDF 링크 그대로)
export async function loadGuidePages({ fetchImpl = globalThis.fetch, dir = GUIDE_PAGES_DIR } = {}) {
  try {
    const r = await fetchImpl(`${dir}/pages.json`, { cache: 'no-cache' });
    if (!r.ok) return [];
    const j = await r.json();
    return j && Array.isArray(j.pages) ? j.pages.filter((p) => typeof p === 'string' && PAGE_RE.test(p)) : [];
  } catch {
    return [];
  }
}
