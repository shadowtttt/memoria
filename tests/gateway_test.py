"""Exercise the real Caddy route using isolated, synthetic upstreams (Linux/Docker)."""
import http.client
import http.server
import json
import pathlib
import subprocess
import tempfile
import threading
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
calls = []

class Mock(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.headers.get('Cookie') == 'site_session=synthetic-valid':
            self.send_response(200)
        else:
            self.send_response(302)
            self.send_header('Location', '/site-auth/login')
        self.end_headers()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        calls.append({'path': self.path, 'headers': dict(self.headers), 'body': json.loads(body)})
        stream = json.loads(body).get('action') == 'chat'
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream' if stream else 'application/json')
        self.end_headers()
        self.wfile.write(b'data: {"synthetic":true}\n\n' if stream else b'{"synthetic":true}')

servers = [http.server.ThreadingHTTPServer(('127.0.0.1', port), Mock) for port in (18081, 18082)]
for server in servers:
    threading.Thread(target=server.serve_forever, daemon=True).start()
name = 'memoria-session-route-check'
image = subprocess.check_output(['docker','inspect','caddy-proxy','--format','{{.Image}}'], text=True).strip()

def request(headers=None, method='POST', action='list_models'):
    conn = http.client.HTTPConnection('127.0.0.1', 18089, timeout=4)
    conn.request(method, '/memoria/api', json.dumps({'action': action}), headers or {})
    response = conn.getresponse()
    result = response.status, dict(response.getheaders()), response.read()
    conn.close()
    return result

try:
    with tempfile.TemporaryDirectory(prefix='gateway-fixture-', dir=ROOT) as tmp:
        config = pathlib.Path(tmp)/'Caddyfile'
        snippet = (ROOT/'deploy/memoria.caddy').read_text().replace('telegram-hub:8080','127.0.0.1:18081').replace('memoria-api:8000','127.0.0.1:18082')
        config.write_text('{\n admin off\n}\n'+snippet+'\nhttp://127.0.0.1:18089 {\n bind 127.0.0.1\n import memoria_session\n}\n')
        subprocess.run(['docker','run','--rm','-v',f'{config}:/etc/caddy/Caddyfile:ro',image,'caddy','validate','--config','/etc/caddy/Caddyfile'],check=True)
        subprocess.run(['docker','run','-d','--rm','--name',name,'--network','host',
                        '-e','MEMORIA_WEB_TOKEN=synthetic-gateway-token','-v',f'{config}:/etc/caddy/Caddyfile:ro',image], check=True, stdout=subprocess.DEVNULL)
        for attempt in range(30):
            try:
                if request()[0] == 403:
                    break
            except OSError:
                time.sleep(0.2)
        else:
            raise AssertionError('Caddy fixture did not start')
        valid = {'Origin':'https://127.0.0.1','Content-Type':'application/json','X-Memoria-Client':'session','Cookie':'site_session=synthetic-valid'}
        for key in ('Origin','X-Memoria-Client','Content-Type'):
            headers = dict(valid)
            del headers[key]
            assert request(headers)[0] == 403, key
        for origin in ('https://foreign.example','null'):
            assert request({**valid,'Origin':origin})[0] == 403
        assert request(valid,method='GET')[0] == 403
        assert request({k:v for k,v in valid.items() if k!='Cookie'})[0] == 302
        assert request({**valid,'Cookie':'site_session=invalid'})[0] == 302
        assert not calls, 'denied requests reached the API'
        headers={**valid,'x-memoria-web-token':'forged','x-memoria-audit-token':'forged','x-channel-recall-token':'forged','x-channel-timeline-token':'forged','x-app-pin':'old','Authorization':'Bearer forged'}
        status,response_headers,body=request(headers)
        assert status==200 and json.loads(body)=={'synthetic':True}
        assert response_headers.get('Cache-Control')=='no-store'
        forwarded={k.lower():v for k,v in calls[-1]['headers'].items()}
        assert forwarded['x-memoria-web-token']=='synthetic-gateway-token'
        assert not any(k in forwarded for k in ('cookie','authorization','x-app-pin','x-memoria-audit-token','x-channel-recall-token','x-channel-timeline-token'))
        assert calls[-1]['path']=='/'
        status,headers,body=request(valid,action='chat')
        assert status==200 and headers['Content-Type']=='text/event-stream' and b'synthetic' in body
        print('PASS: 8 rejected request cases, session forwarding, credential isolation, JSON and SSE')
finally:
    subprocess.run(['docker','stop',name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for server in servers:
        server.shutdown()
