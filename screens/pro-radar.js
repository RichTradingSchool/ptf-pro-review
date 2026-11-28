// 시장 날씨 위젯(트레이딩 탭 위 한 줄)과 변동성 레이더(프로 모드 화면 안 칸) — 공개 날씨만 읽는다(app.js proFeed.weather()).
// DOM은 createElement·textContent만(CSP — style 속성·HTML 문자열 없음). 막대는 세 칸 span(단계만큼 .on) 또는 분위 값이 있을 때 <progress>.
// 레이더 칸 위쪽 '실시간 변동성 게이지'(2026-11-25): 큰 게이지는 늘 BTC(없으면 순위 첫 종목), 그 아래 다른 코인 4개(순위 목록 순서, 최대 4)가 같은 모양 작은 게이지 2×2.
//  - 켜지는 칸 = 허브 공개 날씨 칸(진실). 바늘은 앱이 받은 5분봉(허브 /v1/candles)·시세로 허브와 같은 식(R·P)을 지금 셈한 값이고 허브 칸 구간 안으로만 움직인다.
//  - 값을 못 받으면 칸 구간 안에서 잔잔히 흔들 뿐. 움직임은 보일 때만(start/stop + 문서가 숨으면 멈춤), 움직임 줄이기 설정이면 정지 모양. rAF는 하나로 다섯 바늘을 같이 돌린다.
//  - 봉 요청은 종목마다 20초에 한 번을 넘지 않고, 종목 사이는 4초 이상 엇갈린다(2초마다 보며 한 번에 한 종목만).
//  - 바늘 위치는 CSS 변수 --needle(0~1)을 CSSOM setProperty로만 바꾼다(style 속성 없음).
import { AUTO_TEXT } from '../lib/follow-text.js';
import {
  radarRows, widgetRows, RADAR_TEXT, RADAR_SEGS, GAUGE_ZONES, gaugeCuts, gaugeVolBars, zoneOfTier, zoneAt, nearZone, zoneCenter,
  clampToZone, gaugeReading, gaugeTarget, needleStep, needleSway,
} from '../lib/pro-radar.js';

