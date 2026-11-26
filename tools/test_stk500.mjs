// hub/flash/stk500.js 단위 시험(실제 포트 없음). 사용: node tools/test_stk500.mjs
// 가짜 SerialPort + STK500v1 부트로더 흉내(Optiboot 응답)로 HEX 파싱, 페이지 분할, 명령 순서, baud 재시도, 오류 분류를 본다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const STK = require(path.join(ROOT, 'hub', 'flash', 'stk500.js'));

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); };

// ---------------------------------------------------------------- 가짜 보드
class FakeBoard {
  constructor({ baud = 115200, signature = [0x1e, 0x95, 0x0f], flashSize = 32768, corruptAt = -1, failOpenBauds = [], silent = false } = {}) {
    Object.assign(this, { baud, signature, corruptAt, failOpenBauds, silent });
    this.mem = new Uint8Array(flashSize).fill(0xff);
    this.inBoot = false; this.addr = 0; this.rx = []; this.log = [];
    this.openBaud = 0; this.dtr = true; this.isOpen = false;
  }
  port() {
    const b = this;
    let ctrl = null;
    return {
      async open({ baudRate }) {
        if (b.isOpen) throw new Error('InvalidStateError: already open');
        if (b.failOpenBauds.includes(baudRate)) { const e = new Error('Failed to open serial port.'); e.name = 'NetworkError'; throw e; }
        b.isOpen = true; b.openBaud = baudRate; b.log.push('open:' + baudRate);
        this.readable = new ReadableStream({ start(c) { ctrl = c; }, cancel() { ctrl = null; } });
        this.writable = new WritableStream({ write(chunk) { b.feed(chunk, (bytes) => { if (ctrl) ctrl.enqueue(new Uint8Array(bytes)); }); } });
      },
      async close() { b.isOpen = false; b.log.push('close'); },
      async setSignals(s) {
        if (s.dataTerminalReady === false) b.dtr = false;
        if (s.dataTerminalReady === true && b.dtr === false) { b.dtr = true; b.inBoot = true; b.log.push('reset'); }
      }
    };
  }
  feed(chunk, send) {
    if (!this.inBoot || this.silent) return;
    if (this.openBaud !== this.baud) { send([0x00, 0xf8]); return; }   // 속도가 다르면 깨진 바이트
    for (const x of chunk) this.rx.push(x);
    for (;;) {
      const r = this.rx;
      if (!r.length) return;
      const need = { 0x30: 2, 0x50: 2, 0x51: 2, 0x75: 2, 0x55: 4 }[r[0]];
      let len = need;
      if (r[0] === 0x64 || r[0] === 0x74) { if (r.length < 4) return; const n = (r[1] << 8) | r[2]; len = r[0] === 0x64 ? 5 + n : 5; }
      if (!len) { r.shift(); continue; }
      if (r.length < len) return;
      const cmd = r.splice(0, len);
      if (cmd[len - 1] !== 0x20) { send([0x15]); continue; }
      const op = cmd[0];
      this.log.push('cmd:' + op.toString(16));
      if (op === 0x30 || op === 0x50) send([0x14, 0x10]);
      else if (op === 0x51) { send([0x14, 0x10]); this.inBoot = false; }
      else if (op === 0x75) send([0x14, ...this.signature, 0x10]);
      else if (op === 0x55) { this.addr = ((cmd[2] << 8) | cmd[1]) * 2; send([0x14, 0x10]); }
      else if (op === 0x64) {
        const n = (cmd[1] << 8) | cmd[2];
        this.mem.set(cmd.slice(4, 4 + n), this.addr);
        if (this.corruptAt >= this.addr && this.corruptAt < this.addr + n) this.mem[this.corruptAt] ^= 0xff;
        send([0x14, 0x10]);
      } else if (op === 0x74) {
        const n = (cmd[1] << 8) | cmd[2];
        send([0x14, ...this.mem.slice(this.addr, this.addr + n), 0x10]);
      }
    }
  }
}

