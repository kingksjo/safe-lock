import datetime
from flask import Blueprint, jsonify
from models import AccessLog
from database import db
from sqlalchemy import func

stats_bp = Blueprint('stats', __name__)

@stats_bp.route('/api/stats', methods=['GET'])
def get_stats():
    # 1. Total Today (logs since midnight UTC)
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    today_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    total_today = AccessLog.query.filter(AccessLog.timestamp >= today_midnight).count()
    
    # 2. Total Successes (all-time)
    successes = AccessLog.query.filter(AccessLog.status == 'SUCCESS').count()
    
    # 3. Total Failures (all-time: FAIL_PIN, FAIL_FP, LOCKOUT)
    failures = AccessLog.query.filter(AccessLog.status.in_(['FAIL_PIN', 'FAIL_FP', 'LOCKOUT'])).count()
    
    # 4. Total Lockouts (all-time)
    lockouts = AccessLog.query.filter(AccessLog.status == 'LOCKOUT').count()
    
    # 5. Peak Hours (hourly distribution of accesses, grouped by UTC hour 0-23)
    # Initialize the 24 hours dict
    hourly_counts = {h: 0 for h in range(24)}
    
    # Query database and extract hour from timestamp
    # Note: strftime('%H') works perfectly in SQLite to extract the hour
    results = db.session.query(
        func.strftime('%H', AccessLog.timestamp).label('hour'),
        func.count(AccessLog.id).label('count')
    ).group_by('hour').all()
    
    for row in results:
        try:
            hour_int = int(row.hour)
            hourly_counts[hour_int] = row.count
        except (ValueError, TypeError):
            pass
            
    # Format hourly_counts for Recharts frontend: [{"hour": 0, "count": X}, ...]
    peak_hours = [{"hour": h, "count": hourly_counts[h]} for h in range(24)]
    
    # 6. Longest consecutive fail streak (all-time)
    # Fetch all logs in chronological order to calculate the consecutive failure streak
    logs = AccessLog.query.order_by(AccessLog.timestamp.asc()).all()
    max_streak = 0
    current_streak = 0
    
    for log in logs:
        if log.status in ('FAIL_PIN', 'FAIL_FP', 'LOCKOUT'):
            current_streak += 1
            if current_streak > max_streak:
                max_streak = current_streak
        elif log.status == 'SUCCESS':
            current_streak = 0
            
    return jsonify({
        'total_today': total_today,
        'successes': successes,
        'failures': failures,
        'lockouts': lockouts,
        'peak_hours': peak_hours,
        'streak': max_streak
    })
