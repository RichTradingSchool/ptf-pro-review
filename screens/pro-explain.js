// '프로 모드란?' 설명 연출(2026-11-23 대표 요청) — 프로 모드 화면의 버튼을 누르면 전체 화면으로 뜨는 20~30초짜리 앱 안 장면(영상 파일 아님).
// 장면 목록은 lib/pro-view.js explainScenes(글 한 줄 + 그림 낱말), 그림은 이 파일이 만든 칸 + app.css .pxe-* 키프레임(움직임은 CSS만 — 줄이기 설정이면
// @media (prefers-reduced-motion: reduce)·.pxe-still이 끝 모양만). 장면마다 EXPLAIN_SCENE_MS(1.8초) 뒤 다음, 건너뛰기 = 다음 장면,
// 끝에 성과판(lib/pro-view.js explainSummary — 2026-11-28 큰 숫자 타일·일반/프로 막대·날씨 세 칸·알약, 옛 2026-11-24 글 줄 목록을 바꿈)과 다시 보기·닫기. Esc로 닫힘.
// DOM은 createElement·textContent만(CSP — style 속성·HTML 문자열 없음)
import { AUTO_TEXT } from '../lib/follow-text.js';
import { EXPLAIN_SCENE_MS, LADDER_CELLS } from '../lib/pro-view.js';

const COUNT_MS = 900;
const COUNT_GAP_MS = 140;

