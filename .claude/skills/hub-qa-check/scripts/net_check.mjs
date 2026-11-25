// 허브/로봇 페이지 로드 중 4xx/5xx·실패 요청·콘솔 오류 수집 (QA 2회차)
import { spawn } from 'node:child_process';
const E = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9341;
const prof = process.argv[2];
const br = spawn(E, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1400,900', 'about:blank']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); let ev = [];
const reqs = new Map();
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  const p = d.params || {};
  if (d.method === 'Network.requestWillBeSent') reqs.set(p.requestId, { url: p.request.url, method: p.request.method, origin: p.request.headers.Origin, referer: p.request.headers.Referer });
  if (d.method === 'Network.responseReceived') { const r = reqs.get(p.requestId) || {}; r.status = p.response.status; r.mime = p.response.mimeType; ev.push(r); }
  if (d.method === 'Network.loadingFailed') { const r = reqs.get(p.requestId) || {}; ev.push({ ...r, failed: p.errorText }); }
  if (d.method === 'Runtime.exceptionThrown') ev.push({ exc: p.exceptionDetails.exception?.description || p.exceptionDetails.text });
  if (d.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) ev.push({ console: p.type + ' ' + p.args.map((a) => a.value ?? a.description).join(' ') });
  if (d.method === 'Log.entryAdded' && p.entry.level !== 'verbose') ev.push({ log: p.entry.level + ' ' + p.entry.text + ' ' + (p.entry.url || '') });
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalv = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Target.setAutoAttach', { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
await send('Network.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

const urls = process.argv.slice(3);
for (const u of urls) {
  ev = []; reqs.clear();
  await send('Page.navigate', { url: u });
  await sleep(5000);
  const info = await evalv(`(function(){var f=document.querySelector('iframe');var o={title:document.title};if(f){try{var d=f.contentDocument;o.frameTitle=d.title;o.frameHref=f.contentWindow.location.href;o.frameBody=d.body?d.body.innerText.length:0;o.twin=typeof f.contentWindow.loadSMARSTwin;o.three=!!(f.contentWindow.THREE||f.contentWindow.SMARS_THREE_LOCAL||f.contentWindow.__THREE__);o.canvas=d.querySelectorAll('canvas').length;o.otto=typeof f.contentWindow.otto;o.msg=(d.getElementById('msg')||{}).textContent;}catch(e){o.err=String(e)}}return JSON.stringify(o)})()`);
  const all = ev.filter((e) => e.url !== undefined);
  const bad = ev.filter((e) => e.failed || e.exc || e.console || e.log || (e.status && e.status >= 400));
  console.log('=== ' + u + '\n  requests: ' + all.length + ' ' + info);
  for (const b of bad) console.log('  ! ' + JSON.stringify(b));
  const api = all.filter((e) => e.url && e.url.includes('/api/'));
  if (api.length) console.log('  api: ' + JSON.stringify(api.slice(0, 4)));
}
ws.close(); br.kill(); process.exit(0);
