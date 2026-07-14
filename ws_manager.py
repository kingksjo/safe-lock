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

    def handle_incoming_ws_message(app, data):
        try:
            payload = json.loads(data)
            if not isinstance(payload, dict):
                return
            event = payload.get("event")
            if event == "LOG" or event == "LOG_BATCH":
                from database import db
                from models import AccessLog
                import datetime
                
                with app.app_context():
                    logs_to_process = []
                    if event == "LOG":
                        logs_to_process.append(payload)
                    elif event == "LOG_BATCH":
                        logs_to_process.extend(payload.get("logs", []))
                        
                    for item in logs_to_process:
                        status = item.get("status", "KEYPAD_TOUCH")
                        pin_attempts = item.get("pin_attempts", 0)
                        fp_attempts = item.get("fp_attempts", 0)
                        
                        # If the offline log includes a timestamp offset (seconds ago when captured while offline)
                        offset_sec = item.get("offset_seconds", 0)
                        log_time = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=offset_sec)
                        
                        # Check if there is a recent AccessLog record from camera capture within the last 60 seconds
                        recent_log = AccessLog.query.filter(
                            AccessLog.timestamp >= log_time - datetime.timedelta(seconds=60),
                            AccessLog.image_id.isnot(None),
                            AccessLog.status == 'KEYPAD_TOUCH'
                        ).order_by(AccessLog.timestamp.desc()).first()
                        
                        if recent_log:
                            # Update the existing record attached to the camera frame
                            recent_log.status = status
                            recent_log.pin_attempts = pin_attempts
                            recent_log.fp_attempts = fp_attempts
                            if item.get("fp_slot_id") is not None:
                                recent_log.fp_slot_id = item.get("fp_slot_id")
                        else:
                            log_entry = AccessLog(
                                status=status,
                                pin_attempts=pin_attempts,
                                fp_attempts=fp_attempts,
                                fp_slot_id=item.get("fp_slot_id"),
                                image_id=item.get("image_id"),
                                timestamp=log_time
                            )
                            db.session.add(log_entry)
                    db.session.commit()
        except Exception:
            pass

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
                        handle_incoming_ws_message(app, data)
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
