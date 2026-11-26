// 펌웨어 업로드 대화상자·흐름 시험(헤드리스 Edge, 실제 포트 없음).
// 사용: (허브 서버 실행 중: python hub/serve.py) node .claude/skills/hub-qa-check/scripts/flow_firmware.mjs <임시 프로필 폴더> <통합 절대 경로>
// navigator.serial 을 가짜로 바꿔(STK500 부트로더 흉내) 확인 → 정지·iframe 닫기 → 포트 선택 → 쓰기·검증 → 완료 → iframe 다시 열기를 본다.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const E = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9334;
const prof = process.argv[2];
const root = path.resolve(process.argv[3] || '.');
const FILE = pathToFileURL(path.join(root, 'index.html')).href;
const B = 'http://localhost:8800/';
const shotDir = fs.existsSync(path.join(root, '_workspace')) ? path.join(root, '_workspace') : null;   // 대화상자 캡처
const br = spawn(E, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1400,900', '--allow-file-access-from-files', 'about:blank']);
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
  if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error')) logs.push('console.error: ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  // 로봇 개 페이지가 게이트웨이 없이 보낸 정지(api/command 502)는 게이트웨이를 안 띄운 시험 환경 탓이라 뺀다
  // 시험이 제어 화면에서 바로 다른 주소로 이동할 때 허브 beforeunload 확인이 막혔다는 브라우저 기록은 시험 자체가 만든 것이라 뺀다
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/beforeunload/.test(d.params.entry.text) && !/502[\s\S]*\/api\//.test(d.params.entry.text + ' ' + d.params.entry.url)) logs.push('LOG: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');

// ---------------------------------------------------------------- 가짜 Web Serial(브라우저 안에서 실행)
function installFake(opts) {
  if (window.top !== window) return;   // iframe(로봇 제어 웹)은 건드리지 않는다
  if (opts.noSerial) { try { Object.defineProperty(Navigator.prototype, 'serial', { get: undefined, configurable: true }); delete Navigator.prototype.serial; } catch (e) { /* 무시 */ } return; }
  const b = { baud: opts.baud || 115200, failOpen: !!opts.failOpen, mem: new Uint8Array(32768).fill(0xff), inBoot: false, addr: 0, rx: [], log: [], dtr: true, isOpen: false, openBaud: 0 };
  window.__fake = b;
  function feed(chunk, sendBack) {
    if (!b.inBoot) return;
    if (b.openBaud !== b.baud) { sendBack([0x00, 0xf8]); return; }
    for (const x of chunk) b.rx.push(x);
    for (;;) {
      const r = b.rx; if (!r.length) return;
      let len = { 0x30: 2, 0x50: 2, 0x51: 2, 0x75: 2, 0x55: 4 }[r[0]];
      if (r[0] === 0x64 || r[0] === 0x74) { if (r.length < 4) return; const n = (r[1] << 8) | r[2]; len = r[0] === 0x64 ? 5 + n : 5; }
      if (!len) { r.shift(); continue; }
      if (r.length < len) return;
      const c = r.splice(0, len); const op = c[0]; b.log.push(op);
      if (op === 0x30 || op === 0x50) sendBack([0x14, 0x10]);
      else if (op === 0x51) { sendBack([0x14, 0x10]); b.inBoot = false; }
      else if (op === 0x75) sendBack([0x14, 0x1e, 0x95, 0x0f, 0x10]);
      else if (op === 0x55) { b.addr = ((c[2] << 8) | c[1]) * 2; sendBack([0x14, 0x10]); }
      else if (op === 0x64) { const n = (c[1] << 8) | c[2]; b.mem.set(c.slice(4, 4 + n), b.addr); sendBack([0x14, 0x10]); }
      else if (op === 0x74) { const n = (c[1] << 8) | c[2]; sendBack([0x14, ...b.mem.slice(b.addr, b.addr + n), 0x10]); }
    }
  }
  let ctrl = null;
  const fakePort = {
    getInfo() { return { usbVendorId: 0x1a86, usbProductId: 0x7523 }; },
    async open({ baudRate }) {
      if (b.failOpen) { const e = new DOMException('Failed to open serial port.', 'NetworkError'); throw e; }
      if (b.isOpen) throw new DOMException('The port is already open.', 'InvalidStateError');
      b.isOpen = true; b.openBaud = baudRate; b.log.push('open:' + baudRate);
      this.readable = new ReadableStream({ start(c) { ctrl = c; }, cancel() { ctrl = null; } });
      this.writable = new WritableStream({ write(chunk) { setTimeout(() => feed(chunk, (x) => { if (ctrl) ctrl.enqueue(new Uint8Array(x)); }), opts.delay || 1); } });
    },
    async close() { b.isOpen = false; },
    async setSignals(s) { if (s.dataTerminalReady === false) b.dtr = false; if (s.dataTerminalReady === true && !b.dtr) { b.dtr = true; b.inBoot = true; } },
    addEventListener() {}, removeEventListener() {}
  };
  const serial = { requestPort: async () => fakePort, getPorts: async () => [], addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(Navigator.prototype, 'serial', { get() { return serial; }, configurable: true });
}

let scriptId = null;
async function withFake(opts) {
  if (scriptId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId });
  const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFake.toString()})(${JSON.stringify(opts)})` });
  scriptId = r.result.identifier;
}
async function waitFor(expr, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await ev(expr)) return true; await sleep(200); }
  return false;
}
const S = `(function(){var g=function(i){return document.getElementById(i)};return {state: !g('fw').hidden ? 'fw' : (!g('control').hidden ? 'control' : 'intro'), frame: !!document.querySelector('iframe'), go: g('fwGo').hidden ? null : g('fwGo').textContent, goDis: g('fwGo').disabled, cancel: g('fwCancel').textContent, stage: g('fwStage').textContent, result: g('fwResult').hidden ? '' : g('fwResult').textContent, idle: g('idleLeft').textContent, btnFw: g('btnFw').hidden ? 'hidden' : (g('btnFw').getAttribute('aria-disabled') ? 'disabled' : 'on')};})()`;
const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`); };

