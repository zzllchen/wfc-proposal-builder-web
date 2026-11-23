"""WFC Proposal Builder: small local server (double-click Start.bat).
Serves the tool on http://localhost:8081/ and makes clean PDFs: the page posts the proposal to /api/pdf, Edge (or Chrome) prints it
without the header and footer, and the PDF comes back. The same PDF is used to build the PowerPoint. Only this PC can reach it."""
import base64, http.server, json, os, re, shutil, socket, struct, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request, uuid

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get('WFC_PORT', '8081'))
MAX_BODY = 120 * 1024 * 1024
BROWSERS = [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
            r'C:\Program Files\Google\Chrome\Application\chrome.exe', r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe']
BROWSER = next((b for b in BROWSERS if os.path.exists(b)), None)
STATES, LOCK = {}, threading.Lock()
# the quotation register: every quotation number ever given, one counter per year, each revision, and a copy of each PDF (this PC only; Quotations/ is never published)
QUOTES = os.environ.get('WFC_QUOTES') or os.path.join(ROOT, 'Quotations')
REG_LOCK = threading.Lock()
NO_RE = re.compile(r'^WFC-QT-(\d{4})-(\d{4})$')
FILE_RE = re.compile(r'^[^\\/:*?"<>|\x00-\x1f]{1,180}$')
MAX_FILE = 60 * 1024 * 1024


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


def reg_load():
    try:
        with open(os.path.join(QUOTES, 'register.json'), encoding='utf-8') as f: r = json.load(f)
    except (OSError, ValueError):
        r = {}
    r.setdefault('seq', {}); r.setdefault('quotes', {})
    return r


def reg_save(r):
    os.makedirs(QUOTES, exist_ok=True)
    tmp = os.path.join(QUOTES, 'register.json.tmp')
    with open(tmp, 'w', encoding='utf-8') as f: json.dump(r, f, ensure_ascii=False, indent=1)
    os.replace(tmp, os.path.join(QUOTES, 'register.json'))


def now_iso():
    return time.strftime('%Y-%m-%dT%H:%M:%S')


ENTRY_KEYS = ('customer', 'project', 'currency', 'rev', 'status', 'total', 'monthly', 'date', 'type')


def put_entry(r, d):
    """Creates or updates the register line for one quotation. Returns (entry, None), or (None, the entry that already holds that number)."""
    no, uid = d.get('no'), str(d.get('uid') or '')[:40]
    e = r['quotes'].get(no)
    if e and e.get('uid') and uid and e['uid'] != uid:
        return None, e
    if not e:
        e = r['quotes'][no] = {'no': no, 'uid': uid, 'created': now_iso(), 'revs': []}
    if uid and not e.get('uid'): e['uid'] = uid
    for k in ENTRY_KEYS:
        if k in d and isinstance(d[k], (str, int, float)): e[k] = d[k][:200] if isinstance(d[k], str) else d[k]
    e['updated'] = now_iso()
    rv = d.get('revEntry')
    if isinstance(rv, dict) and isinstance(rv.get('rev'), int):
        cur = next((x for x in e['revs'] if x.get('rev') == rv['rev']), None)
        if not cur:
            cur = {'rev': rv['rev']}; e['revs'].append(cur); e['revs'].sort(key=lambda x: x['rev'])
        for k in ('status', 'at', 'note', 'total', 'monthly', 'currency'):
            if k in rv and isinstance(rv[k], (str, int, float)): cur[k] = rv[k][:500] if isinstance(rv[k], str) else rv[k]
    return e, None


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
        if p.lower().startswith('/quotations'):   # the register is only reachable through /api/quotes
            return self._json(404, {'error': 'not found'})
        if p == '/api/ping':
            return self._json(200, {'ok': True, 'pdf': bool(BROWSER), 'quotes': True})
        if p == '/api/quotes':
            with REG_LOCK: r = reg_load()
            lst = sorted(r['quotes'].values(), key=lambda e: e.get('updated', ''), reverse=True)
            return self._json(200, {'quotes': lst, 'seq': r['seq']})
        if p == '/api/quotes/file':
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            no, name = (q.get('no') or [''])[0], (q.get('name') or [''])[0]
            if not NO_RE.match(no) or not FILE_RE.match(name) or name.startswith('.'):
                return self._json(400, {'error': 'bad request'})
            path = os.path.join(QUOTES, no, name)
            if not os.path.isfile(path):
                return self._json(404, {'error': 'no such file'})
            with open(path, 'rb') as f: data = f.read()
            ctype = 'application/pdf' if name.lower().endswith('.pdf') else 'application/json'
            self.send_response(200); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(data)))
            self.send_header('Content-Disposition', "inline; filename*=UTF-8''" + urllib.parse.quote(name)); self.end_headers(); self.wfile.write(data); return
        if p.startswith('/api/state/'):
            data = STATES.get(p.rsplit('/', 1)[-1])
            return self._send(200, data, 'application/json') if data else self._json(404, {'error': 'unknown state'})
        return super().do_GET()

    def _quotes_post(self, p):
        if self.headers.get('X-WFC') != '1':   # a web page on another site cannot add this header, so it cannot write to the register
            return self._json(403, {'error': 'not allowed'})
        n = int(self.headers.get('Content-Length', '0'))
        if n < 0 or n > MAX_FILE:
            return self._json(400, {'error': 'too large'})
        body = self.rfile.read(n) if n else b''
        if p == '/api/quotes/pdf':
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            no, name, rev = (q.get('no') or [''])[0], (q.get('name') or [''])[0], (q.get('rev') or ['0'])[0]
            if not NO_RE.match(no) or not FILE_RE.match(name) or name.startswith('.') or not name.lower().endswith('.pdf') or not rev.isdigit() or not body.startswith(b'%PDF'):
                return self._json(400, {'error': 'bad request'})
            with REG_LOCK:
                r = reg_load(); e = r['quotes'].get(no)
                if not e: return self._json(404, {'error': 'unknown quotation number'})
                os.makedirs(os.path.join(QUOTES, no), exist_ok=True)
                with open(os.path.join(QUOTES, no, name), 'wb') as f: f.write(body)
                cur = next((x for x in e['revs'] if x.get('rev') == int(rev)), None)
                if not cur: cur = {'rev': int(rev)}; e['revs'].append(cur); e['revs'].sort(key=lambda x: x['rev'])
                cur['pdf'] = name; cur['pdfAt'] = now_iso(); e['updated'] = now_iso()
                reg_save(r)
            return self._json(200, {'ok': True})
        try:
            d = json.loads(body or b'{}')
            assert isinstance(d, dict)
        except (ValueError, AssertionError):
            return self._json(400, {'error': 'bad request'})
        with REG_LOCK:
            r = reg_load()
            if p == '/api/quotes/next':
                uid = str(d.get('uid') or '')[:40]
                year = str(d.get('year') or time.strftime('%Y'))
                if not re.match(r'^\d{4}$', year): return self._json(400, {'error': 'bad year'})
                mine = next((e for e in r['quotes'].values() if uid and e.get('uid') == uid), None)
                if mine: return self._json(200, {'no': mine['no']})   # asked twice for the same quotation: same number, none wasted
                seq = int(r['seq'].get(year, 0)) + 1
                while 'WFC-QT-%s-%04d' % (year, seq) in r['quotes']: seq += 1
                no = 'WFC-QT-%s-%04d' % (year, seq); r['seq'][year] = seq
                put_entry(r, {'no': no, 'uid': uid, 'status': 'draft', 'rev': 1}); reg_save(r)
                return self._json(200, {'no': no})
            if p in ('/api/quotes/claim', '/api/quotes/save'):
                no = str(d.get('no') or '')
                m = NO_RE.match(no)
                if not m: return self._json(200, {'ok': True, 'registered': False})   # a number typed in another style is not kept in the register
                e, taken = put_entry(r, d)
                if taken: return self._json(409, {'error': 'taken', 'by': taken.get('customer') or '', 'no': no})
                if int(r['seq'].get(m.group(1), 0)) < int(m.group(2)): r['seq'][m.group(1)] = int(m.group(2))
                old = str(d.get('old') or '')   # the number this quotation had before: dropped if nothing was ever issued under it
                if old and old != no and old in r['quotes'] and r['quotes'][old].get('uid') == e.get('uid') and not any(x.get('pdf') or x.get('status') in ('sent', 'accepted') for x in r['quotes'][old].get('revs', [])):
                    del r['quotes'][old]
                snap = d.get('snapshot')
                if p == '/api/quotes/save' and isinstance(snap, dict) and isinstance(d.get('rev'), int):
                    os.makedirs(os.path.join(QUOTES, no), exist_ok=True)
                    with open(os.path.join(QUOTES, no, 'Rev%d.json' % d['rev']), 'w', encoding='utf-8') as f: json.dump(snap, f, ensure_ascii=False)
                reg_save(r)
                return self._json(200, {'ok': True, 'registered': True})
        return self._json(404, {'error': 'not found'})

    def do_POST(self):
        p = urllib.parse.urlparse(self.path).path
        if p.startswith('/api/quotes/'):
            return self._quotes_post(p)
        if p != '/api/pdf':
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
