// Thin WebSocket wrapper shared by all clients — now with auto-reconnect.
// A venue-WiFi blip used to strand every phone on a dead socket; this reconnects with
// backoff and re-sends the last join so guests rejoin automatically.
export function connect(handlers = {}) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  let ws = null, queue = [], lastJoin = null, closedByUs = false, backoff = 600, firstOpen = true;
  const raw = (obj) => ws.send(JSON.stringify(obj));
  const api = {
    ws: null,
    ready: false,
    send(obj) { if (obj && obj.t === 'join') lastJoin = obj; if (ws && ws.readyState === 1) raw(obj); else if (obj.t !== 'join') queue.push(obj); },
    join(role, name) { api.send({ t: 'join', role, name }); },
    close() { closedByUs = true; if (ws) ws.close(); },
  };
  function open() {
    ws = new WebSocket(`${proto}://${location.host}`); api.ws = ws;
    ws.onopen = () => {
      api.ready = true; backoff = 600;
      if (lastJoin) raw(lastJoin);                 // rejoin after a reconnect (server hands back a fresh welcome/id)
      const q = queue; queue = []; for (const o of q) raw(o);
      if (firstOpen) { firstOpen = false; handlers.open && handlers.open(); }
    };
    ws.onclose = () => { api.ready = false; handlers.close && handlers.close(); if (!closedByUs) setTimeout(open, backoff = Math.min(8000, Math.round(backoff * 1.7))); };
    ws.onerror = () => { try { ws.close(); } catch {} };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 's') handlers.snapshot && handlers.snapshot(m);
      else if (m.t === 'me') handlers.me && handlers.me(m);
      else if (m.t === 'welcome') handlers.welcome && handlers.welcome(m);
      else if (m.t === 'roster') handlers.roster && handlers.roster(m);
      else if (m.t === 'ev') handlers.event && handlers.event(m);
    };
  }
  open();
  return api;
}
