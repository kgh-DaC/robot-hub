"""통합 로봇 허브 로컬 서버 (표준 라이브러리만 사용).

- 통합/ 폴더를 루트로 정적 파일을 http://127.0.0.1:8800/ 에서 제공한다.
  허브와 각 로봇 제어 웹이 같은 출처가 되어야 허브가 iframe 안 정지 버튼을 누를 수 있다.
- 로봇 개 제어 웹은 localhost 에서 열리면 게이트웨이 모드가 되어 같은 출처의 상대 경로 api/* 를 부른다.
  PROXIES 표의 접두사로 오는 요청을 USB 게이트웨이(usb_gateway.py, 기본 127.0.0.1:8787)로 넘긴다.
  게이트웨이가 꺼져 있으면 502 와 JSON 오류를 돌려준다.

환경변수: HUB_PORT(기본 8800), ROBOTDOG_GATEWAY(기본 http://127.0.0.1:8787)
"""
import http.client
import json
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "127.0.0.1"
PORT = int(os.environ.get("HUB_PORT", "8800"))

# (경로 접두사, 넘길 곳, 허용하는 나머지 경로). 접두사 뒤의 나머지 경로가 넘길 곳 뒤에 붙는다.
# 허용 목록 밖의 나머지 경로는 404. 출처: _workspace/01_inventory_robotdog.json control_page.hosting.modes.http_loopback
# 로봇 개 페이지가 부르는 것은 api/command, api/status 둘뿐이다(robot_control_web/index.html:766, :856).
PROXIES = [
    ("/robot_dog/esp32-robot-dog-code-master/software/robot_control_web/api/",
     os.environ.get("ROBOTDOG_GATEWAY", "http://127.0.0.1:8787").rstrip("/") + "/api/",
     ("status", "command")),
]

# 이 서버로 오는 요청의 Host 는 이 두 값만 허용한다(대소문자 무시).
# 이유: 프록시는 게이트웨이로 넘길 때 Host 를 게이트웨이 주소로 바꾼다. usb_gateway.py 는 DNS 리바인딩을
# 막으려고 Host 를 검사하는데(_host_ok), 허브가 아무 Host 나 받아서 넘기면 그 방어가 무력화되어
# 리바인딩된 외부 웹페이지가 허브를 거쳐 로봇 개에 ARM/WALK 를 보낼 수 있다. 그래서 허브가 먼저 같은 검사를 한다.
ALLOWED_HOSTS = ("localhost:%d" % PORT, "127.0.0.1:%d" % PORT) + (("localhost", "127.0.0.1") if PORT == 80 else ())
ALLOWED_ORIGINS = tuple("http://" + h for h in ALLOWED_HOSTS)
# 정적 파일로 내주지 않는 경로 구성요소(점으로 시작하는 것은 따로 전부 막는다)
HIDDEN_NAMES = ("_workspace",)

# 게이트웨이 DISCONNECT 는 정지 확인까지 최대 6초 걸릴 수 있다
PROXY_TIMEOUT_S = 10
FORWARD_HEADERS = ("Content-Type", "X-Robot-Control", "Accept")
MAX_BODY = 64 * 1024