async function avrFlow(label, url, fake, expectBaud) {
  logs.length = 0;
  await withFake(fake);
  await send('Page.navigate', { url });
  await sleep(2500);
  let s = await ev(S);
  check(`${label}: 버튼 표시`, s.btnFw === 'on', s.btnFw);
  await ev(`document.getElementById('btnFw').click()`);
  await sleep(300);
  s = await ev(S);
  const info = await ev(`document.getElementById('fwInfo').textContent + ' / ' + document.getElementById('fwWarn').textContent + ' / ' + document.getElementById('fwNotes').textContent`);
  check(`${label}: 대화상자(이름·보드·커밋·빌드 날짜·경고·USB 안내)`, s.state === 'fw' && /보드/.test(info) && /소스 커밋[0-9a-f]{7}/.test(info) && /빌드 날짜\d{4}-/.test(info) && /덮어씁니다/.test(info) && /블루투스로는/.test(info), info.slice(0, 160));
  if (shotDir) { const shot = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shotDir, `qa_fw_${label.split('(')[0]}.png`), Buffer.from(shot.result.data, 'base64')); }
  check(`${label}: 확인 단계에서도 무입력 타이머가 돈다(#11)`, /입력 없으면/.test(s.idle), s.idle);
  await ev(`document.getElementById('fwGo').click()`);
  const ready = await waitFor(`document.getElementById('fwGo').textContent==='포트 고르고 업로드' && !document.getElementById('fwGo').disabled`);
  s = await ev(S);
  check(`${label}: 정지 → iframe 닫음 → 포트 단계`, ready && !s.frame, JSON.stringify({ go: s.go, frame: s.frame }));
  await ev(`document.getElementById('fwGo').click()`);
  const done = await waitFor(`/업로드 완료/.test(document.getElementById('fwResult').textContent)`, 30000);
  s = await ev(S);
  check(`${label}: 업로드 완료`, done, (s.result || s.stage).slice(0, 120));
  const memOk = await ev(`(function(){var d=window.HUB_FIRMWARE_DATA; var id=Object.keys(d)[0]; var img=HubSTK500.parseIntelHex(d[id].files[0].text); for(var i=0;i<img.size;i++) if(__fake.mem[i]!==img.data[i]) return 'diff@'+i; return 'ok '+img.size+' '+__fake.log.filter(function(x){return typeof x==='string'}).join(',');})()`);
  check(`${label}: 가짜 보드 메모리 = HEX`, /^ok/.test(memOk) && (!expectBaud || memOk.includes('open:' + expectBaud)), memOk);
  await ev(`document.getElementById('fwCancel').click()`);
  await sleep(800);
  s = await ev(S);
  check(`${label}: 닫으면 제어 화면·iframe 다시 열림, 타이머 재개`, s.state === 'control' && s.frame && /후 처음 화면/.test(s.idle), JSON.stringify({ state: s.state, frame: s.frame, idle: s.idle }));
  check(`${label}: 콘솔 오류 없음`, logs.length === 0, logs.join(' | ').slice(0, 300));
}

