import http.server
import socketserver
import json
import os
from datetime import datetime


PORT = 3000
LOG_FILE = "logs.jsonl"
USERS_FILE = "users.json"


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/logs':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            logs = []
            if os.path.exists(LOG_FILE):
                with open(LOG_FILE, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.strip():
                            try:
                                logs.append(json.loads(line))
                            except:
                                pass
            
            # Return most recent first
            self.wfile.write(json.dumps(logs[::-1]).encode('utf-8'))
            
        elif self.path == '/api/users':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            users = {}
            if os.path.exists(USERS_FILE):
                try:
                    with open(USERS_FILE, 'r', encoding='utf-8') as f:
                        users = json.load(f)
                except:
                    pass
            self.wfile.write(json.dumps(users).encode('utf-8'))
            
        else:
            super().do_GET()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        if self.path == '/api/log':
            try:
                data = json.loads(post_data.decode('utf-8'))
                data['timestamp'] = datetime.now().isoformat()
                # Capture IP
                data['ip'] = self.client_address[0]
                
                with open(LOG_FILE, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(data) + "\n")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')
            except Exception as e:
                print(f"Error logging: {e}")
                self.send_response(500)
                self.end_headers()
                
        elif self.path == '/api/users':
            try:
                req = json.loads(post_data.decode('utf-8'))
                ip = req.get('ip')
                name = req.get('name')
                
                if ip and name:
                    users = {}
                    if os.path.exists(USERS_FILE):
                        try:
                            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                                users = json.load(f)
                        except:
                            pass
                    
                    users[ip] = name
                    
                    with open(USERS_FILE, 'w', encoding='utf-8') as f:
                        json.dump(users, f, indent=2)
                        
                    self.send_response(200)
                    self.wfile.write(b'{"status":"ok"}')
                else:
                    self.send_error(400)
            except Exception as e:
                print(f"Error saving user: {e}")
                self.send_response(500)
                self.end_headers()

        else:
            self.send_error(404)

print(f"Server started at http://localhost:{PORT}")
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
