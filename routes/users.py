import datetime
from flask import Blueprint, request, jsonify
from database import db
from models import BiometricUser, AccessLog, Command
from routes.commands import queue_command

users_bp = Blueprint('users', __name__)

@users_bp.route('/api/users', methods=['GET'])
def get_users():
    """
    Returns all known biometric users and slots.
    Merges records from the biometric_users table with any existing slots
    found in completed ENROLL commands or access logs.
    """
    users_by_slot = {}
    
    # 1. Load explicit entries from BiometricUser table
    for u in BiometricUser.query.order_by(BiometricUser.slot_id.asc()).all():
        users_by_slot[u.slot_id] = u.to_dict()
        
    # 2. Check for completed ENROLL commands that might not have a name yet
    enrolled_cmds = Command.query.filter(
        Command.command_type == 'ENROLL',
        Command.status == 'DONE'
    ).all()
    for cmd in enrolled_cmds:
        if cmd.payload:
            try:
                slot = int(cmd.payload)
                if slot > 0 and slot not in users_by_slot:
                    users_by_slot[slot] = {
                        'id': None,
                        'slot_id': slot,
                        'name': f"Slot #{slot}",
                        'role': 'Member',
                        'created_at': (cmd.created_at.isoformat() + 'Z') if cmd.created_at else None
                    }
            except ValueError:
                pass
                
    # 3. Check for slots in AccessLog that might not have a name yet
    logged_slots = db.session.query(AccessLog.fp_slot_id).filter(
        AccessLog.fp_slot_id.isnot(None),
        AccessLog.fp_slot_id > 0
    ).distinct().all()
    for row in logged_slots:
        slot = row[0]
        if slot not in users_by_slot:
            users_by_slot[slot] = {
                'id': None,
                'slot_id': slot,
                'name': f"Slot #{slot}",
                'role': 'Member',
                'created_at': None
            }
            
    # 4. Subtract slots where the most-recent ENROLL/UNENROLL command is a DONE UNENROLL.
    #    This prevents physically unenrolled slots from reappearing via stale AccessLog or
    #    DONE ENROLL rows even after the BiometricUser row was deleted.
    slot_commands = Command.query.filter(
        Command.command_type.in_(['ENROLL', 'UNENROLL'])
    ).order_by(Command.created_at.desc()).all()

    decided_slots: set = set()
    for cmd in slot_commands:
        if not cmd.payload:
            continue
        try:
            slot = int(cmd.payload)
        except ValueError:
            continue
        if slot in decided_slots:
            continue
        decided_slots.add(slot)
        if cmd.command_type == 'UNENROLL' and cmd.status == 'DONE':
            users_by_slot.pop(slot, None)

    # Return sorted list by slot_id
    sorted_users = sorted(users_by_slot.values(), key=lambda x: x['slot_id'])
    return jsonify(sorted_users), 200


@users_bp.route('/api/users', methods=['POST'])
def create_or_update_user():
    """
    Manually attach a name and role to a slot ID.
    """
    data = request.get_json(silent=True) or {}
    slot_id = data.get('slot_id') or data.get('slotId')
    raw_name = data.get('name', '').strip()
    role = data.get('role', 'Member')
    
    if slot_id is None:
        return jsonify({'error': 'slot_id is required'}), 400
    if not raw_name:
        return jsonify({'error': 'name is required'}), 400
    if len(raw_name) > 10:
        return jsonify({'error': 'Name must be 10 characters or less to fit on the safe LCD'}), 400
    name = raw_name[:10]
        
    try:
        slot_id = int(slot_id)
    except ValueError:
        return jsonify({'error': 'slot_id must be an integer'}), 400
        
    user = BiometricUser.query.filter_by(slot_id=slot_id).first()
    if user:
        user.name = name
        user.role = role
    else:
        user = BiometricUser(slot_id=slot_id, name=name, role=role)
        db.session.add(user)
        
    db.session.commit()
    return jsonify(user.to_dict()), 201


@users_bp.route('/api/users/<int:slot_id>', methods=['PUT', 'PATCH'])
def update_user(slot_id):
    """
    Update the name or role for an existing slot ID.
    """
    data = request.get_json(silent=True) or {}
    name = data.get('name')
    role = data.get('role')
    
    if name is not None:
        raw_name = name.strip()
        if len(raw_name) > 10:
            return jsonify({'error': 'Name must be 10 characters or less to fit on the safe LCD'}), 400
        name = raw_name[:10]
    
    user = BiometricUser.query.filter_by(slot_id=slot_id).first()
    if not user:
        # Create it if it wasn't explicitly saved yet
        user = BiometricUser(slot_id=slot_id, name=name or f"Slot #{slot_id}", role=role or 'Member')
        db.session.add(user)
    else:
        if name is not None:
            user.name = name
        if role is not None:
            user.role = role.strip()
            
    db.session.commit()
    return jsonify(user.to_dict()), 200


@users_bp.route('/api/users/<int:slot_id>', methods=['DELETE'])
def delete_user(slot_id):
    """
    Delete a user mapping and optionally trigger physical unenrollment on the device sensor.
    """
    unenroll = request.args.get('unenroll', 'false').lower() == 'true'
    
    BiometricUser.query.filter_by(slot_id=slot_id).delete()
    db.session.commit()
    
    if unenroll:
        queue_command('UNENROLL', payload=str(slot_id))
        
    return jsonify({'status': 'ok', 'slot_id': slot_id}), 200
