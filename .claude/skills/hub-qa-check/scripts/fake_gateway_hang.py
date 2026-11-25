"""QA: POST 에 8초 동안 응답하지 않는 가짜 게이트웨이(okCheck 시간 초과 재현)"""
import json, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
class H(BaseHTTPRequestHandler):
    def _ok(self, body):
        b = json.dumps(body).encode(); self.send_response(200); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        self._ok({"connected": True, "armed": False, "walk": "STOP", "youControl": True})
    def do_POST(self):
        n = int(self.headers.get("Content-Length","0")); body=self.rfile.read(n).decode(); print("POST", body, flush=True); time.sleep(8); self._ok({"ok": True})
    def log_message(self,*a): pass
ThreadingHTTPServer(("127.0.0.1", 8797), H).serve_forever()