export function createProExplain({ doc = globalThis.document, win = globalThis.window, host, timers = globalThis, scenes = () => [], summary = () => null } = {}) {
  const X = AUTO_TEXT.pro.explain;
  const node = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const button = (cls, text) => {
    const b = node('button', cls, text);
    b.type = 'button';
    return b;
  };
  const box = node('div', 'pxe');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', X.title);
  box.hidden = true;
  const title = node('h2', 'pxe-title', X.title);
  const stage = node('div', 'pxe-stage');
  const line = node('p', 'pxe-line');
  line.setAttribute('aria-live', 'polite');
  const dots = node('div', 'pxe-dots');
  const skip = button('pxe-skip', X.skip);
  const replay = button('pxe-replay', X.replay);
  const close = button('pxe-close', X.close);
  const foot = node('div', 'pxe-foot');
  foot.append(skip, replay, close);
  // 끝 요약 칸(대표 요청 2026-11-24) — 장면이 다 지나가면 그림·한 줄·점 대신 이 칸
  const sum = node('div', 'pxe-sum');
  sum.hidden = true;
  box.append(title, stage, line, dots, sum, foot);
  if (host) host.append(box);

  // 장면 그림 — 칸과 클래스만(움직임은 app.css 키프레임)
  function picture(s) {
    const pic = node('div', `pxe-scene pxe-${s.key}`);
    if (s.key === 'gauge') {
      const track = node('div', 'pxe-gauge-track');
      track.append(node('div', 'pxe-gauge-fill'));
      pic.append(track);
    } else if (s.key === 'weather') {
      const W = AUTO_TEXT.pro.weather;
      for (const k of ['clear', 'cloudy', 'storm']) pic.append(node('span', `pxe-chip ${k}`, W[k]));
    } else if (s.key === 'storm') {
      const track = node('div', 'pxe-first-track');
      track.append(node('div', 'pxe-first-fill'));
      pic.append(track);
      // 옛 13%→9.1% 숫자 둘 대신 긍정형 꼬리(2026-11-28): '손실 20% 줄임'(아래 화살표는 CSS)·출처
      if (s.gain) pic.append(node('span', 'pxe-pct pxe-gain', s.gain));
      if (s.src) pic.append(node('span', 'pxe-storm-src', s.src));
    } else if (s.key === 'ladder') {
      // 거미줄 모드 축소판 — 진입 점 아래로 1% 칸이 차수마다 한 묶음씩 촤르륵 깔림(묶음 자리는 app.css .pxe-grp-N, 칸 순서 지연은 :nth-child, 움직임은 키프레임)
      const lad = node('div', 'pxe-lad');
      lad.append(node('span', 'pxe-lad-entry'));
      LADDER_CELLS.forEach((count, g) => {
        const grp = node('div', `pxe-grp pxe-grp-${g + 1}`);
        grp.append(node('span', 'pxe-grp-label', `${g + 1}차`));
        for (let k = 0; k < count; k += 1) grp.append(node('span', 'pxe-cell'));
        lad.append(grp);
      });
      pic.append(lad);
    } else if (s.key === 'lev') {
      pic.append(node('span', 'pxe-lev-num', s.range || ''));
    } else if (s.key === 'switch') {
      // 기능마다 켜고 끄기(2026-11-28) — 작은 스위치 셋이 차례로 켜짐(지연은 app.css :nth-child)
      for (let k = 0; k < 3; k += 1) {
        const sw = node('div', 'pxe-sw');
        sw.append(node('span', 'pxe-sw-knob'), node('span', 'pxe-sw-off', AUTO_TEXT.off), node('span', 'pxe-sw-on', AUTO_TEXT.on));
        pic.append(sw);
      }
    }
    return pic;
  }

  let list = [];
  let i = 0;
  let timer = null;
  let isOpen = false;
  const stop = () => {
    if (timer != null) timers.clearTimeout(timer);
    timer = null;
  };
  function paintDots() {
    dots.replaceChildren(...list.map((_, k) => node('span', k === Math.min(i, list.length - 1) ? 'pxe-dot on' : 'pxe-dot')));
  }
  // 성과판 큰 숫자 올라가기(pro-page.js 효과 숫자와 같은 결 — 움직임 줄이기·그리기 틀 없음이면 바로 끝 값). 타일마다 조금씩 늦게 시작
  let raf = 0;
  const stopCount = () => {
    if (raf && win && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(raf);
    raf = 0;
  };
  const numText = (n, v) => `${n.sign}${v.toFixed(n.digits)}${n.unit}`;
  function countAll(items) {
    stopCount();
    if (box.classList.contains('pxe-still') || !win || typeof win.requestAnimationFrame !== 'function') {
      for (const it of items) it.el.textContent = it.num.text;
      return;
    }
    let t0 = null;
    const step = (ts) => {
      raf = 0;
      if (t0 == null) t0 = ts;
      let done = true;
      items.forEach((it, k) => {
        const p = Math.min(1, Math.max(0, (ts - t0 - k * COUNT_GAP_MS) / COUNT_MS));
        if (p < 1) done = false;
        it.el.textContent = p >= 1 ? it.num.text : numText(it.num, it.num.from + (it.num.value - it.num.from) * (1 - (1 - p) ** 3));
      });
      if (!done) raf = win.requestAnimationFrame(step);
    };
    for (const it of items) it.el.textContent = numText(it.num, it.num.from);
    raf = win.requestAnimationFrame(step);
  }
  // 끝 성과판(2026-11-28) — 제목·비교 한 줄 → 큰 숫자 타일(첫 타일 크게·일반/프로 막대·출처 꼬리) → 날씨 세 칸(1차 비중 막대, 폭풍만 줄어듦) → 알약 둘.
  // 막대 폭은 CSS 칸 클래스 pxe-wNN만(style 속성 없음)
  function paintSum(info) {
    const parts = [node('h3', 'pxe-sum-title', info.title), node('p', 'pxe-sum-cap', info.cap)];
    const counts = [];
    const tiles = node('div', 'pxe-tiles');
    info.tiles.forEach((t, k) => {
      const el = node('div', `pxe-tile pxe-tile-${t.key}${k === 0 ? ' pxe-tile-hero' : ''}`);
      const numRow = node('div', 'pxe-tile-num');
      const big = node('span', 'pxe-big', t.num.text);
      numRow.append(big, node('span', 'pxe-tile-metric', t.metric));
      counts.push({ el: big, num: t.num });
      const cmp = node('div', 'pxe-cmp');
      for (const b of t.bars) {
        const row = node('div', `pxe-cmp-row ${b.who}`);
        const track = node('span', 'pxe-cmp-track');
        track.append(node('span', `pxe-cmp-fill pxe-w${b.w}`));
        row.append(node('span', 'pxe-cmp-who', b.label), track, node('span', 'pxe-cmp-val', String(b.value)));
        cmp.append(row);
      }
      el.append(node('p', 'pxe-tile-name', t.name), numRow, cmp, node('p', 'pxe-tile-src', t.src));
      tiles.append(el);
    });
    parts.push(tiles);
    if (Array.isArray(info.weather) && info.weather.length) {
      const wx = node('div', 'pxe-wx');
      const cells = node('div', 'pxe-wx-cells');
      for (const c of info.weather) {
        const cell = node('div', `pxe-wx-cell ${c.tier}`);
        cell.append(node('span', 'pxe-wx-icon'), node('span', 'pxe-wx-name', c.name));
        if (c.lev) cell.append(node('span', 'pxe-wx-lev', c.lev));
        cell.append(node('span', 'pxe-wx-word', c.word));
        const track = node('span', 'pxe-wx-track');
        track.append(node('span', `pxe-wx-fill pxe-w${c.w}`));
        if (c.cut && c.w < 100) track.append(node('span', `pxe-wx-cut pxe-w${100 - c.w}`));
        cell.append(track);
        cells.append(cell);
      }
      wx.append(node('p', 'pxe-wx-title', info.wxTitle), cells);
      parts.push(wx);
    }
    const pills = node('div', 'pxe-pills');
    info.pills.forEach((t, k) => pills.append(node('span', `pxe-pill ${k === 0 ? 'pxe-pill-tog' : 'pxe-pill-gate'}`, t)));
    parts.push(pills);
    sum.replaceChildren(...parts);
    countAll(counts);
  }
  function show(k) {
    stop();
    stopCount();
    i = k;
    const ended = i >= list.length;
    const s = list[Math.min(i, list.length - 1)];
    let info = null;
    if (ended) {
      try { info = summary(); } catch { info = null; }
    }
    const summed = !!(info && Array.isArray(info.tiles) && Array.isArray(info.pills));
    if (summed) paintSum(info);
    sum.hidden = !summed;
    stage.hidden = summed;
    line.hidden = summed;
    dots.hidden = summed;
    if (!ended || !stage.children.length) {
      stage.replaceChildren(picture(s));
      line.replaceChildren(node('span', 'pxe-line-t', s.text)); // 새 칸이라 들어오는 움직임이 장면마다 다시
      if (s.sub) line.append(node('span', 'pxe-line-sub', s.sub)); // 둘째 줄(거미줄 모드 — 손익비)
    }
    skip.hidden = ended;
    replay.hidden = !ended;
    paintDots();
    if (!ended) timer = timers.setTimeout(() => show(i + 1), (s && s.ms) || EXPLAIN_SCENE_MS);
  }
  const onKey = (e) => { if (isOpen && e && e.key === 'Escape') hide(); };
  function open() {
    list = scenes() || [];
    if (!list.length) return false;
    let still = false;
    try { still = !!(win && typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { still = false; }
    box.classList.toggle('pxe-still', still);
    box.hidden = false;
    isOpen = true;
    if (win && typeof win.addEventListener === 'function') win.addEventListener('keydown', onKey);
    stage.replaceChildren();
    show(0);
    return true;
  }
  function hide() {
    stop();
    stopCount(); // 남은 숫자는 다음에 요약을 그릴 때 처음부터
    box.hidden = true;
    isOpen = false;
    if (win && typeof win.removeEventListener === 'function') win.removeEventListener('keydown', onKey);
  }
  skip.addEventListener('click', () => show(i + 1));
  replay.addEventListener('click', () => { stage.replaceChildren(); show(0); });
  close.addEventListener('click', () => hide());
  return { el: box, open, close: hide, isOpen: () => isOpen, scene: () => (list[i] ? list[i].key : null) };
}
