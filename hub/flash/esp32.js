/* ESP32 업로더: esptool-js(hub/vendor/esptool.bundle.js, window.HubEsptool)를 허브 진행 표시에 맞춰 감싼다.
 * classic script. window.HubESP32.flash(port, files, opts)
 *
 * - files: [{ address, data: Uint8Array, name }] (bootloader 0x1000, partitions 0x8000, boot_app0 0xe000, app 0x10000)
 * - 플래시 전체 지우기는 하지 않는다(eraseAll:false). 쓰는 영역만 지워지므로 NVS(Preferences)·EEPROM 영역은 남는다.
 * - flashMode/Freq/Size 는 'keep': 빌드가 bootloader 헤더에 넣은 값(flash_args 와 같음)을 그대로 쓴다.
 * - 파일마다 MD5 로 기록 결과를 칩에서 다시 계산해 비교한다(esptool-js calculateMD5Hash).
 * - bauds 를 앞에서부터 시도한다(ROM 접속은 115200, 스텁이 뜬 뒤 그 baud 로 올림). 접속 실패면 다음 baud.
 * 오류 code: port_busy | no_sync | chip_mismatch | verify_failed | io
 */
(function (root) {
  'use strict';

  function FlashError(code, message) {
    var e = new Error(message || code);
    e.name = 'FlashError';
    e.code = code;
    return e;
  }

  // ---------------------------------------------------------------- MD5 (RFC 1321). 결과 소문자 hex
  function md5(bytes) {
    var K = new Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    var len = bytes.length;
    var total = ((len + 8) >>> 6 << 6) + 64;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    var bits = len * 8;
    for (var b = 0; b < 8; b++) buf[total - 8 + b] = Math.floor(bits / Math.pow(2, 8 * b)) & 0xff;
    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    var M = new Array(16);
    for (var off = 0; off < total; off += 64) {
      for (var j = 0; j < 16; j++) {
        var p = off + j * 4;
        M[j] = (buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)) >>> 0;
      }
      var A = a0, B = b0, C = c0, D = d0;
      for (var r = 0; r < 64; r++) {
        var F, g;
        if (r < 16) { F = (B & C) | (~B & D); g = r; }
        else if (r < 32) { F = (D & B) | (~D & C); g = (5 * r + 1) % 16; }
        else if (r < 48) { F = B ^ C ^ D; g = (3 * r + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * r) % 16; }
        F = (F + A + K[r] + M[g]) >>> 0;
        A = D; D = C; C = B;
        var s = S[(r >> 4) * 4 + (r & 3)];
        B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    var out = '';
    [a0, b0, c0, d0].forEach(function (w) {
      for (var k = 0; k < 4; k++) out += ('0' + ((w >>> (8 * k)) & 0xff).toString(16)).slice(-2);
    });
    return out;
  }

  // ---------------------------------------------------------------- 업로드
  // opts: { bauds:[460800,115200], chip:'ESP32', onProgress(ev), log(msg) }
  // ev.stage: 'open' | 'reset' | 'sync' | 'write' | 'verify' | 'leave' | 'done'
  function flash(port, files, opts) {
    opts = opts || {};
    var E = root.HubEsptool;
    if (!E || !E.ESPLoader) return Promise.reject(FlashError('io', 'esptool-js 번들을 불러오지 못했습니다'));
    var bauds = (opts.bauds && opts.bauds.length) ? opts.bauds : [460800, 115200];
    var progress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    var log = typeof opts.log === 'function' ? opts.log : function () {};
    var terminal = {
      clean: function () {},
      writeLine: function (s) { log(String(s)); },
      write: function (s) { log(String(s)); }
    };
    var totalBytes = files.reduce(function (s, f) { return s + f.data.length; }, 0) || 1;
    var openFails = 0, lastErr = null;

    function attempt(bi) {
      if (bi >= bauds.length) {
        if (openFails === bauds.length) return Promise.reject(FlashError('port_busy', '포트를 열 수 없습니다: ' + (lastErr && lastErr.message || lastErr)));
        return Promise.reject(FlashError('no_sync', 'ESP32 부트로더에 접속하지 못했습니다: ' + (lastErr && lastErr.message || lastErr)));
      }
      var baud = bauds[bi];
      var transport = new E.Transport(port, false);
      var loader = new E.ESPLoader({ transport: transport, baudrate: baud, romBaudrate: 115200, terminal: terminal, debugLogging: false });
      var connected = false;
      var close = function () { return Promise.resolve().then(function () { return transport.disconnect(); }).catch(function () {}); };
      progress({ stage: 'reset', baud: baud });
      progress({ stage: 'sync', baud: baud });
      return loader.main('default_reset').then(function (chip) {
        connected = true;
        log('칩: ' + chip);
        var name = loader.chip && loader.chip.CHIP_NAME;
        if (opts.chip && name && name !== opts.chip) throw FlashError('chip_mismatch', '칩이 다릅니다(보드 ' + name + ', 펌웨어 ' + opts.chip + ')');
        var done = 0, cur = 0;
        progress({ stage: 'write', baud: baud, percent: 0 });
        return loader.writeFlash({
          fileArray: files.map(function (f) { return { data: f.data, address: f.address }; }),
          flashMode: 'keep', flashFreq: 'keep', flashSize: 'keep',
          eraseAll: false, compress: true,
          reportProgress: function (fileIndex, written, total) {
            if (fileIndex !== cur) { done += files[cur].data.length; cur = fileIndex; }
            var frac = total ? written / total : 1;
            progress({ stage: 'write', baud: baud, percent: Math.min(100, Math.round((done + frac * files[fileIndex].data.length) * 100 / totalBytes)) });
          },
          calculateMD5Hash: function (image) { progress({ stage: 'verify', baud: baud }); return md5(image); }
        });
      }).then(function () {
        progress({ stage: 'leave', baud: baud });
        return loader.after('hard_reset').catch(function (e) { log('리셋 실패(전원 다시 켜기 필요할 수 있음): ' + (e && e.message || e)); });
      }).then(function () {
        return close();
      }).then(function () {
        progress({ stage: 'done', baud: baud, percent: 100 });
        return { baud: baud, bytes: totalBytes, chip: loader.chip && loader.chip.CHIP_NAME };
      }, function (e) {
        return close().then(function () {
          if (e && e.code) throw e;
          var msg = String(e && e.message || e);
          if (connected) {
            if (/md5/i.test(msg)) throw FlashError('verify_failed', '검증 실패: ' + msg);
            throw FlashError('io', msg);
          }
          lastErr = e;
          if (/open|NetworkError|InvalidState|already/i.test(msg) || (e && /NetworkError|InvalidStateError/.test(e.name))) openFails++;
          log('접속 실패 @' + baud + ': ' + msg);
          return attempt(bi + 1);
        });
      });
    }
    return attempt(0);
  }

  root.HubESP32 = { flash: flash, md5: md5, FlashError: FlashError };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HubESP32;
})(typeof window !== 'undefined' ? window : globalThis);
