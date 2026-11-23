"""WFC Proposal Builder: small local server (double-click Start.bat).
Serves the tool on http://localhost:8081/ and makes clean PDFs: the page posts the proposal to /api/pdf, Edge (or Chrome) prints it
without the header and footer, and the PDF comes back. The same PDF is used to build the PowerPoint. Only this PC can reach it."""
import base64, http.server, json, os, shutil, socket, struct, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request, uuid

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get('WFC_PORT', '8081'))
MAX_BODY = 120 * 1024 * 1024
BROWSERS = [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
            r'C:\Program Files\Google\Chrome\Application\chrome.exe', r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe']
BROWSER = next((b for b in BROWSERS if os.path.exists(b)), None)
STATES, LOCK = {}, threading.Lock()


class WebSocket:
    """Just enough of a WebSocket client to talk to the browser's DevTools port (no extra packages needed)."""
    def __init__(self, url):
        u = urllib.parse.urlparse(url)
        self.sock = socket.create_connection((u.hostname, u.port), timeout=60)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(('GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n'
                           % (u.path, u.hostname, u.port, key)).encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError('The browser closed the connection.')
            buf += chunk
        self.buf = buf.split(b'\r\n\r\n', 1)[1]

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(1 << 20)
            if not chunk:
                raise RuntimeError('The browser closed the connection.')
            self.buf += chunk
        data, self.buf = self.buf[:n], self.buf[n:]
        return data

    def send(self, obj):
        data = json.dumps(obj).encode(); mask = os.urandom(4); n = len(data)
        head = bytearray([0x81])
        if n < 126: head.append(0x80 | n)
        elif n < 65536: head.append(0x80 | 126); head += struct.pack('>H', n)
        else: head.append(0x80 | 127); head += struct.pack('>Q', n)
        self.sock.sendall(bytes(head) + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv(self):
        message = b''
        while True:
            b1, b2 = self._read(2)
            fin, op, n = b1 & 0x80, b1 & 0x0F, b2 & 0x7F
            if n == 126: n = struct.unpack('>H', self._read(2))[0]
            elif n == 127: n = struct.unpack('>Q', self._read(8))[0]
            payload = self._read(n)
            if op == 0x8: raise RuntimeError('The browser closed the connection.')
            if op in (0x1, 0x0, 0x2): message += payload
            if fin and op != 0x9 and op != 0xA: return json.loads(message.decode('utf-8'))

    def call(self, method, params=None, _ids=[0]):
        _ids[0] += 1; i = _ids[0]
        self.send({'id': i, 'method': method, 'params': params or {}})
        while True:
            m = self.recv()
            if m.get('id') == i:
                if 'error' in m: raise RuntimeError(m['error'].get('message', 'browser error'))
                return m.get('result', {})

    def close(self):
        try: self.sock.close()
        except OSError: pass


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); return s.getsockname()[1]


def make_pdf(state_bytes, doc=''):
    """Opens the proposal in a hidden browser, waits until the page says it is ready, and prints it (no header or footer)."""
    sid = uuid.uuid4().hex[:12]
    tmp = tempfile.mkdtemp(prefix='wfc-pdf-')
    port = free_port()
    STATES[sid] = state_bytes
    proc = subprocess.Popen([BROWSER, '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=%d' % port, '--user-data-dir=' + os.path.join(tmp, 'profile'), 'about:blank'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws = None
    try:
        target = None
        for _ in range(100):
            try:
                with urllib.request.urlopen('http://127.0.0.1:%d/json/list' % port, timeout=2) as r:
                    pages = [t for t in json.loads(r.read()) if t.get('type') == 'page']
                if pages: target = pages[0]; break
            except (OSError, ValueError):
                pass
            time.sleep(0.2)
        if not target:
            raise RuntimeError('The browser did not start.')
        ws = WebSocket(target['webSocketDebuggerUrl'])
        ws.call('Page.enable')
        ws.call('Page.navigate', {'url': 'http://127.0.0.1:%d/index.html?print=1&state=%s%s' % (PORT, sid, ('&doc=' + doc) if doc else '')})
        deadline = time.time() + 90
        while time.time() < deadline:
            r = ws.call('Runtime.evaluate', {'expression': 'window.__ready === true', 'returnByValue': True})
            if r.get('result', {}).get('value') is True:
                break
            time.sleep(0.25)
        else:
            raise RuntimeError('The proposal did not finish loading.')
        time.sleep(0.4)   # let the last images settle
        res = ws.call('Page.printToPDF', {'printBackground': True, 'preferCSSPageSize': True, 'displayHeaderFooter': False})
        return base64.b64decode(res['data'])
    finally:
        # ask the hidden browser to quit (that also ends its helper processes); only if it does not, end it by force
        if ws:
            try: ws.call('Browser.close')
            except Exception: pass   # noqa: BLE001
            ws.close()
        try: proc.wait(timeout=8)
        except subprocess.TimeoutExpired: pass
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        proc.kill()
        STATES.pop(sid, None)
        for _ in range(10):
            shutil.rmtree(tmp, ignore_errors=True)
            if not os.path.exists(tmp): break
            time.sleep(0.3)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):   # always load the newest files
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):   # silent unless WFC_VERBOSE is set
        if os.environ.get('WFC_VERBOSE'):
            sys.stderr.write('%s\n' % (fmt % args))

    def send_error(self, code, message=None, explain=None):   # quiet 404s (the browser asks for a favicon)
        try:
            body = (message or 'Not found').encode('utf-8')
            self.send_response(code); self.send_header('Content-Type', 'text/plain; charset=utf-8'); self.send_header('Content-Length', str(len(body))); self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)
        except OSError:
            pass

    def _send(self, code, body, ctype):
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj).encode('utf-8'), 'application/json')

    def do_GET(self):
        p = urllib.parse.urlparse(self.path).path
        if p == '/api/ping':
            return self._json(200, {'ok': True, 'pdf': bool(BROWSER)})
        if p.startswith('/api/state/'):
            data = STATES.get(p.rsplit('/', 1)[-1])
            return self._send(200, data, 'application/json') if data else self._json(404, {'error': 'unknown state'})
        return super().do_GET()

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != '/api/pdf':
            return self._json(404, {'error': 'not found'})
        doc = (urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('doc') or [''])[0]
        doc = doc if doc in ('quotation',) else ''
        if not BROWSER:
            return self._json(500, {'error': 'Microsoft Edge or Google Chrome was not found on this PC.'})
        n = int(self.headers.get('Content-Length', '0'))
        if n <= 0 or n > MAX_BODY:
            return self._json(400, {'error': 'The proposal is empty or too large.'})
        body = self.rfile.read(n)
        try:
            json.loads(body)
        except ValueError:
            return self._json(400, {'error': 'That is not a proposal.'})
        with LOCK:   # one PDF at a time
            try:
                pdf = make_pdf(body, doc)
            except Exception as e:   # noqa: BLE001
                return self._json(500, {'error': str(e)})
        self._send(200, pdf, 'application/pdf')


if __name__ == '__main__':
    try:
        srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError:
        print('Port %d is already in use. The tool may already be running: open http://localhost:%d/' % (PORT, PORT)); sys.exit(1)
    print('WFC Proposal Builder is running at http://localhost:%d/  (close this window to stop it)' % PORT)
    if not BROWSER:
        print('Note: Edge or Chrome was not found, so Save PDF will use the print window instead.')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
