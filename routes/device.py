import datetime
import socket
from flask import Blueprint, jsonify
from tracker import get_last_seen
from models import AccessLog

device_bp = Blueprint('device', __name__)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

@device_bp.route('/api/device/status', methods=['GET'])
def get_device_status():
    from ws_manager import active_websockets
    import json
    
    # Actively purge any dead sockets from active_websockets right now
    dead_sockets = set()
    for ws in list(active_websockets):
        try:
            ws.send(json.dumps({"command": "PING"}))
        except Exception:
            dead_sockets.add(ws)
    active_websockets.difference_update(dead_sockets)
    
    last_seen_dt = get_last_seen()
    
    # If we have a live WebSocket connection, the device is online right now
    if len(active_websockets) > 0:
        status = "online"
        last_seen_str = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat()
    else:
        status = "offline"
        last_seen_str = last_seen_dt.isoformat() if last_seen_dt else None
        if last_seen_dt:
            time_diff = (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - last_seen_dt).total_seconds()
            if time_diff < 10:
                status = "online"
            
    # Override with lockout check: check if the device is currently locked out
    # Lockout duration is 30 seconds (30000ms as per specification)
    latest_log = AccessLog.query.order_by(AccessLog.timestamp.desc()).first()
    if latest_log and latest_log.status == 'LOCKOUT':
        time_since_lockout = (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - latest_log.timestamp).total_seconds()
        if time_since_lockout < 30:
            status = "locked_out"
            
    return jsonify({
        'last_seen': last_seen_str,
        'status': status,
        'host_ip': get_local_ip()
    })
