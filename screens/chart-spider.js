// 거미줄 연출 그리기 층(2026-11-23, 2026-11-25 '진짜 거미줄' 판 — 프로 회원 전용, 계획·시간표는 lib/spider.js). 트레이딩 탭 큰 차트(.chart-big — position:relative) 위에
// 캔버스 하나(.chart-spider — app.css, 클릭은 차트로 지나감)를 겹쳐 lightweight-charts 좌표(priceToCoordinate·timeToCoordinate)로 그린다.
// chart-position-overlay.js처럼 순수 값(시간표 frame)을 받아 얇게 붙이기만 — 가격 숫자는 쓰지 않고 이름표는 시간표의 낱말(1차·2차·3차·4차·익절)만.
// 모양(거미줄): 진입점(2·3·4차는 평단 쪽)에서 칸 자리마다 방사선(살)이 수십 ms 간격으로 뻗고(끝에 빛나는 점), 이웃한 살끼리 가는 실(동심원 — 안쪽에서 바깥으로 세 겹, 살짝 처짐)이 엮인다.
//   살 끝 = 오른쪽 가격 눈금 옆의 칸 눈금(차수마다 한 묶음). 도착하면 작은 불꽃, 체결되면 칸이 번쩍하고 밝고 굵어지며, 켜진 2·3·4차는 그 자리에서 고리가 퍼지며 한 번 더 펼쳐진다. 다 깔리면 은은한 정지 모양.
//   평단 선은 진입점에서 눈금 묶음 앞까지(체결마다 시간표가 조금씩 옮김), 익절은 금색 점선. 차트를 가리지 않게 선은 모두 가늘고 반투명(살·실 합쳐 차수당 한 번에 모아 그림 — 선 수·점 수 상한은 칸 수 43).
// 확대: 시간표가 준 확대 값(f.zoom)을 onZoom으로 바깥(modes/trade.js — 차트 보이는 범위)에 그대로 넘기기만 한다. 끝나면 null.
// 움직임은 requestAnimationFrame(연출이 도는 동안만), 그 밖에는 차트 범위가 바뀔 때·새 계획이 올 때·가격이 올 때 한 번씩 다시 그린다. getPx = 지금 가격(없으면 undefined — 조건 켜짐 판정에만).
// prefers-reduced-motion이면 시간표가 끝 모양만 준다(움직임·확대 없음). CSP: style 속성 없음 — 크기는 캔버스 width·height 속성, 자리는 CSS 클래스
import { createSpiderTimeline } from '../lib/spider.js';

export const SPIDER_COLORS = Object.freeze({ line: '#58a6ff', filled: '#9fd0ff', tp: '#f5c542', avg: '#e6edf6', long: '#3fb950', short: '#f85149', label: '#c8d8f0', spark: '#ffe08a', tip: '#ffffff' });
const TICK_LEN = 20; // 칸 눈금 길이(px)
const FAN_MIN = 70; // 진입점에서 눈금 묶음까지 최소 거리(px) — 살이 펼쳐질 자리
const RINGS = [0.34, 0.58, 0.8]; // 실이 엮이는 자리(살 길이의 비율)
const SAG = 0.14; // 실이 가운데 쪽으로 처지는 정도
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const out = (x) => 1 - (1 - x) * (1 - x);