// ---------------------------------------------------------------- HEX 만들기
function makeHex(data, start = 0) {
  const lines = [];
  for (let a = 0; a < data.length; a += 16) {
    const chunk = data.slice(a, a + 16);
    const addr = start + a;
    const rec = [chunk.length, (addr >> 8) & 0xff, addr & 0xff, 0, ...chunk];
    const sum = (0x100 - (rec.reduce((s, x) => s + x, 0) & 0xff)) & 0xff;
    lines.push(':' + [...rec, sum].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase());
  }
  lines.push(':00000001FF');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- 시험
async function main() {
  // 1. HEX 파싱: 실제 빌드 산출물
  const realHexPath = path.join(ROOT, 'hub', 'firmware', 'smars', 'firmware.hex');
  let realHex = null;
  if (fs.existsSync(realHexPath)) {
    realHex = fs.readFileSync(realHexPath, 'utf8');
    const img = STK.parseIntelHex(realHex);
    const manPath = path.join(ROOT, 'hub', 'firmware', 'manifest.json');
    if (fs.existsSync(manPath)) {
      const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
      ok('실제 HEX 파싱(smars) 크기 = manifest', img.size === man.robots.smars.files[0].size, `${img.size}`);
      ok('실제 HEX 크기 = 컴파일러 보고 Flash 크기', img.size === man.robots.smars.size.flash, `${img.size} vs ${man.robots.smars.size.flash}`);
    } else ok('실제 HEX 파싱(smars)', img.size > 0, `${img.size}B (manifest 없음)`);
  } else ok('실제 HEX 존재', false, realHexPath);

  // 2. 체크섬 오류 검출
  try { STK.parseIntelHex(':0100000001FF\n:00000001FF\n'); ok('HEX 체크섬 오류 검출', false); }
  catch (e) { ok('HEX 체크섬 오류 검출', e.code === 'bad_hex', e.message); }
  try { STK.parseIntelHex(':0100000000FF\n'); ok('HEX EOF 없음 검출', false); }
  catch (e) { ok('HEX EOF 없음 검출', e.code === 'bad_hex', e.message); }
  // 확장 주소 레코드(type 02)
  {
    const hx = ':020000021000EC\n:0100000042BD\n:00000001FF\n';
    const img = STK.parseIntelHex(hx);
    ok('HEX 확장 세그먼트 주소', img.size === 0x10001 && img.data[0x10000] === 0x42, `${img.size}`);
  }

  // 3. 페이지 분할: 300바이트 → 128 페이지 3개, 마지막은 0xFF 채움
  {
    const d = new Uint8Array(300).map((_, i) => i & 0xff);
    const pg = STK.paginate(d, 128);
    ok('페이지 분할 개수', pg.length === 3, `${pg.length}`);
    ok('페이지 주소', pg.map((p) => p.addr).join(',') === '0,128,256');
    ok('마지막 페이지 0xFF 채움', pg[2].bytes[43] === 43 && pg[2].bytes[44] === 0xff && pg[2].bytes[127] === 0xff);
  }

  // 4. 정상 업로드 + 명령 순서 + 메모리 일치
  const data = new Uint8Array(1000).map((_, i) => (i * 7 + 3) & 0xff);
  const hex = realHex || makeHex(data);
  const image = STK.parseIntelHex(hex);
  {
    const b = new FakeBoard({ baud: 115200 });
    const stages = [];
    const res = await STK.flash(b.port(), hex, { bauds: [115200, 57600], signature: '1e950f', onProgress: (e) => stages.push(e.stage) });
    ok('정상 업로드 성공 @115200', res.baud === 115200, JSON.stringify(res));
    ok('보드 메모리 = 이미지', image.data.every((x, i) => b.mem[i] === x));
    const cmds = b.log.filter((x) => x.startsWith('cmd:')).map((x) => x.slice(4));
    const firstNonSync = cmds.findIndex((c) => c !== '30');
    const pages = Math.ceil(image.size / 128);
    const expect = ['75', '50', ...Array(pages).fill(['55', '64']).flat(), ...Array(pages).fill(['55', '74']).flat(), '51'];
    ok('명령 순서(SYNC→SIGN→ENTER→(ADDR,PROG)*→(ADDR,READ)*→LEAVE)', JSON.stringify(cmds.slice(firstNonSync)) === JSON.stringify(expect), `${cmds.length}개`);
    ok('리셋이 동기화보다 먼저', b.log.indexOf('reset') >= 0 && b.log.indexOf('reset') < b.log.indexOf('cmd:30'));
    ok('끝나면 포트 닫음', b.log[b.log.length - 1] === 'close' && !b.isOpen);
    const order = [...new Set(stages)].join(',');
    ok('진행 단계 순서', order === 'open,reset,sync,signature,write,verify,leave,done', order);
  }

  // 5. baud 재시도: 보드가 57600(구형 부트로더)
  {
    const b = new FakeBoard({ baud: 57600 });
    const res = await STK.flash(b.port(), hex, { bauds: [115200, 57600], signature: '1e950f', syncAttempts: 3 });
    ok('115200 실패 → 57600 재시도 성공', res.baud === 57600 && b.log.filter((x) => x.startsWith('open:')).join() === 'open:115200,open:57600');
    ok('재시도 후 메모리 일치', image.data.every((x, i) => b.mem[i] === x));
  }

  // 6. 115200 에서 포트가 안 열리는 USB 칩(CH340 일부) → 57600 으로
  {
    const b = new FakeBoard({ baud: 57600, failOpenBauds: [115200] });
    const res = await STK.flash(b.port(), hex, { bauds: [115200, 57600], syncAttempts: 3 });
    ok('115200 열기 실패 → 57600 성공', res.baud === 57600);
  }

  // 7. 오류 분류
  async function expectErr(name, board, opts, code) {
    try { await STK.flash(board.port(), opts.hex || hex, { bauds: [115200, 57600], syncAttempts: 2, ...opts }); ok(name, false, '성공해 버림'); }
    catch (e) { ok(name, e.code === code, `${e.code}: ${e.message}`); ok(name + ' 후 포트 닫힘', !board.isOpen); }
  }
  await expectErr('응답 없는 보드 → no_sync', new FakeBoard({ silent: true }), {}, 'no_sync');
  await expectErr('모든 속도에서 열기 실패 → port_busy', new FakeBoard({ failOpenBauds: [115200, 57600] }), {}, 'port_busy');
  await expectErr('칩 서명 다름 → signature_mismatch', new FakeBoard({ signature: [0x1e, 0x98, 0x01] }), { signature: '1e950f' }, 'signature_mismatch');
  await expectErr('기록 오류 → verify_failed', new FakeBoard({ corruptAt: 200 }), {}, 'verify_failed');
  await expectErr('크기 초과 → too_large', new FakeBoard(), { maxSize: 100 }, 'too_large');

  const fail = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.name}${r.detail ? ' | ' + r.detail : ''}`);
  console.log(`\n합계: ${results.length - fail.length}/${results.length} 통과, 실패 ${fail.length}`);
  process.exit(fail.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
