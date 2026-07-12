import datetime
from flask import Blueprint, request, jsonify
from database import db
from models import AccessLog
from tracker import update_last_seen

logs_bp = Blueprint('logs', __name__)

@logs_bp.route('/api/log', methods=['POST'])
def create_log():
    data = request.get_json() or {}
    
    # Extract parameters
    status = data.get('status')
    if not status:
        return jsonify({'error': 'status is required'}), 400
        
    pin_attempts = data.get('pin_attempts', 0)
    fp_attempts = data.get('fp_attempts', 0)
    fp_slot_id = data.get('fp_slot_id')
    
    # Parse timestamp if sent, otherwise use current UTC time
    timestamp_str = data.get('timestamp')
    timestamp = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    if timestamp_str:
        try:
            timestamp = datetime.datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        except ValueError:
            pass # fallback to utcnow if invalid
            
    # Create the access log
    log = AccessLog(
        status=status,
        pin_attempts=pin_attempts,
        fp_attempts=fp_attempts,
        fp_slot_id=fp_slot_id,
        timestamp=timestamp
    )
    
    db.session.add(log)
    db.session.commit()
    
    # Track device activity
    update_last_seen()
    
    return jsonify({
        'status': 'ok',
        'log_id': log.id
    }), 201


@logs_bp.route('/api/logs', methods=['GET'])
def get_logs():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    status_filter = request.args.get('status')
    
    query = AccessLog.query.order_by(AccessLog.timestamp.desc())
    
    if status_filter and status_filter.lower() != 'all':
        query = query.filter(AccessLog.status == status_filter)
        
    # Using SQLAlchemy pagination
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'data': [log.to_dict() for log in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'per_page': pagination.per_page,
        'pages': pagination.pages
    })


@logs_bp.route('/api/logs/<int:log_id>', methods=['GET'])
def get_log(log_id):
    log = db.session.get(AccessLog, log_id)
    if not log:
        return jsonify({'error': 'Log entry not found'}), 404
        
    return jsonify({
        'data': log.to_dict()
    })
