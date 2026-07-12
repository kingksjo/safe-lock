import json
from flask_sock import Sock
from tracker import update_last_seen

sock = Sock()
active_websockets = set()

def broadcast_command(command_dict):
    """
    Sends a JSON command to all connected ESP32 Brain WebSocket clients.
    Matches exact payload expected by kola_ice_esp_brain.ino:
    {"command": "UNLOCK"} / {"command": "LOCKDOWN"} / {"command": "RESET_PIN", "pin": "..."}
    """
    payload = json.dumps(command_dict)
    dead_sockets = set()
    for ws in list(active_websockets):
        try:
            ws.send(payload)
        except Exception:
            dead_sockets.add(ws)
    active_websockets.difference_update(dead_sockets)

def init_websocket(app):
    sock.init_app(app)

    @sock.route('/ws')
    def ws_handler(ws):
        active_websockets.add(ws)
        update_last_seen()
        try:
            while True:
                try:
                    data = ws.receive(timeout=5.0)
                    if data is not None:
                        update_last_seen()
                except Exception:
                    pass
                
                # Check if socket is closed or dead by sending a lightweight heartbeat PING
                try:
                    ws.send(json.dumps({"command": "PING"}))
                except Exception:
                    # If send fails, the physical device powered off or disconnected from network
                    break
        finally:
            active_websockets.discard(ws)
