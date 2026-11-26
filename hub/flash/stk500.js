/* AVR 업로더: STK500v1(Arduino 부트로더 Optiboot / 구형 ATmegaBOOT) over Web Serial.
 * 외부 의존성 없음. classic script 로 불러오면 window.HubSTK500, Node 에서는 module.exports.
 *
 * 순서: 포트 열기(baud) → DTR/RTS 토글로 리셋 → GET_SYNC 재시도 → 칩 서명 확인 → ENTER_PROGMODE
 *       → 페이지마다 LOAD_ADDRESS(word 주소) + PROG_PAGE(128B) → 페이지마다 READ_PAGE 로 검증 → LEAVE_PROGMODE(앱 실행)
 * bauds 를 앞에서부터 시도한다. 동기화까지 실패하면 다음 baud(부트로더 종류 차이: Optiboot 115200, 구형 57600).
 * 동기화 뒤의 오류는 다시 시도하지 않는다(어디까지 썼는지 알 수 없는 상태로 다른 baud 로 가지 않게).
 *
 * port 는 Web Serial SerialPort 와 같은 모양이면 된다(open/close/setSignals/readable/writable). Node 시험은 가짜 포트를 넣는다.
 * 오류는 StkError(code): port_busy | no_sync | signature_mismatch | too_large | verify_failed | protocol | io | bad_hex
 */
