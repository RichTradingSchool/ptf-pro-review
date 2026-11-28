// 셸 → 사무실 창문 날씨(2026-11-25) — 사무실 큰 창문이 BTC 시장 날씨(변동성)에 따라 맑음·흐림·폭풍 모양으로 바뀐다.
// 허브 GET /v1/analysis/weather(공개 — 토큰 없음, fetchWeather)에서 BTC 줄의 tier만 골라 { type:'ptf:weather', v:1, tier } 로 보낸다
// (tier는 clear·cloudy·storm 낱말 하나 — 다른 칸·종목 없음). 공개 정보라 공용판·체험·회원 사무실 모두 같다.
// 보내는 때: 사무실이 준비될 때(가진 값 바로 + 새로 받기) · 받았을 때 처음 · 값이 바뀔 때(주기 WEATHER_EVERY_MS). 같은 값은 다시 보내지 않는다(준비마다 한 번은 보냄).
// 허브가 날씨를 못 주면(꺼짐 { items:[] }·BTC 줄 없음) 맑음 = 지금 창문. 받기 실패(null)는 앞 값 그대로(보낸 것을 거두지 않음). 숨은 탭에서는 받지 않는다.
export const WEATHER_EVERY_MS = 60000;
export const WEATHER_SYMBOL = 'BTC';
const TIERS = Object.freeze(['clear', 'cloudy', 'storm']);

export function weatherMessage(tier) {
  return { type: 'ptf:weather', v: 1, tier: TIERS.includes(tier) ? tier : 'clear' };
}

// fetchWeather 답 { at, items } → clear|cloudy|storm | null(받기 실패 — 앞 값 유지)
export function btcTier(w) {
  if (!w || typeof w !== 'object' || !Array.isArray(w.items)) return null;
  const x = w.items.find((i) => i && i.symbol === WEATHER_SYMBOL);
  return x && TIERS.includes(x.tier) ? x.tier : 'clear';
}

export function createOfficeWeather({ load, post, hidden = () => false, setTimer = setTimeout, clearTimer = clearTimeout, everyMs = WEATHER_EVERY_MS }) {
  let timer = null;
  let on = false; // 사무실 준비됨
  let sent = null; // 이 창에 마지막으로 보낸 낱말
  let last = null; // 마지막으로 받은 낱말
  let busy = false;
  let gen = 0; // 준비마다 새 번호 — 옛 주기가 겹쳐 돌지 않게

  const send = (tier) => {
    try {
      if (post(weatherMessage(tier)) !== false) sent = tier;
    } catch {
      // 사무실 전달 실패는 다음 주기에 다시
    }
  };

  async function pull() {
    if (busy || !on) return;
    busy = true;
    try {
      if (hidden()) return;
      let w = null;
      try { w = await load(); } catch { w = null; }
      const t = btcTier(w);
      if (!on || t === null) return;
      last = t;
      if (t !== sent) send(t);
    } finally {
      busy = false;
    }
  }
  function loop(g) {
    timer = setTimer(() => { pull().finally(() => { if (on && g === gen) loop(g); }); }, everyMs);
  }
  return {
    // 사무실 준비(office-ready) — 가진 값이 있으면 바로, 그리고 새로 받기
    ready() {
      on = true;
      gen += 1;
      const g = gen;
      sent = null;
      if (last) send(last);
      if (timer) clearTimer(timer);
      timer = null;
      pull().finally(() => { if (on && g === gen) loop(g); });
    },
    stop() {
      on = false;
      gen += 1;
      if (timer) clearTimer(timer);
      timer = null;
    },
    pull,
    last: () => last,
  };
}
