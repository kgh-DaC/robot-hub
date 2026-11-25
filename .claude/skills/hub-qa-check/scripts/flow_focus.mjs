// QA 2회차: 경고 취소 방법별 포커스 위치와 Space 전달
import { spawn } from 'node:child_process';
const E = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9343;
const br = spawn(E, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${process.argv[2]}`, '--window-size=1400,900', 'about:blank']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
const key = async (k, code, vk) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
const center = (sel) => ev(`(function(){var r=document.querySelector('${sel}').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);

async function trial(name, cancel, robot = 'smars', url) {
  await send('Page.navigate', { url: url || `http://localhost:8800/?robot=${robot}&idleMs=1500&warnMs=8000` });
  await sleep(1200);
  await ev(`window.__k=[]; document.querySelector('iframe').contentDocument.addEventListener('keydown', function(e){window.__k.push(e.code)}, true); 1`);
  await sleep(1300);
  const ov = await ev(`!document.getElementById('overlay').hidden`);
  await cancel();
  await sleep(250);
  const act = await ev(`document.activeElement.id || document.activeElement.tagName`);
  await key(' ', 'Space', 32);
  await sleep(150);
  console.log(`== ${name}: 경고 ${ov} → 취소 후 active=${act}, 오버레이 숨김=${await ev(`document.getElementById('overlay').hidden`)}, Space가 iframe에 도달=${await ev(`JSON.stringify(window.__k)`)}`);
}
await trial('마우스 클릭 "계속 사용"', async () => { const b = await center('#btnContinue');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b[0], y: b[1], button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b[0], y: b[1], button: 'left', clickCount: 1 }); });
await trial('터치 탭 "계속 사용"', async () => { const b = await center('#btnContinue');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b[0], y: b[1] }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); });
await trial('Enter 키(포커스된 계속 사용)', async () => { await key('Enter', 'Enter', 13); });
await trial('오버레이 배경 클릭', async () => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 30, y: 870, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 30, y: 870, button: 'left', clickCount: 1 }); });
await trial('el.click() (1회차 엔지니어 검증 방식)', async () => { await ev(`document.getElementById('btnContinue').click()`); });

// stopwarn "돌아가기" 마우스 클릭 (8802 실패 게이트웨이)
await send('Page.navigate', { url: 'http://localhost:8802/?robot=robotdog' });
await sleep(2000);
await ev(`window.__k=[]; document.querySelector('iframe').contentDocument.addEventListener('keydown', function(e){window.__k.push(e.code)}, true); document.getElementById('btnHome').click()`);
await sleep(4500);
const b = await center('#btnBackToControl');
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b[0], y: b[1], button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b[0], y: b[1], button: 'left', clickCount: 1 });
await sleep(250);
const act = await ev(`document.activeElement.id || document.activeElement.tagName`);
await key(' ', 'Space', 32);
await sleep(150);
console.log(`== stopwarn 돌아가기 마우스 클릭: active=${act}, Space 도달=${await ev(`JSON.stringify(window.__k)`)}`);
ws.close(); br.kill(); process.exit(0);