(function (root) {
  'use strict';

  var STK = { OK: 0x10, INSYNC: 0x14, EOP: 0x20, GET_SYNC: 0x30, ENTER: 0x50, LEAVE: 0x51,
    LOAD_ADDRESS: 0x55, PROG_PAGE: 0x64, READ_PAGE: 0x74, READ_SIGN: 0x75 };

  function StkError(code, message, detail) {
    var e = new Error(message || code);
    e.name = 'StkError';
    e.code = code;
    if (detail) e.detail = detail;
    return e;
  }

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ---------------------------------------------------------------- Intel HEX
  // 반환: { data: Uint8Array(0..끝, 빈 곳 0xFF), size: 끝 주소 }. 체크섬·형식 오류는 bad_hex.
  function parseIntelHex(text) {
    var lines = String(text).split(/\r?\n/);
    var base = 0, chunks = [], end = 0, sawEof = false;
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li].trim();
      if (!line) continue;
      if (line[0] !== ':' || line.length < 11 || (line.length - 1) % 2) throw StkError('bad_hex', 'HEX 형식 오류(' + (li + 1) + '번째 줄)');
      var bytes = [];
      for (var i = 1; i < line.length; i += 2) {
        var b = parseInt(line.substr(i, 2), 16);
        if (isNaN(b)) throw StkError('bad_hex', 'HEX 형식 오류(' + (li + 1) + '번째 줄)');
        bytes.push(b);
      }
      var n = bytes[0], addr = (bytes[1] << 8) | bytes[2], type = bytes[3];
      if (bytes.length !== n + 5) throw StkError('bad_hex', 'HEX 길이 오류(' + (li + 1) + '번째 줄)');
      var sum = 0;
      for (var k = 0; k < bytes.length; k++) sum = (sum + bytes[k]) & 0xff;
      if (sum !== 0) throw StkError('bad_hex', 'HEX 체크섬 오류(' + (li + 1) + '번째 줄)');
      var payload = bytes.slice(4, 4 + n);
      if (type === 0) {
        chunks.push({ addr: base + addr, bytes: payload });
        end = Math.max(end, base + addr + n);
      } else if (type === 1) { sawEof = true; break; }
      else if (type === 2) base = ((payload[0] << 8) | payload[1]) << 4;
      else if (type === 4) base = ((payload[0] << 8) | payload[1]) << 16;
      // 3, 5(시작 주소)는 AVR 업로드에 필요 없음
    }
    if (!sawEof) throw StkError('bad_hex', 'HEX 끝 표시(EOF)가 없습니다');
    var data = new Uint8Array(end);
    data.fill(0xff);
    chunks.forEach(function (c) { data.set(c.bytes, c.addr); });
    return { data: data, size: end };
  }

  // 0 부터 size 까지 pageSize 단위(마지막 페이지는 0xFF 로 채움)
  function paginate(data, pageSize) {
    var pages = [];
    for (var a = 0; a < data.length; a += pageSize) {
      var p = new Uint8Array(pageSize);
      p.fill(0xff);
      p.set(data.subarray(a, Math.min(a + pageSize, data.length)));
      pages.push({ addr: a, bytes: p });
    }
    return pages;
  }

  // ---------------------------------------------------------------- 시리얼 입출력
  function SerialIO(port) {
    this.port = port;
    this.buf = [];
    this.waiter = null;
    this.readErr = null;
    this.closed = false;
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
    this.loop = this._pump();
  }
  SerialIO.prototype._pump = function () {
    var self = this;
    function step() {
      return self.reader.read().then(function (r) {
        if (r.done) { self.closed = true; self._wake(); return; }
        var v = r.value;
        for (var i = 0; i < v.length; i++) self.buf.push(v[i]);
        self._wake();
        return step();
      }, function (e) {
        if (!self.closed) self.readErr = e;
        self.closed = true;
        self._wake();
      });
    }
    return step();
  };
  SerialIO.prototype._wake = function () { var w = this.waiter; this.waiter = null; if (w) w(); };
  SerialIO.prototype.clear = function () { this.buf.length = 0; };
  SerialIO.prototype.write = function (bytes) {
    var self = this;
    return this.writer.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).catch(function (e) {
      throw StkError('io', '시리얼 쓰기 실패: ' + (e && e.message || e));
    }).then(function () { return self; });
  };
  // n 바이트를 timeoutMs 안에. 모자라면 null
  SerialIO.prototype.read = function (n, timeoutMs) {
    var self = this;
    var deadline = Date.now() + timeoutMs;
    return new Promise(function (resolve, reject) {
      function check() {
        if (self.buf.length >= n) { resolve(self.buf.splice(0, n)); return; }
        if (self.readErr) { reject(StkError('io', '시리얼 읽기 실패: ' + (self.readErr.message || self.readErr))); return; }
        var left = deadline - Date.now();
        if (left <= 0 || self.closed) { resolve(null); return; }
        var t = setTimeout(function () { self.waiter = null; check(); }, left);
        self.waiter = function () { clearTimeout(t); check(); };
      }
      check();
    });
  };
  SerialIO.prototype.close = function () {
    var self = this;
    this.closed = true;
    var p = Promise.resolve();
    p = p.then(function () { return self.reader.cancel(); }).catch(function () {});
    p = p.then(function () { try { self.reader.releaseLock(); } catch (e) { /* 무시 */ } });
    p = p.then(function () { return self.loop; }).catch(function () {});
    p = p.then(function () { try { self.writer.releaseLock(); } catch (e) { /* 무시 */ } });
    return p;
  };

  // ---------------------------------------------------------------- 프로토콜
  // 명령을 보내고 INSYNC [data n바이트] OK 를 받는다. 반환: data 배열
  function command(io, bytes, dataLen, timeoutMs, what) {
    return io.write(bytes).then(function () {
      return io.read(1, timeoutMs);
    }).then(function (b) {
      if (!b) throw StkError('protocol', what + ': 응답 없음');
      if (b[0] !== STK.INSYNC) throw StkError('protocol', what + ': 동기화 어긋남(0x' + b[0].toString(16) + ')');
      return io.read(dataLen + 1, timeoutMs);
    }).then(function (rest) {
      if (!rest) throw StkError('protocol', what + ': 응답이 짧음');
      if (rest[dataLen] !== STK.OK) throw StkError('protocol', what + ': 실패 응답(0x' + rest[dataLen].toString(16) + ')');
      return rest.slice(0, dataLen);
    });
  }

  function resetBoard(port) {
    // avrdude 'arduino' 프로그래머와 같은 순서: DTR/RTS 끔 → 250ms → 켬(이 하강 에지가 자동 리셋 콘덴서로 RESET 을 당김) → 50ms
    return Promise.resolve(port.setSignals({ dataTerminalReady: false, requestToSend: false }))
      .then(function () { return sleep(250); })
      .then(function () { return port.setSignals({ dataTerminalReady: true, requestToSend: true }); })
      .then(function () { return sleep(50); });
  }

  // GET_SYNC 를 attempts 번까지. 성공하면 true
  function getSync(io, attempts, onTry) {
    var i = 0;
    function once() {
      if (i >= attempts) return Promise.resolve(false);
      i++;
      if (onTry) onTry(i, attempts);
      io.clear();
      return io.write([STK.GET_SYNC, STK.EOP]).then(function () { return sleep(60); }).then(function () {
        return io.read(2, 200);
      }).then(function (r) {
        if (r && r[0] === STK.INSYNC && r[1] === STK.OK) {
          // 한 번 더 확인(리셋 직후 잡음으로 우연히 맞는 경우 대비)
          io.clear();
          return io.write([STK.GET_SYNC, STK.EOP]).then(function () { return io.read(2, 300); }).then(function (r2) {
            return !!(r2 && r2[0] === STK.INSYNC && r2[1] === STK.OK) || once();
          });
        }
        return once();
      });
    }
    return once();
  }

  function hex2(b) { return ('0' + b.toString(16)).slice(-2); }

  // ---------------------------------------------------------------- 업로드
  // opts: { bauds:[115200,57600], signature:'1e950f', pageSize:128, maxSize, syncAttempts:10, onProgress(ev), log(msg) }
  // onProgress ev: { stage: 'open'|'reset'|'sync'|'signature'|'write'|'verify'|'leave'|'done', baud, percent, attempt }
  // 반환: { baud, bytes, pages, signature }
  function flash(port, hexText, opts) {
    opts = opts || {};
    var bauds = (opts.bauds && opts.bauds.length) ? opts.bauds : [115200, 57600];
    var pageSize = opts.pageSize || 128;
    var progress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    var log = typeof opts.log === 'function' ? opts.log : function () {};
    var attempts = opts.syncAttempts || 10;

    var image;
    try { image = parseIntelHex(hexText); } catch (e) { return Promise.reject(e); }
    if (!image.size) return Promise.reject(StkError('bad_hex', 'HEX 에 데이터가 없습니다'));
    if (opts.maxSize && image.size > opts.maxSize) {
      return Promise.reject(StkError('too_large', '펌웨어(' + image.size + 'B)가 보드 한도(' + opts.maxSize + 'B)보다 큽니다'));
    }
    var pages = paginate(image.data, pageSize);
    var openFails = 0, lastOpenErr = null;

    function tryBaud(bi) {
      if (bi >= bauds.length) {
        if (openFails === bauds.length) {
          return Promise.reject(StkError('port_busy', '포트를 열 수 없습니다: ' + (lastOpenErr && lastOpenErr.message || lastOpenErr)));
        }
        return Promise.reject(StkError('no_sync', '부트로더와 동기화하지 못했습니다(시도한 속도: ' + bauds.join(', ') + ')'));
      }
      var baud = bauds[bi];
      progress({ stage: 'open', baud: baud });
      return Promise.resolve().then(function () { return port.open({ baudRate: baud }); }).then(function () {
        var io = new SerialIO(port);
        var synced = false;
        var finish = function () { return io.close().then(function () { return port.close(); }).catch(function () {}); };
        progress({ stage: 'reset', baud: baud });
        return resetBoard(port).then(function () {
          progress({ stage: 'sync', baud: baud, attempt: 0 });
          return getSync(io, attempts, function (i, n) { progress({ stage: 'sync', baud: baud, attempt: i, attempts: n }); });
        }).then(function (ok) {
          if (!ok) { log('동기화 실패 @' + baud); return finish().then(function () { return tryBaud(bi + 1); }); }
          synced = true;
          log('동기화 @' + baud);
          return program(io, baud).then(function (res) { return finish().then(function () { return res; }); });
        }).catch(function (e) {
          return finish().then(function () {
            if (!synced && e && e.code === 'io') return tryBaud(bi + 1);
            throw e;
          });
        });
      }, function (e) {
        openFails++;
        lastOpenErr = e;
        log('포트 열기 실패 @' + baud + ': ' + (e && e.message || e));
        return tryBaud(bi + 1);
      });
    }

    function program(io, baud) {
      var sig = '';
      progress({ stage: 'signature', baud: baud });
      return command(io, [STK.READ_SIGN, STK.EOP], 3, 500, '칩 서명 읽기').then(function (s) {
        sig = s.map(hex2).join('');
        if (opts.signature && sig !== String(opts.signature).toLowerCase()) {
          throw StkError('signature_mismatch', '칩 서명이 다릅니다(보드 ' + sig + ', 펌웨어 ' + opts.signature + ')');
        }
        return command(io, [STK.ENTER, STK.EOP], 0, 500, '프로그램 모드 진입');
      }).then(function () {
        return eachPage(function (p, i) {
          progress({ stage: 'write', baud: baud, percent: Math.round(i * 100 / pages.length) });
          return loadAddress(io, p.addr).then(function () {
            var cmd = new Uint8Array(5 + pageSize);
            cmd[0] = STK.PROG_PAGE; cmd[1] = (pageSize >> 8) & 0xff; cmd[2] = pageSize & 0xff; cmd[3] = 0x46; // 'F' = Flash
            cmd.set(p.bytes, 4);
            cmd[4 + pageSize] = STK.EOP;
            return command(io, cmd, 0, 1000, '페이지 쓰기 0x' + p.addr.toString(16));
          });
        });
      }).then(function () {
        progress({ stage: 'write', baud: baud, percent: 100 });
        return eachPage(function (p, i) {
          progress({ stage: 'verify', baud: baud, percent: Math.round(i * 100 / pages.length) });
          return loadAddress(io, p.addr).then(function () {
            return command(io, [STK.READ_PAGE, (pageSize >> 8) & 0xff, pageSize & 0xff, 0x46, STK.EOP], pageSize, 1000, '페이지 읽기 0x' + p.addr.toString(16));
          }).then(function (got) {
            for (var k = 0; k < pageSize; k++) {
              if (got[k] !== p.bytes[k]) {
                throw StkError('verify_failed', '검증 실패: 0x' + (p.addr + k).toString(16) + ' 기록 0x' + hex2(p.bytes[k]) + ', 읽음 0x' + hex2(got[k]));
              }
            }
          });
        });
      }).then(function () {
        progress({ stage: 'verify', baud: baud, percent: 100 });
        progress({ stage: 'leave', baud: baud });
        return command(io, [STK.LEAVE, STK.EOP], 0, 500, '프로그램 모드 종료');
      }).then(function () {
        progress({ stage: 'done', baud: baud, percent: 100 });
        return { baud: baud, bytes: image.size, pages: pages.length, signature: sig };
      });
    }

    function loadAddress(io, byteAddr) {
      var w = byteAddr >> 1;   // STK500 LOAD_ADDRESS 는 word(2바이트) 주소, 하위 바이트 먼저
      return command(io, [STK.LOAD_ADDRESS, w & 0xff, (w >> 8) & 0xff, STK.EOP], 0, 500, '주소 설정');
    }

    function eachPage(fn) {
      return pages.reduce(function (p, page, i) { return p.then(function () { return fn(page, i); }); }, Promise.resolve());
    }

    return tryBaud(0);
  }

  var api = { flash: flash, parseIntelHex: parseIntelHex, paginate: paginate, StkError: StkError, STK: STK };
  root.HubSTK500 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
