// 헤드리스 Edge CDP 로 허브 안전 복귀 흐름 시험
import { spawn } from 'node:child_process';
const E = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9333;
const prof = process.argv[2];
const br = spawn(E, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1400,900', 'about:blank']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const logs = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a.preview?.properties?.map(p=>p.name+'='+p.value))).join(' '));
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + JSON.stringify(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === 'Log.entryAdded') logs.push('LOG ' + d.params.entry.level + ': ' + d.params.entry.text + ' ' + (d.params.entry.url||''));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable'); await send('Log.enable');
const B = 'http://localhost:8800/';

async function scenario(name, url, before) {
  logs.length = 0;
  await send('Page.navigate', { url });
  await sleep(2500);
  if (before) await ev(before);
  await sleep(before ? 2500 : 0);
  const pre = await ev(`JSON.stringify({ctrl:!document.getElementById('control').hidden, frame:!!document.querySelector('iframe')})`);
  await ev(`document.getElementById('btnHome').click()`);
  await sleep(2500);
  const post = await ev(`JSON.stringify({intro:!document.getElementById('intro').hidden, frame:!!document.querySelector('iframe'), toast:document.getElementById('toast').hidden?'':document.getElementById('toast').textContent})`);
  console.log(`== ${name}\n pre ${pre}\n post ${post}\n ` + logs.filter(l=>!/three|jsdelivr/.test(l)).join('\n '));
}
// 미연결 상태의 각 로봇
for (const r of ['smars', 'ottobot', 'robotdog', 'bike']) await scenario(r + ' (미연결)', B + '?robot=' + r);
// SMARS 시뮬레이션 연결 상태: pointerdown 정지가 예외 없이 되는지
await scenario('smars sim 연결', B + '?robot=smars',
  `document.querySelector('iframe').src='smars_web/twin/smars_console.html?sim=1'`);
await scenario('ottobot 데모 연결', B + '?robot=ottobot',
  `(function(){var d=document.querySelector('iframe').contentDocument; var sel=d.getElementById('transport'); sel.value='demo'; sel.dispatchEvent(new Event('change')); d.getElementById('btnConnect').click();})()`);
await scenario('bike 미연결(estop 이미 active)', B + '?robot=bike', `document.querySelector('iframe').contentDocument.getElementById('estop').click()`);
const fu = 'file:///' + encodeURI(process.argv[3]) + '/index.html?robot=bike';
await scenario('file:// 확인 모드', fu);
logs.length=0; await send('Page.navigate', { url: fu }); await sleep(2500);
console.log('== file mode note:', await ev(`document.getElementById('modeNote').hidden ? '(숨김)' : document.getElementById('modeNote').textContent`), '| notices:', await ev(`document.getElementById('notices').textContent`));
// 무입력 자동 복귀
logs.length = 0;
await send('Page.navigate', { url: B + '?robot=bike&idleMs=1500&warnMs=1000' });
await sleep(1200);
const w1 = await ev(`document.getElementById('overlay').hidden`);
await sleep(1000);
const w2 = await ev(`document.getElementById('overlay').hidden`);
await sleep(2500);
const w3 = await ev(`JSON.stringify({intro:!document.getElementById('intro').hidden, frame:!!document.querySelector('iframe')})`);
console.log('== idle: overlay hidden@1.2s', w1, '@2.2s', w2, 'after', w3, '\n ' + logs.join('\n '));
// pointermove 은 리셋 안 함 / keydown 은 리셋
await send('Page.navigate', { url: B + '?robot=bike&idleMs=3000&warnMs=5000' });
await sleep(2000);
await ev(`(function(){var w=document.querySelector('iframe').contentWindow; for(var i=0;i<5;i++) w.dispatchEvent(new w.PointerEvent('pointermove',{bubbles:true}));})()`);
await sleep(1500);
const pm = await ev(`document.getElementById('overlay').hidden`);
await ev(`(function(){var d=document.querySelector('iframe').contentDocument; d.body.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'a',bubbles:true}));})()`);
await sleep(300);
const kd = await ev(`document.getElementById('overlay').hidden`);
console.log('== pointermove만: overlay hidden', pm, '(false 기대) / keydown 후', kd, '(true 기대)');
// Esc on hub document
await ev(`document.body.focus(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
await sleep(1500);
console.log('== Esc:', await ev(`!document.getElementById('intro').hidden`));
// intro 애니메이션 자막 변화
await send('Page.navigate', { url: B });
await sleep(500);
const c1 = await ev(`[...document.querySelectorAll('.caption')].map(e=>e.textContent).join('|')`);
await sleep(3500);
const c2 = await ev(`[...document.querySelectorAll('.caption')].map(e=>e.textContent).join('|')`);
console.log('== captions', c1, '->', c2);
ws.close(); br.kill();
process.exit(0);
