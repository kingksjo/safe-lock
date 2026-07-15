import datetime
from flask import Blueprint, request, jsonify
from database import db
from models import Command, AccessLog
from tracker import update_last_seen
from ws_manager import broadcast_command

commands_bp = Blueprint('commands', __name__)

@commands_bp.route('/api/commands/pending', methods=['GET'])
def get_pending_command():
    # Update device activity on every poll
    update_last_seen()
    
    # Get oldest PENDING command
    command = Command.query.filter(Command.status == 'PENDING').order_by(Command.created_at.asc()).first()
    
    if not command:
        return jsonify(None) # Returns JSON literal null
        
    return jsonify(command.to_dict())


@commands_bp.route('/api/commands/<int:cmd_id>/status', methods=['PATCH'])
def update_command_status(cmd_id):
    # Update device activity
    update_last_seen()
    
    command = db.session.get(Command, cmd_id)
    if not command:
        return jsonify({'error': 'Command not found'}), 404
        
    data = request.get_json() or {}
    new_status = data.get('status')
    
    valid_statuses = {'PENDING', 'RELAYED', 'ACKNOWLEDGED', 'DONE', 'FAILED'}
    if not new_status or new_status not in valid_statuses:
        return jsonify({'error': f'Invalid status. Must be one of {valid_statuses}'}), 400
        
    command.status = new_status
    command.updated_at = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    
    db.session.commit()
    
    return jsonify({'status': 'ok'})


@commands_bp.route('/api/commands', methods=['GET'])
def get_commands():
    # Returns full command history (most recent first)
    commands = Command.query.order_by(Command.created_at.desc()).all()
    return jsonify([cmd.to_dict() for cmd in commands])


def get_next_available_slot():
    # Find all slot IDs that are currently occupied
    # 1. Enrolled slots from completed ENROLL commands
    enrolled_cmds = Command.query.filter(
        Command.command_type == 'ENROLL',
        Command.status == 'DONE'
    ).all()
    enrolled_slots = set()
    for cmd in enrolled_cmds:
        if cmd.payload:
            try:
                enrolled_slots.add(int(cmd.payload))
            except ValueError:
                pass

    # 2. Slots that have logged successful access
    logged_slots = db.session.query(AccessLog.fp_slot_id).filter(
        AccessLog.fp_slot_id.isnot(None)
    ).distinct().all()
    for row in logged_slots:
        enrolled_slots.add(row[0])

    # 3. Exclude slots that have been successfully unenrolled
    unenrolled_cmds = Command.query.filter(
        Command.command_type == 'UNENROLL',
        Command.status == 'DONE'
    ).all()
    for cmd in unenrolled_cmds:
        if cmd.payload:
            try:
                enrolled_slots.discard(int(cmd.payload))
            except ValueError:
                pass

    # Find first slot in 1..127 that is not in enrolled_slots
    for slot in range(1, 128):
        if slot not in enrolled_slots:
            return slot
    return 1 # Default fallback if error or empty


# POST endpoints to queue commands (from Admin Dashboard)

def queue_command(command_type, payload=None):
    # Dynamically allocate slot_id for ENROLL
    if command_type == 'ENROLL' and payload is None:
        slot_id = get_next_available_slot()
        payload = str(slot_id)

    command = Command(
        command_type=command_type,
        payload=payload,
        status='PENDING'
    )
    db.session.add(command)
    db.session.commit()
    
    # Broadcast to ESP32 Brain via WebSocket (/ws) right away
    if command_type == 'UNLOCK':
        broadcast_command({"command": "UNLOCK"})
        log = AccessLog(
            status='SUCCESS',
            pin_attempts=0,
            fp_attempts=0,
            fp_slot_id=0,
            timestamp=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        )
        db.session.add(log)
        command.status = 'RELAYED'
        db.session.commit()
    elif command_type == 'LOCKOUT':
        broadcast_command({"command": "LOCKDOWN"}) # lockdown
        log = AccessLog(
            status='LOCKOUT',
            pin_attempts=0,
            fp_attempts=0,
            fp_slot_id=None,
            timestamp=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        )
        db.session.add(log)
        command.status = 'RELAYED'
        db.session.commit()
    elif command_type == 'PIN_RESET' and payload:
        broadcast_command({"command": "RESET_PIN", "pin": str(payload)})
        command.status = 'RELAYED'
        db.session.commit()
    elif command_type == 'ENROLL' and payload:
        broadcast_command({"command": "ENROLL_FINGER", "id": int(payload)})
        command.status = 'RELAYED'
        db.session.commit()
    elif command_type == 'UNENROLL' and payload:
        broadcast_command({"command": "DELETE_FINGER", "id": int(payload)})
        command.status = 'RELAYED'
        db.session.commit()
        
    return command.to_dict()


@commands_bp.route('/api/commands/lockout', methods=['POST'])
def queue_lockout():
    cmd_dict = queue_command('LOCKOUT')
    return jsonify(cmd_dict), 201


@commands_bp.route('/api/commands/unlock', methods=['POST'])
def queue_unlock():
    cmd_dict = queue_command('UNLOCK')
    return jsonify(cmd_dict), 201


@commands_bp.route('/api/commands/enroll', methods=['POST'])
def queue_enroll():
    cmd_dict = queue_command('ENROLL')
    return jsonify(cmd_dict), 201


@commands_bp.route('/api/commands/unenroll', methods=['POST'])
def queue_unenroll():
    data = request.get_json() or {}
    slot_id = data.get('slot_id') or data.get('slotId') or request.form.get('slot_id')
    
    if slot_id is None:
        return jsonify({'error': 'slot_id is required for unenroll command'}), 400
        
    cmd_dict = queue_command('UNENROLL', payload=str(slot_id))
    return jsonify(cmd_dict), 201


@commands_bp.route('/api/commands/reset', methods=['POST'])
def queue_reset():
    cmd_dict = queue_command('RESET')
    return jsonify(cmd_dict), 201


@commands_bp.route('/api/commands/pin_reset', methods=['POST'])
def queue_pin_reset():
    data = request.get_json() or {}
    pin = data.get('pin') or data.get('payload')
    
    if not pin:
        return jsonify({'error': 'pin is required'}), 400
        
    if len(pin) != 4 or not pin.isdigit():
        return jsonify({'error': 'PIN must be exactly 4 digits'}), 400
        
    cmd_dict = queue_command('PIN_RESET', payload=pin)
    return jsonify(cmd_dict), 201

