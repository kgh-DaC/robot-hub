"""가짜 로봇 개 게이트웨이: 모든 api 요청에 ok 응답, 받은 요청을 출력"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class H(BaseHTTPRequestHandler):
    def _ok(self, body):
        b = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        print("GET", self.path, self.headers.get("Host"), flush=True)
        self._ok({"connected": True, "armed": False, "walk": "STOP", "youControl": True})

    def do_POST(self):
        n = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(n).decode()
        print("POST", self.path, self.headers.get("Host"), body, flush=True)
        self._ok({"ok": True})

    def log_message(self, *a):
        pass


ThreadingHTTPServer(("127.0.0.1", 8799), H).serve_forever()