await avrFlow('smars(http)', B + '?robot=smars&idleMs=60000&warnMs=1000', { baud: 115200 }, 115200);
await avrFlow('ottobot(http, 57600 재시도)', B + '?robot=ottobot&idleMs=60000&warnMs=1000', { baud: 57600 }, 57600);
await avrFlow('bike(file://)', FILE + '?robot=bike&idleMs=60000&warnMs=1000', { baud: 115200 }, 115200);

// 무입력 복귀와 펌웨어 대화상자(QA 결함 #11): 쓰기 중에만 멈추고, 확인·포트·완료 단계에서는 평소처럼 복귀
async function idleCase(label, setup, waitMs, expectIntro) {
  logs.length = 0;
  await send('Page.navigate', { url: B + '?robot=smars&idleMs=3000&warnMs=1000' });
  await sleep(2500);
  await ev(`document.getElementById('btnFw').click()`);
  await sleep(200);
  if (setup) await setup();
  await sleep(waitMs);
  const s = await ev(S);
  const ok = expectIntro ? (s.state === 'intro' && !s.frame) : s.state === 'fw';
  check(`무입력: ${label}`, ok, JSON.stringify({ state: s.state, frame: s.frame, idle: s.idle }));
  return s;
}
await withFake({ baud: 115200 });
{
  // 확인 단계: 경고가 대화상자 위에 뜨는가 → 그대로 두면 정지·iframe 제거·첫 화면
  logs.length = 0;
  await send('Page.navigate', { url: B + '?robot=smars&idleMs=3000&warnMs=1000' });
  await sleep(2500);
  await ev(`document.getElementById('btnFw').click()`);
  await sleep(3400);
  const w = await ev(`(function(){var o=document.getElementById('overlay');return !o.hidden && o.classList.contains('over-fw') && getComputedStyle(o).zIndex > getComputedStyle(document.getElementById('fw')).zIndex;})()`);
  check('무입력: 확인 단계에서 경고가 대화상자 위에 뜸', w === true, String(w));
  await waitFor(`!document.getElementById('intro').hidden`, 8000);   // 정지 절차(SMARS settle 1.2초) 포함
  const s = await ev(S);
  check('무입력: 확인 단계 방치 → 안전 복귀(첫 화면, iframe 제거, 대화상자 닫힘)', s.state === 'intro' && !s.frame && await ev(`document.getElementById('fw').hidden`), JSON.stringify(s).slice(0, 160));
}
await idleCase('확인 단계에서 [계속 사용] → 대화상자 유지', async () => { await sleep(3400); await ev(`document.getElementById('btnContinue').click()`); }, 500, false);
await idleCase('대화상자 조작(키 입력)도 입력으로 침', async () => {
  for (let i = 0; i < 4; i++) { await sleep(1000); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft' }); }
}, 1000, false);
await idleCase('포트 단계(iframe 제거 뒤) 방치 → 첫 화면', async () => {
  await ev(`document.getElementById('fwGo').click()`);
  await waitFor(`document.getElementById('fwGo').textContent==='포트 고르고 업로드'`);
}, 5000, true);
await withFake({ baud: 115200, delay: 25 });
{
  logs.length = 0;
  await send('Page.navigate', { url: B + '?robot=smars&idleMs=3000&warnMs=1000' });
  await sleep(2500);
  await ev(`document.getElementById('btnFw').click()`);
  await sleep(200);
  await ev(`document.getElementById('fwGo').click()`);
  await waitFor(`document.getElementById('fwGo').textContent==='포트 고르고 업로드'`);
  await ev(`document.getElementById('fwGo').click()`);
  await sleep(5000);
  let s = await ev(S);
  check('무입력: 쓰기 중(5초 > idle 3초+경고 1초)에는 멈춤', s.state === 'fw' && s.idle === '펌웨어 쓰는 중' && !/업로드 완료/.test(s.result), JSON.stringify({ state: s.state, idle: s.idle, stage: s.stage }));
  const done = await waitFor(`/업로드 완료/.test(document.getElementById('fwResult').textContent)`, 60000);
  await sleep(400);   // 상단 표시는 다음 tick(250ms)에 바뀐다
  s = await ev(S);
  check('무입력: 쓰기 끝나면 타이머 재시작', done && /입력 없으면/.test(s.idle), s.idle);
  await sleep(4400);
  s = await ev(S);
  check('무입력: 완료 단계 방치 → 첫 화면', s.state === 'intro' && !s.frame, JSON.stringify({ state: s.state, frame: s.frame }));
  check('무입력 시나리오 콘솔 오류 없음', logs.length === 0, logs.join(' | ').slice(0, 300));
}

// ESP32(로봇 개): 로컬 허브 iframe → 포트 사용 중(게이트웨이가 쥠) 흉내 → 원인 안내
{
  logs.length = 0;
  await withFake({ failOpen: true });
  await send('Page.navigate', { url: B + '?robot=robotdog' });
  await sleep(2500);
  await ev(`document.getElementById('btnFw').click()`);
  await sleep(300);
  await ev(`document.getElementById('fwGo').click()`);
  const ready = await waitFor(`document.getElementById('fwGo').textContent==='포트 고르고 업로드' && !document.getElementById('fwGo').disabled`, 20000);
  const bundle = await ev(`!!(window.HubEsptool && window.HubEsptool.ESPLoader) && window.HubEsptool.version`);
  check('robotdog: esptool 번들 로드(sha256 확인 통과)', ready && !!bundle, String(bundle));
  await ev(`document.getElementById('fwGo').click()`);
  const failed = await waitFor(`/사용 중/.test(document.getElementById('fwResult').textContent)`, 30000);
  const s = await ev(S);
  check('robotdog: 포트 사용 중 → 원인 안내(+게이트웨이 안내)', failed && /usb_gateway/.test(s.result), s.result.slice(0, 160));
  check('robotdog: 실패 후 다시 시도 버튼', s.go === '다시 시도' && !s.goDis, s.go);
  await ev(`document.getElementById('fwCancel').click()`);
  await sleep(800);
  const s2 = await ev(S);
  check('robotdog: 닫으면 iframe 다시 열림', s2.state === 'control' && s2.frame);
  check('robotdog: 콘솔 오류 없음', logs.length === 0, logs.join(' | ').slice(0, 300));
}

// file:// 첫 화면: 로봇 개는 새 탭 안내(fileOffsite) 대화상자에서도 업로드 가능
{
  logs.length = 0;
  await withFake({ failOpen: true });
  await send('Page.navigate', { url: FILE });
  await sleep(2500);
  const idx = await ev(`(function(){var c=[].slice.call(document.querySelectorAll('.card'));for(var i=0;i<c.length;i++){if(c[i].querySelector('.card-env.info')&&/새 탭/.test(c[i].textContent)){c[i].click();return i;}}return -1;})()`);
  await sleep(300);
  const vis = await ev(`!document.getElementById('offsite').hidden && !document.getElementById('btnOffsiteFw').hidden`);
  check('file:// 로봇 개 안내에 업로드 버튼', idx >= 0 && vis, `card ${idx}`);
  await ev(`document.getElementById('btnOffsiteFw').click()`);
  await sleep(300);
  let s = await ev(S);
  check('file:// 안내 → 업로드 대화상자', s.state === 'fw' && !s.frame);
  await ev(`document.getElementById('fwGo').click()`);
  const ready = await waitFor(`document.getElementById('fwGo').textContent==='포트 고르고 업로드'`, 20000);
  check('file:// 로봇 개: iframe 없이 포트 단계', ready);
  await ev(`document.getElementById('fwGo').click()`);
  await waitFor(`!document.getElementById('fwResult').hidden`, 30000);
  await ev(`document.getElementById('fwCancel').click()`);
  await sleep(500);
  s = await ev(S);
  check('file:// 로봇 개: 닫으면 첫 화면', s.state === 'intro');
  check('file:// 로봇 개: 콘솔 오류 없음', logs.length === 0, logs.join(' | ').slice(0, 300));
}

// Web Serial 없는 브라우저: 버튼 비활성 표시, 대화상자 업로드 비활성 + 안내
{
  logs.length = 0;
  await withFake({ noSerial: true });
  await send('Page.navigate', { url: B + '?robot=smars' });
  await sleep(2500);
  let s = await ev(S);
  check('Web Serial 없음: 버튼 비활성', s.btnFw === 'disabled', s.btnFw);
  await ev(`document.getElementById('btnFw').click()`);
  await sleep(300);
  s = await ev(S);
  const notes = await ev(`document.getElementById('fwNotes').textContent`);
  check('Web Serial 없음: 업로드 비활성 + 안내', s.state === 'fw' && s.goDis && /Web Serial이 없어/.test(notes));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(300);
  s = await ev(S);
  check('Esc 로 대화상자 닫기 → 제어 화면 유지', s.state === 'control' && s.frame);
}

await send('Page.navigate', { url: 'about:blank' });
br.kill();
const fail = results.filter((r) => !r.pass);
console.log(`\n합계: ${results.length - fail.length}/${results.length} 통과, 실패 ${fail.length}`);
process.exit(fail.length ? 1 : 0);
