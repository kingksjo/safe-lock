import datetime
from flask import Blueprint, jsonify
from tracker import get_last_seen
from models import AccessLog

device_bp = Blueprint('device', __name__)

@device_bp.route('/api/device/status', methods=['GET'])
def get_device_status():
    last_seen_dt = get_last_seen()
    last_seen_str = last_seen_dt.isoformat() if last_seen_dt else None
    
    # Calculate connection status (online if active in the last 10 seconds)
    status = "offline"
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
        'status': status
    })
