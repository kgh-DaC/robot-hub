// 2회차 추가 시나리오: 정지 미도달 경고, 포커스 복귀, SMARS M 유지 끄기, 도달 확인(가짜 게이트웨이)
import { spawn } from 'node:child_process';
const E = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9334;
const prof = process.argv[2];
const B = process.argv[3] || 'http://localhost:8800/';
const B2 = process.argv[4];   // 가짜 게이트웨이를 붙인 허브(선택)
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
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'info') logs.push(d.params.args.map((a) => a.value).join(' '));
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + JSON.stringify(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable');
const ST = `JSON.stringify({intro:!document.getElementById('intro').hidden, frame:!!document.querySelector('iframe'), warn:!document.getElementById('stopWarn').hidden, warnText:document.getElementById('stopWarnText').textContent, count:document.getElementById('stopWarnCount').hidden?'':document.getElementById('stopWarnCount').textContent, toast:document.getElementById('toast').hidden?'':document.getElementById('toast').textContent, active:document.activeElement&&(document.activeElement.id||document.activeElement.tagName), msg:(function(){try{return document.querySelector('iframe').contentDocument.getElementById('msg').textContent}catch(e){return null}})()})`;

// 1) 로봇 개, 게이트웨이 꺼짐: 버튼 → 경고 → 돌아가기 → 다시 처음으로 → 그래도 나가기
logs.length = 0;
await send('Page.navigate', { url: B + '?robot=robotdog' });
await sleep(3000);
await ev(`document.getElementById('btnHome').click()`);
await sleep(5000);
console.log('== dog 버튼 복귀 후', await ev(ST));
await ev(`document.getElementById('btnBackToControl').click()`);
await sleep(300);
console.log('== 돌아가기 후', await ev(ST), 'ctrl:', await ev(`!document.getElementById('control').hidden`));
await ev(`document.getElementById('btnHome').click()`);
await sleep(5000);
await ev(`document.getElementById('btnLeaveAnyway').click()`);
await sleep(300);
console.log('== 그래도 나가기 후', await ev(ST), '\n ' + logs.join('\n '));

// 2) 로봇 개 자동 복귀: 경고 + 30초 카운트다운 후 나감
logs.length = 0;
await send('Page.navigate', { url: B + '?robot=robotdog&idleMs=1500&warnMs=1000' });
await sleep(8000);
console.log('== dog 자동 복귀 경고', await ev(ST));
await sleep(30000);
console.log('== 30초 뒤', await ev(ST), '\n ' + logs.join('\n '));

// 3) 경고 취소 후 포커스
await send('Page.navigate', { url: B + '?robot=bike&idleMs=1500&warnMs=8000' });
await sleep(2500);
const ov = await ev(`!document.getElementById('overlay').hidden`);
await ev(`document.getElementById('btnContinue').click()`);
await sleep(200);
console.log('== 경고 떴나', ov, '취소 후 activeElement', await ev(`document.activeElement.tagName`), 'iframe 문서 hasFocus', await ev(`document.querySelector('iframe').contentDocument.hasFocus()`));

// 4) SMARS sim + M 유지 → 복귀 중 슬라이더가 0으로(stopMHold) 바뀌는가
logs.length = 0;
await send('Page.navigate', { url: B + '?robot=smars' });
await sleep(1500);
await ev(`document.querySelector('iframe').src='smars_web/twin/smars_console.html?sim=1'`);
await sleep(3000);
await ev(`(function(){var d=document.querySelector('iframe').contentDocument; var s=d.getElementById('mL'); s.value=60; s.dispatchEvent(new Event('input',{bubbles:true})); var r=d.getElementById('mR'); r.value=60; r.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await sleep(500);
const before = await ev(`document.querySelector('iframe').contentDocument.getElementById('mL').value`);
await ev(`window.__mv=[]; window.__iv=setInterval(function(){try{window.__mv.push(document.querySelector('iframe').contentDocument.getElementById('mL').value)}catch(e){}},50); document.getElementById('btnHome').click()`);
await sleep(2500);
console.log('== smars M 유지 전 mL', before, '복귀 중 mL 값', await ev(`clearInterval(window.__iv); window.__mv.join(',')`), '\n ' + logs.join('\n '));

// 5) 가짜 게이트웨이(ok 응답) 허브: 도달 확인 → 바로 나감
if (B2) {
  logs.length = 0;
  await send('Page.navigate', { url: B2 + '?robot=robotdog' });
  await sleep(3000);
  await ev(`document.getElementById('btnHome').click()`);
  await sleep(3000);
  console.log('== 가짜 게이트웨이 복귀', await ev(ST), '\n ' + logs.join('\n '));
}
ws.close(); br.kill();
process.exit(0);
