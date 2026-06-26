// Thin WebSocket wrapper shared by all clients.
export function connect(handlers = {}) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  let queue = [];                         // messages sent before the socket is OPEN
  const raw = (obj) => ws.send(JSON.stringify(obj));
  const api = {
    ws,
    ready: false,
    send(obj) { if (ws.readyState === 1) raw(obj); else queue.push(obj); },
    join(role, name) { api.send({ t: 'join', role, name }); },
  };
  ws.onopen = () => { api.ready = true; const q = queue; queue = []; for (const o of q) raw(o); handlers.open && handlers.open(); };
  ws.onclose = () => { api.ready = false; handlers.close && handlers.close(); };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 's') handlers.snapshot && handlers.snapshot(m);
    else if (m.t === 'welcome') handlers.welcome && handlers.welcome(m);
    else if (m.t === 'roster') handlers.roster && handlers.roster(m);
    else if (m.t === 'ev') handlers.event && handlers.event(m);
  };
  return api;
}
