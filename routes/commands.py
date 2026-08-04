import datetime
from flask import Blueprint, request, jsonify
from database import db
from models import Command, AccessLog, BiometricUser
from tracker import update_last_seen
from ws_manager import broadcast_command
from routes.auth import require_token, _token_valid

commands_bp = Blueprint('commands', __name__)

@commands_bp.route('/api/commands/pending', methods=['GET'])
def get_pending_command():
    # Update device activity on every poll
    update_last_seen()
    
    # Get oldest PENDING command (id ASC breaks created_at ties deterministically)
    command = Command.query.filter(Command.status == 'PENDING').order_by(
        Command.created_at.asc(), Command.id.asc()
    ).first()
    
    if not command:
        return jsonify(None) # Returns JSON literal null
        
    return jsonify(command.to_dict())


@commands_bp.route('/api/commands/<int:cmd_id>/status', methods=['PATCH'])
def update_command_status(cmd_id):
    data = request.get_json() or {}
    status = data.get('status')
    
    if status not in ['PENDING', 'RELAYED', 'ACKNOWLEDGED', 'DONE', 'FAILED']:
        return jsonify({'error': 'Invalid status'}), 400
    
    # Browser-initiated cancellation (FAILED) requires a dashboard session token.
    # Device-driven status transitions (RELAYED/ACKNOWLEDGED/DONE) stay open so
    # the ESP32 can report command progress without holding a password.
    if status == 'FAILED' and not _token_valid(request.headers.get('X-Session-Token', '')):
        return jsonify({'error': 'unauthorized'}), 401
            
    command = db.session.get(Command, cmd_id)
    if not command:
        return jsonify({'error': 'Command not found'}), 404
        
    command.status = status
    
    # If the ESP32 CAM updates an ENROLL command to DONE, ensure the BiometricUser stays
    # If it fails, clean up the BiometricUser entry if it was tentative
    if command.command_type == 'ENROLL' and status == 'FAILED' and command.payload:
        try:
            BiometricUser.query.filter_by(slot_id=int(command.payload)).delete()
        except ValueError:
            pass
    elif command.command_type == 'UNENROLL' and status == 'DONE' and command.payload:
        try:
            BiometricUser.query.filter_by(slot_id=int(command.payload)).delete()
        except ValueError:
            pass

    db.session.commit()
    return jsonify({'status': 'ok'})


@commands_bp.route('/api/commands', methods=['GET'])
def list_commands():
    # Returns full command history (most recent first).
    # id DESC breaks created_at ties deterministically (same-clock-tick inserts).
    commands = Command.query.order_by(Command.created_at.desc(), Command.id.desc()).all()
    return jsonify([cmd.to_dict() for cmd in commands])


def get_next_available_slot():
    """Find the lowest slot ID (1–127) not currently occupied on the sensor."""
    occupied = set()

    # 1. For each slot that has ENROLL or UNENROLL commands, check the MOST RECENT one.
    #    If the most recent command is a non-failed ENROLL → occupied.
    #    If the most recent command is a DONE UNENROLL → free.
    slot_commands = Command.query.filter(
        Command.command_type.in_(['ENROLL', 'UNENROLL'])
    ).order_by(Command.created_at.desc()).all()

    decided_slots = set()  # slots we've already resolved
    for cmd in slot_commands:
        if not cmd.payload:
            continue
        try:
            slot = int(cmd.payload)
        except ValueError:
            continue
        if slot in decided_slots:
            continue  # already resolved by a more recent command
        decided_slots.add(slot)

        if cmd.command_type == 'ENROLL' and cmd.status != 'FAILED':
            occupied.add(slot)
        # If UNENROLL DONE → slot is free (don't add to occupied)
        # If UNENROLL not DONE → treat slot as still occupied (unenroll hasn't completed)
        elif cmd.command_type == 'UNENROLL' and cmd.status != 'DONE':
            occupied.add(slot)

    # 2. Slots with successful access logs (sensor has a print we may not know about)
    logged_slots = db.session.query(AccessLog.fp_slot_id).filter(
        AccessLog.fp_slot_id.isnot(None),
        AccessLog.fp_slot_id > 0
    ).distinct().all()
    for (slot,) in logged_slots:
        if slot not in decided_slots:
            occupied.add(slot)

    # 3. Slots saved in BiometricUser table
    for u in BiometricUser.query.all():
        if u.slot_id not in decided_slots:
            occupied.add(u.slot_id)

    # Find first slot in 1..127 that is not occupied
    for slot in range(1, 128):
        if slot not in occupied:
            return slot
    return 1  # fallback


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
    elif command_type == 'RESET':
        broadcast_command({"command": "UNLOCKDOWN"})
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
@require_token
def queue_lockout():
    cmd_dict = queue_command('LOCKOUT')
    return jsonify(cmd_dict), 201


@commands_bp.route('/api/commands/unlock', methods=['POST'])
@require_token
def queue_unlock():
    cmd_dict = queue_command('UNLOCK')
    return jsonify(cmd_dict), 201


@commands_bp.route('/api/commands/enroll', methods=['POST'])
@require_token
def queue_enroll():
    data = request.get_json(silent=True) or {}
    raw_name = data.get('name', '').strip()
    if len(raw_name) > 10:
        return jsonify({'error': 'Name must be 10 characters or less to fit on the safe LCD'}), 400
    name = raw_name[:10]
    role = data.get('role', 'Member')
    slot_id_arg = data.get('slot_id') or data.get('slotId')
    payload = str(slot_id_arg) if slot_id_arg is not None else None
    
    cmd_dict = queue_command('ENROLL', payload=payload)
    
    # If a name was passed (or we allocated a slot), register the user right now
    if name and cmd_dict.get('payload'):
        try:
            allocated_slot = int(cmd_dict['payload'])
            existing = BiometricUser.query.filter_by(slot_id=allocated_slot).first()
            if existing:
                existing.name = name
                existing.role = role
            else:
                db.session.add(BiometricUser(slot_id=allocated_slot, name=name, role=role))
            db.session.commit()
        except Exception:
            db.session.rollback()
            
    return jsonify(cmd_dict), 201


@commands_bp.route('/api/commands/unenroll', methods=['POST'])
@require_token
def queue_unenroll():
    data = request.get_json() or {}
    slot_id = data.get('slot_id') or data.get('slotId') or request.form.get('slot_id')
    
    if slot_id is None:
        return jsonify({'error': 'slot_id is required for unenroll command'}), 400
        
    cmd_dict = queue_command('UNENROLL', payload=str(slot_id))
    return jsonify(cmd_dict), 201


@commands_bp.route('/api/commands/reset', methods=['POST'])
@require_token
def queue_reset():
    cmd_dict = queue_command('RESET')
    return jsonify(cmd_dict), 201


@commands_bp.route('/api/commands/pin_reset', methods=['POST'])
@require_token
def queue_pin_reset():
    data = request.get_json() or {}
    pin = data.get('pin') or data.get('payload')
    
    if not pin:
        return jsonify({'error': 'pin is required'}), 400
        
    if len(pin) != 4 or not pin.isdigit():
        return jsonify({'error': 'PIN must be exactly 4 digits'}), 400
        
    cmd_dict = queue_command('PIN_RESET', payload=pin)
    return jsonify(cmd_dict), 201