const tryGet = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};
const mk = (doc) => (tag, cls, text) => {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const setVar = (n, k, v) => {
  if (n && n.style && typeof n.style.setProperty === 'function') n.style.setProperty(k, String(v));
};

// 위젯: 프로 자격 회원에게만, 날씨가 없으면 줄 숨김
export function createWeatherStrip({ doc = globalThis.document, getPro = () => null, getWeather = () => null } = {}) {
  const node = mk(doc);
  const W = AUTO_TEXT.pro.weather;
  const el = node('div', 'wx-strip');
  el.id = 'wx-strip';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', RADAR_TEXT.widgetLabel);
  el.hidden = true;
  function refresh() {
    const rows = widgetRows({ pro: tryGet(getPro), weather: tryGet(getWeather) });
    el.hidden = rows.length === 0;
    el.replaceChildren(...rows.map((r) => node('span', `pro-wx wx-chip ${r.tier}`, `${r.symbol} ${W[r.tier]}`)));
    return rows.length;
  }
  return { el, refresh };
}

export const GAUGE_NOTE = Object.freeze({ live: '칸은 허브 판정 · 바늘은 받은 5분봉으로 같은 식을 지금 셈', wait: '칸은 허브 판정 · 시세 기다리는 중' });
export const MINI_GAUGES = 4; // 큰 게이지(BTC) 아래 작은 게이지 수
const FRAME_MS = 33; // 초당 30번까지
const TEXT_MS = 400; // 읽기값·노트 갱신
const LOAD_MS = 20000; // 한 종목 봉 다시 받기(허브 봉 중계 — 차트·근거 창이 쓰는 같은 길)
const PUMP_MS = 2000; // 봉 요청 차례를 살피는 간격(한 번에 한 종목만)
const STAGGER_MS = 4000; // 종목과 종목 사이 최소 간격 — 다섯 종목이 한꺼번에 몰리지 않게
const BAR_LIMIT = 300;
const TIERS = ['clear', 'cloudy', 'storm'];

// 레이더: 프로 모드 화면 안(자격과 무관 — 공개 날씨), 날씨가 없으면 칸 숨김
// 큰 게이지 = 늘 BTC(날씨 목록에 없으면 순위 첫 줄), 작은 게이지 = 나머지 순위 목록 순서 최대 4개
// rules: pro-rules(weather·lev.volBars), loadBars(sym) → Promise<봉 목록|null>, getPx(sym) → 시세|null
export function createRadarList({
  doc = globalThis.document, win = null, getWeather = () => null, rules = null, loadBars = null, getPx = () => null, now = () => Date.now(),
} = {}) {
  const node = mk(doc);
  const W = AUTO_TEXT.pro.weather;
  const cuts = gaugeCuts(rules);
  const volBars = gaugeVolBars(rules);
  const el = node('div', 'pro-sec radar');
  el.hidden = true;
  const list = node('ul', 'radar-list');

  // 게이지 무대: 큰 다이얼·바늘 → 칸 세 개 → 작은 게이지 2×2 → 노트
  const stage = node('div', 'radar-stage');
  stage.hidden = true;
  const cells = node('div', 'radar-cells');
  const cellEls = TIERS.map((t) => {
    const c = node('span', `radar-cell ${t}`, W[t]);
    cells.append(c);
    return c;
  });
  const minisBox = node('div', 'radar-minis');
  minisBox.hidden = true;
  const note = node('p', 'radar-note', GAUGE_NOTE.wait);

  // ── 봉·요청 상태(종목마다 하나) ──
  const barsBy = new Map(); // 종목 → 5분봉 목록
  const loadedAt = new Map(); // 종목 → 마지막 요청 시각
  const inflight = new Set();
  let epoch = 0; // stop 때 올려 늦게 온 답을 버림
  let lastStartAt = -Infinity;
  let running = false;
  let raf = 0;
  let timer = null;
  let lastFrame = 0;
  let lastText = -Infinity;
  const reduced = () => !!(win && typeof win.matchMedia === 'function' && tryGet(() => win.matchMedia('(prefers-reduced-motion: reduce)').matches) === true);
  const canAnimate = () => !!(win && typeof win.requestAnimationFrame === 'function') && !reduced();

  // 게이지 하나 — 종목 줄(row)·읽기값·바늘 상태를 묶음. mini면 작은 모양(칸 세 개 줄 없음)
  function makeGauge(mini, phase, onZone) {
    const wrap = mini ? node('div', 'radar-mini') : null;
    const gauge = node('div', mini ? 'radar-gauge mini' : 'radar-gauge');
    gauge.setAttribute('role', 'img');
    const dial = node('div', 'radar-dial');
    const needle = node('div', 'radar-needle');
    const gLabel = node('p', 'radar-glabel', '');
    gauge.append(dial, needle, node('div', 'radar-hub'), gLabel);
    if (wrap) {
      wrap.hidden = true;
      wrap.append(gauge);
    }
    const u = { el: wrap || gauge, row: null, reading: null, ns: { pos: 0.5, vel: 0 }, litKey: '' };
    u.setRow = (row) => {
      const prev = u.row;
      u.row = row ? { symbol: row.symbol, tier: row.tier } : null;
      if (wrap) wrap.hidden = !u.row;
      if (!u.row) {
        u.reading = null;
        return;
      }
      const word = W[u.row.tier];
      gLabel.textContent = mini ? `${u.row.symbol} ${word}` : `${u.row.symbol} ${RADAR_TEXT.gaugeWord} ${word}`;
      gauge.setAttribute('aria-label', gLabel.textContent);
      if (wrap) wrap.setAttribute('data-tier', u.row.tier);
      if (!prev || prev.symbol !== u.row.symbol) u.reading = null;
    };
    u.recompute = () => {
      const r = u.row;
      const bars = r ? barsBy.get(r.symbol) : null;
      u.reading = r && bars ? gaugeReading({ bars, px: tryGet(() => getPx(r.symbol)), volBars }) : null;
    };
    u.target = (t) => {
      if (!u.row) return null;
      const tg = gaugeTarget({ tier: u.row.tier, reading: u.reading, cuts });
      if (!tg) return null;
      if (tg.live) return { ...tg, goal: tg.pos };
      // 시세가 없으면 칸 안 가운데에서 천천히 오가기(값이 아님) — 게이지마다 위상을 달리해 같이 흔들리지 않게
      const s = t + phase;
      return { ...tg, goal: zoneCenter(tg.zone) + 0.075 * Math.sin(s * 0.9) + 0.035 * Math.sin(s * 2.1 + 0.7) };
    };
    u.paint = (pos, zone) => {
      setVar(needle, '--needle', pos.toFixed(4));
      const near = nearZone(pos);
      const key = `${zone}|${near}`;
      if (key === u.litKey) return;
      u.litKey = key;
      if (onZone) onZone(zone, near);
    };
    u.draw = () => {
      u.recompute();
      const tg = u.target(0);
      if (!tg) return;
      u.ns = { pos: tg.goal, vel: 0 };
      u.paint(clampToZone(tg.goal, tg.zone), tg.zone);
    };
    u.step = (t, dt) => {
      const tg = u.target(t);
      if (!tg) return;
      u.ns = needleStep(u.ns, tg.goal, dt);
      u.paint(clampToZone(u.ns.pos + needleSway(t + phase, tg.live ? 0.018 : 0.008), tg.zone), tg.zone);
    };
    u.zone = () => (u.row ? zoneAt(u.ns.pos) : -1);
    return u;
  }
  const big = makeGauge(false, 0, (zone, near) => {
    cellEls.forEach((c, i) => {
      c.classList.toggle('on', i === zone);
      c.classList.toggle('near', i === near);
    });
    stage.setAttribute('data-tier', TIERS[zone]);
  });
  const minis = Array.from({ length: MINI_GAUGES }, (_, i) => makeGauge(true, (i + 1) * 1.7, null));
  const units = [big, ...minis];
  minisBox.append(...minis.map((m) => m.el));
  stage.append(big.el, cells, minisBox, note);
  el.append(node('h3', 'pro-sec-title radar-title', RADAR_TEXT.title), stage, list);

  // 큰 게이지 = 늘 BTC, 날씨 목록에 BTC가 없으면 순위 첫 줄
  function pickGaugeRow(rows) {
    if (!rows.length) return null;
    const r = rows.find((x) => x.symbol === 'BTC') || rows[0];
    return { symbol: r.symbol, tier: r.tier };
  }
  function paintNote() {
    const msg = big.reading ? GAUGE_NOTE.live : GAUGE_NOTE.wait;
    if (note.textContent !== msg) note.textContent = msg;
  }
  function drawStatic() {
    units.forEach((u) => u.draw());
    paintNote();
  }
  function frame(ts) {
    raf = 0;
    if (!running || (doc && doc.hidden === true)) return; // 숨으면 멈춤(보이면 visibilitychange가 다시 이음)
    raf = win.requestAnimationFrame(frame);
    if (ts - lastFrame < FRAME_MS) return;
    const dt = lastFrame ? (ts - lastFrame) / 1000 : 0.033;
    lastFrame = ts;
    if (ts - lastText >= TEXT_MS) {
      lastText = ts;
      units.forEach((u) => u.recompute());
      paintNote();
    }
    const t = ts / 1000;
    units.forEach((u) => u.step(t, dt));
  }
  function wake() {
    if (!running || raf || !canAnimate() || (doc && doc.hidden === true)) return;
    lastFrame = 0;
    raf = win.requestAnimationFrame(frame);
  }
  const onVis = () => { if (doc.hidden === true) { if (raf && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(raf); raf = 0; } else wake(); };

  async function fetchBars(sym) {
    const my = epoch;
    inflight.add(sym);
    let got = null;
    try {
      got = await loadBars(sym, BAR_LIMIT);
    } catch {
      got = null;
    }
    inflight.delete(sym);
    if (my !== epoch || !Array.isArray(got)) return;
    barsBy.set(sym, got);
    units.forEach((u) => { if (u.row && u.row.symbol === sym) u.recompute(); });
    if (!raf) drawStatic();
  }
  // 봉 요청 차례: 마지막 요청에서 STAGGER_MS가 지났을 때만 한 종목, 그 종목은 마지막 요청에서 LOAD_MS가 지났을 때만
  function pump() {
    if (typeof loadBars !== 'function' || !running || (doc && doc.hidden === true)) return;
    const t = now();
    if (t - lastStartAt < STAGGER_MS) return;
    for (const u of units) {
      const sym = u.row ? u.row.symbol : null;
      if (!sym || inflight.has(sym)) continue;
      const at = loadedAt.get(sym);
      if (at != null && t - at < LOAD_MS) continue;
      lastStartAt = t;
      loadedAt.set(sym, t);
      fetchBars(sym);
      return;
    }
  }
  function start() {
    if (running) return;
    running = true;
    units.forEach((u) => { u.litKey = ''; });
    drawStatic();
    pump();
    if (win && typeof win.setInterval === 'function') timer = win.setInterval(pump, PUMP_MS);
    if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVis);
    wake();
  }
  function stop() {
    if (!running) return;
    running = false;
    epoch += 1;
    if (raf && win && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(raf);
    raf = 0;
    if (timer != null && win && typeof win.clearInterval === 'function') win.clearInterval(timer);
    timer = null;
    if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVis);
  }

  function bar(r) {
    if (r.ratio != null) {
      const p = node('progress', `radar-ratio ${r.tier}`);
      p.max = 1;
      p.value = r.ratio;
      p.setAttribute('aria-label', W[r.tier]);
      return p;
    }
    const b = node('span', `radar-bar ${r.tier}`);
    for (let i = 0; i < RADAR_SEGS; i += 1) b.append(node('span', i < r.level ? 'radar-seg on' : 'radar-seg'));
    return b;
  }
  function refresh() {
    const rows = radarRows(tryGet(getWeather));
    el.hidden = rows.length === 0;
    list.replaceChildren(...rows.map((r) => {
      const li = node('li', `radar-row ${r.tier}`);
      li.append(node('span', 'radar-rank', String(r.rank)), node('span', 'radar-sym', r.symbol), node('span', `pro-wx ${r.tier}`, W[r.tier]), bar(r));
      return li;
    }));
    const row = pickGaugeRow(rows);
    big.setRow(row);
    const others = row ? rows.filter((r) => r.symbol !== row.symbol).slice(0, MINI_GAUGES) : [];
    minis.forEach((m, i) => m.setRow(others[i] || null));
    stage.hidden = !row || zoneOfTier(row.tier) < 0;
    minisBox.hidden = others.length === 0;
    if (running) pump();
    if (!raf) drawStatic(); // 멈춰 있거나 움직임 줄이기 — 정지 모양을 바로 맞춤(움직이는 중엔 프레임이 따라감)
    return rows.length;
  }
  return {
    el, refresh, start, stop, gaugeZone: () => big.zone(), zones: GAUGE_ZONES,
    minis: () => minis.map((m) => ({ symbol: m.row ? m.row.symbol : null, zone: m.zone() })),
  };
}