class HubHandler(SimpleHTTPRequestHandler):
    # Windows 레지스트리가 .js 를 text/plain 으로 바꿔 두는 경우가 있어 직접 지정한다
    # (SMARS 콘솔은 type="module" 이라 MIME 이 틀리면 로드되지 않는다).
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".htm": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".wasm": "application/wasm",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".ico": "image/x-icon",
    }

    def log_message(self, fmt, *args):
        sys.stderr.write("[hub] %s %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        # 로봇 웹을 고친 뒤 새로고침만으로 반영되게
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # ---------------------------------------------------------------- 요청 검사
    def _host_ok(self):
        host = (self.headers.get("Host") or "").strip().lower()
        return host in ALLOWED_HOSTS

    def _origin_ok(self):
        # 프록시용: Origin/Referer 가 있으면 이 허브와 같은 출처여야 한다(없으면 통과. 같은 출처 GET 은 Origin 을 안 붙인다)
        origin = self.headers.get("Origin")
        if origin is not None and origin.strip().lower().rstrip("/") not in ALLOWED_ORIGINS:
            return False
        referer = self.headers.get("Referer")
        if referer is not None:
            r = referer.strip().lower()
            if not any(r == o or r.startswith(o + "/") for o in ALLOWED_ORIGINS):
                return False
        return True

    def _parsed(self):
        """요청 대상(path, query)을 파싱한다. 원점형(/로 시작)만 받고 '..'·'.'·역슬래시·NUL 이 있으면 None."""
        raw = self.path
        if not raw.startswith("/") or raw.startswith("//"):
            return None                     # 절대형(http://host/...), '*', 권한형 등
        parts = urlsplit(raw)
        decoded = unquote(parts.path)
        if "\\" in decoded or "\x00" in decoded:
            return None
        for seg in decoded.split("/"):
            if seg in (".", ".."):
                return None
        return parts.path, parts.query

    def _gate(self):
        """모든 요청 공통 검사. 통과하면 (path, query), 아니면 응답을 보내고 None."""
        if not self._host_ok():
            self._json(403, {"ok": False, "error": "bad_host"})
            return None
        parsed = self._parsed()
        if parsed is None:
            self._json(400, {"ok": False, "error": "bad_path"})
            return None
        return parsed

    def _hidden(self, path):
        """점으로 시작하는 구성요소(.git, .claude 등)나 _workspace 가 들어간 정적 경로면 True."""
        def bad(seg):
            s = seg.rstrip(". ").lower()   # Windows 는 끝의 점·공백을 무시한다(_workspace. == _workspace)
            return seg.startswith(".") or s in HIDDEN_NAMES or ":" in seg
        if any(bad(seg) for seg in unquote(path).split("/") if seg):
            return True
        # 8.3 짧은 이름(_WORKSP~1)·정션 등으로 돌아가는 경우: 실제 경로로 다시 확인
        try:
            real = os.path.realpath(self.translate_path(path))
            rel = os.path.relpath(real, os.path.realpath(ROOT))
        except (OSError, ValueError):
            return True
        if rel == os.curdir:
            return False
        if rel.startswith(os.pardir):
            return True
        return any(bad(seg) for seg in rel.replace("\\", "/").split("/") if seg)

    def list_directory(self, path):
        # 디렉터리 목록은 내주지 않는다(index.html 이 있는 디렉터리는 그 파일을 먼저 내준다)
        self._json(404, {"ok": False, "error": "not_found"})
        return None

    # ---------------------------------------------------------------- 프록시
    def _proxy_target(self, path, query):
        """프록시 대상 URL. 접두사가 아니면 None, 접두사인데 허용 목록 밖이면 ''."""
        for prefix, target, allowed in PROXIES:
            if path.startswith(prefix):
                rest = path[len(prefix):]
                if rest not in allowed:
                    return ""
                return target + rest + ("?" + query if query else "")
        return None

    def _json(self, status, value):
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self, method, target):
        body = None
        if method == "POST":
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = -1
            if length < 0 or length > MAX_BODY:
                self._json(413, {"ok": False, "error": "bad_body_size"})
                return
            body = self.rfile.read(length)
        u = urlsplit(target)
        headers = {k: self.headers[k] for k in FORWARD_HEADERS if self.headers.get(k) is not None}
        if body is not None:
            headers["Content-Length"] = str(len(body))
        conn = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=PROXY_TIMEOUT_S)
        try:
            # Host 헤더는 http.client 가 게이트웨이 주소로 채운다(게이트웨이의 Host 검사 통과)
            conn.request(method, (u.path or "/") + ("?" + u.query if u.query else ""), body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
        except (OSError, http.client.HTTPException) as exc:
            self._json(502, {"ok": False, "error": "gateway_offline",
                             "message": "로봇 개 USB 게이트웨이(usb_gateway.py)에 연결할 수 없습니다: %s" % exc.__class__.__name__,
                             "gateway": "%s://%s" % (u.scheme, u.netloc)})
            return
        finally:
            conn.close()
        self.send_response(resp.status)
        self.send_header("Content-Type", resp.getheader("Content-Type", "application/json"))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _route(self, method):
        parsed = self._gate()
        if parsed is None:
            return
        path, query = parsed
        target = self._proxy_target(path, query)
        if target is not None:
            if target == "":
                self._json(404, {"ok": False, "error": "not_found"})
            elif not self._origin_ok():
                self._json(403, {"ok": False, "error": "bad_origin"})
            elif method == "HEAD":
                self._json(405, {"ok": False, "error": "method_not_allowed"})
            else:
                self._proxy(method, target)
            return
        if method == "POST":
            self._json(405, {"ok": False, "error": "method_not_allowed"})
        elif self._hidden(path):
            self._json(404, {"ok": False, "error": "not_found"})
        elif method == "HEAD":
            super().do_HEAD()
        else:
            super().do_GET()

    def do_GET(self):
        self._route("GET")

    def do_HEAD(self):
        self._route("HEAD")

    def do_POST(self):
        self._route("POST")


def main():
    handler = partial(HubHandler, directory=ROOT)
    try:
        httpd = ThreadingHTTPServer((HOST, PORT), handler)
    except OSError as exc:
        sys.stderr.write("[hub] %s:%d 를 열 수 없습니다(이미 실행 중일 수 있음): %s\n" % (HOST, PORT, exc))
        sys.exit(1)
    print("[hub] 통합 로봇 허브: http://localhost:%d/  (루트 %s)" % (PORT, ROOT))
    for prefix, target, _allowed in PROXIES:
        print("[hub] 프록시 %s -> %s" % (prefix, target))
    print("[hub] 끝내려면 Ctrl+C")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