export function createChartSpider({ doc = globalThis.document, win = globalThis.window, container, getChart = () => null, xOf = () => null, getPx = () => undefined, now = () => Date.now(), onZoom = () => {}, onShape = () => {} } = {}) {
  const reduced = () => {
    try {
      return !!(win && typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      return false;
    }
  };
  const tl = createSpiderTimeline({ now, reduced });
  let canvas = null;
  let raf = null;
  let zoomOn = false;
  let lastSig = '';
  const ensure = () => {
    if (canvas || !container || !doc || typeof doc.createElement !== 'function') return canvas;
    canvas = doc.createElement('canvas');
    canvas.className = 'chart-spider';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    container.append(canvas);
    return canvas;
  };
  // 한 차수의 거미줄 — O = 살이 뻗는 중심, 칸 자리 = (xl, 칸 y)
  function drawLadder(ctx, L, O, xl, xr, yOf, f, h) {
    const nodes = L.cells.map((c) => {
      const y = yOf(c.price);
      return y == null ? null : { x: xl, y, c, s: out(c.p) };
    });
    const at = (n, s) => ({ x: O.x + (n.x - O.x) * s, y: O.y + (n.y - O.y) * s });
    const wA = f.alpha * L.web;
    ctx.lineCap = 'round';
    // 살 — 안 들어간 칸은 가늘고 푸르게, 체결된 칸은 밝게(두 묶음)
    for (const lit of [false, true]) {
      ctx.beginPath();
      let any = false;
      for (const n of nodes) {
        if (!n || n.s <= 0 || (n.c.fill > 0.5) !== lit) continue;
        const e = at(n, n.s);
        ctx.moveTo(O.x, O.y);
        ctx.lineTo(e.x, e.y);
        any = true;
      }
      if (!any) continue;
      ctx.strokeStyle = lit ? SPIDER_COLORS.filled : SPIDER_COLORS.line;
      ctx.lineWidth = lit ? 1 : 0.7;
      ctx.globalAlpha = wA * (lit ? 0.75 : 0.5);
      ctx.stroke();
    }
    // 실 — 이웃한 살끼리 안쪽에서 바깥으로, 살이 그 자리까지 뻗은 만큼만(처진 곡선을 짧은 선분으로)
    ctx.beginPath();
    let anyRing = false;
    for (const r of RINGS) {
      for (let i = 0; i + 1 < nodes.length; i += 1) {
        const a = nodes[i];
        const b = nodes[i + 1];
        if (!a || !b) continue;
        const q = clamp01((Math.min(a.s, b.s) - r) / 0.2);
        if (q <= 0) continue;
        const pa = at(a, r);
        const pb = at(b, r);
        const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        const c = { x: mid.x + (O.x - mid.x) * SAG, y: mid.y + (O.y - mid.y) * SAG };
        const bez = (t) => ({ x: (1 - t) * (1 - t) * pa.x + 2 * (1 - t) * t * c.x + t * t * pb.x, y: (1 - t) * (1 - t) * pa.y + 2 * (1 - t) * t * c.y + t * t * pb.y });
        ctx.moveTo(pa.x, pa.y);
        for (let k = 1; k <= 3; k += 1) {
          const p = bez((q * k) / 3);
          ctx.lineTo(p.x, p.y);
        }
        anyRing = true;
      }
    }
    if (anyRing) {
      ctx.strokeStyle = SPIDER_COLORS.line;
      ctx.lineWidth = 0.6;
      ctx.globalAlpha = wA * 0.4;
      ctx.stroke();
    }
    // 뻗는 중인 살 끝의 빛나는 점
    ctx.beginPath();
    let anyTip = false;
    for (const n of nodes) {
      if (!n || n.s <= 0 || n.s >= 1) continue;
      const e = at(n, n.s);
      ctx.moveTo(e.x + 2, e.y);
      ctx.arc(e.x, e.y, 2, 0, Math.PI * 2);
      anyTip = true;
    }
    if (anyTip) {
      ctx.fillStyle = SPIDER_COLORS.tip;
      ctx.globalAlpha = f.alpha * 0.9;
      ctx.fill();
    }
    // 칸 눈금 — 안 들어간 칸은 흐리게, 체결된 칸은 밝고 굵게
    let minY = Infinity;
    for (const n of nodes) {
      if (!n) continue;
      minY = Math.min(minY, n.y);
      if (n.c.a <= 0.01) continue;
      ctx.globalAlpha = f.alpha * n.c.a;
      ctx.strokeStyle = n.c.fill > 0.5 ? SPIDER_COLORS.filled : SPIDER_COLORS.line;
      ctx.lineWidth = n.c.w;
      ctx.beginPath();
      ctx.moveTo(xl, n.y);
      ctx.lineTo(xr, n.y);
      ctx.stroke();
    }
    // 도착 불꽃 · 체결 번쩍
    let sp = 0;
    let fl = 0;
    ctx.beginPath();
    nodes.forEach((n, i) => {
      if (!n || n.c.spark <= 0.02) return;
      sp = Math.max(sp, n.c.spark);
      for (let j = 0; j < 4; j += 1) {
        const ang = i * 2.399 + (j * Math.PI) / 2;
        const l0 = 2 + (1 - n.c.spark) * 8;
        const l1 = l0 + 2 + 3 * n.c.spark;
        ctx.moveTo(n.x + Math.cos(ang) * l0, n.y + Math.sin(ang) * l0);
        ctx.lineTo(n.x + Math.cos(ang) * l1, n.y + Math.sin(ang) * l1);
      }
    });
    if (sp > 0) {
      ctx.strokeStyle = SPIDER_COLORS.spark;
      ctx.lineWidth = 1;
      ctx.globalAlpha = f.alpha * sp;
      ctx.stroke();
    }
    ctx.beginPath();
    for (const n of nodes) {
      if (!n || n.c.flash <= 0.02) continue;
      fl = Math.max(fl, n.c.flash);
      ctx.moveTo(n.x + 3 + 9 * (1 - n.c.flash), n.y);
      ctx.arc(n.x, n.y, 3 + 9 * (1 - n.c.flash), 0, Math.PI * 2);
    }
    if (fl > 0) {
      ctx.strokeStyle = SPIDER_COLORS.tip;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = f.alpha * fl;
      ctx.stroke();
    }
    // 켜진 2·3·4차 — 중심에서 고리가 퍼짐(폭발형)
    if (L.burst != null) {
      ctx.beginPath();
      ctx.arc(O.x, O.y, 6 + 46 * out(L.burst), 0, Math.PI * 2);
      ctx.strokeStyle = SPIDER_COLORS.filled;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = f.alpha * (1 - L.burst) * 0.8;
      ctx.stroke();
    }
    // 이름표 — 묶음 위쪽(살과 안 겹침)
    if (minY !== Infinity && L.labelA > 0.01) {
      ctx.globalAlpha = f.alpha * Math.min(1, L.labelA + (L.on ? 0.3 : 0));
      ctx.fillStyle = SPIDER_COLORS.label;
      ctx.fillText(L.label, xr, Math.max(12, minY - 7));
    }
    ctx.globalAlpha = 1;
  }
  function draw() {
    raf = null;
    let px;
    try { px = getPx(); } catch { px = undefined; }
    const f = tl.frame(px);
    const z = f ? f.zoom : null;
    if (z || zoomOn) {
      zoomOn = !!z;
      try { onZoom(z); } catch { /* 차트 쪽 실패는 그림에 영향 없음 */ }
    }
    const sig = f ? f.ladders.map((l) => l.stage).join(',') : '';
    if (sig !== lastSig) {
      lastSig = sig;
      try { onShape(); } catch { /* 위와 같음 */ }
    }
    const cv = ensure();
    if (!cv) return;
    const refs = getChart();
    if (!f || !refs || !refs.chart || !refs.series) {
      cv.hidden = true;
      return;
    }
    const ctx = typeof cv.getContext === 'function' ? cv.getContext('2d') : null;
    if (!ctx) return;
    cv.hidden = false;
    const dpr = (win && win.devicePixelRatio) || 1;
    const w = container.clientWidth || 0;
    const h = container.clientHeight || 0;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    let scaleW = 0;
    try { scaleW = refs.chart.priceScale('right').width() || 0; } catch { scaleW = 0; }
    const xR = Math.max(0, w - scaleW - 6);
    const yOf = (p) => {
      try {
        const y = refs.series.priceToCoordinate(p);
        return typeof y === 'number' && Number.isFinite(y) ? y : null;
      } catch {
        return null;
      }
    };
    const y0 = yOf(f.entry.price);
    const xr = xR - 4; // 눈금 묶음의 오른쪽 끝
    const xl = xr - TICK_LEN;
    let x0 = xOf(f.entry.at);
    if (typeof x0 !== 'number' || !Number.isFinite(x0)) x0 = xR * 0.55;
    x0 = Math.max(6, Math.min(x0, xl - FAN_MIN)); // 살이 펼쳐질 자리를 남김
    if (y0 == null) return;
    ctx.globalAlpha = f.alpha;
    ctx.font = '11px Galmuri11, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    // 평단 선 — 진입점에서 눈금 묶음 앞까지(체결마다 조금씩 움직임)
    const ya = yOf(f.avg.price);
    if (ya != null && f.avg.a > 0) {
      ctx.save();
      ctx.strokeStyle = SPIDER_COLORS.avg;
      ctx.globalAlpha = f.alpha * 0.55 * f.avg.a;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, ya);
      ctx.lineTo(Math.max(x0, xl - 34), ya);
      ctx.stroke();
      ctx.restore();
    }
    // 익절 — 금색 점선이 진입점 쪽에서 오른쪽으로 그어짐
    if (f.tp && f.tp.progress > 0) {
      const y = yOf(f.tp.price);
      if (y != null) {
        ctx.save();
        ctx.strokeStyle = SPIDER_COLORS.tp;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + (xR - x0) * f.tp.progress, y);
        ctx.stroke();
        if (f.tp.progress >= 1) {
          ctx.setLineDash([]);
          ctx.fillStyle = SPIDER_COLORS.tp;
          ctx.fillText(f.tp.label, xR - 2, y - 4);
        }
        ctx.restore();
      }
    }
    // 거미줄 — 차수마다 한 묶음. 1차는 진입점에서, 2·3·4차는 평단 선 쪽에서 살이 뻗음
    for (const L of f.ladders) {
      const oy = L.stage === 1 ? y0 : Math.max(8, Math.min(h - 8, ya != null ? ya : y0));
      drawLadder(ctx, L, { x: x0, y: oy }, xl, xr, yOf, f, h);
    }
    // 1차 체결 점 + 작은 파동
    const dot = f.side === 'short' ? SPIDER_COLORS.short : SPIDER_COLORS.long;
    ctx.globalAlpha = f.alpha;
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(x0, y0, 4, 0, Math.PI * 2);
    ctx.fill();
    if (f.entry.ripple != null) {
      ctx.strokeStyle = dot;
      ctx.globalAlpha = f.alpha * (1 - f.entry.ripple);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x0, y0, 4 + 18 * f.entry.ripple, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (f.animating) schedule();
  }
  function schedule() {
    if (raf != null) return;
    const ask = win && typeof win.requestAnimationFrame === 'function' ? (fn) => win.requestAnimationFrame(fn) : (fn) => setTimeout(fn, 16);
    raf = ask(draw);
  }
  return {
    // 계획(lib/spider.js spiderPlan) | null — 같은 매매면 이어서, null이면 걷힘
    apply(plan) {
      tl.update(plan || null);
      schedule();
    },
    redraw: schedule,
    frame: (px) => tl.frame(px),
    shown: () => tl.shown(), // 지금 나와 있는 칸·선의 가격들(자동 눈금용)
    cancelZoom() { // 회원이 차트를 만짐 — 확대를 바로 풀고 한 번 더 그려 되돌림
      tl.cancelZoom();
      schedule();
    },
  };
}
