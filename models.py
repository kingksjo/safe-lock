import datetime
from database import db

def _get_utc_now():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

class Image(db.Model):
    __tablename__ = 'images'

    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    filepath = db.Column(db.String(255), nullable=False)
    captured_at = db.Column(db.DateTime, default=_get_utc_now, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'filepath': self.filepath,
            'captured_at': (self.captured_at.isoformat() + 'Z') if self.captured_at else None
        }


class AccessLog(db.Model):
    __tablename__ = 'access_logs'

    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=_get_utc_now, nullable=False)
    status = db.Column(db.String(50), nullable=False)  # SUCCESS, FAIL_PIN, FAIL_FP, LOCKOUT, KEYPAD_TOUCH
    pin_attempts = db.Column(db.Integer, default=0, nullable=False)
    fp_attempts = db.Column(db.Integer, default=0, nullable=False)
    fp_slot_id = db.Column(db.Integer, nullable=True)
    image_id = db.Column(db.Integer, db.ForeignKey('images.id'), nullable=True)

    # Relationship to image
    image = db.relationship('Image', backref=db.backref('access_log', uselist=False))

    def to_dict(self):
        user_name = None
        user_role = None
        if self.fp_slot_id is not None and self.fp_slot_id > 0:
            u = BiometricUser.query.filter_by(slot_id=self.fp_slot_id).first()
            if u:
                user_name = u.name
                user_role = u.role
            else:
                user_name = f"Slot #{self.fp_slot_id}"
        elif self.fp_slot_id == 0:
            user_name = "Remote / Bypass"
            
        return {
            'id': self.id,
            'timestamp': (self.timestamp.isoformat() + 'Z') if self.timestamp else None,
            'status': self.status,
            'pin_attempts': self.pin_attempts,
            'fp_attempts': self.fp_attempts,
            'fp_slot_id': self.fp_slot_id,
            'user_name': user_name,
            'user_role': user_role,
            'image_id': self.image_id,
            'image': self.image.to_dict() if self.image else None
        }


class Command(db.Model):
    __tablename__ = 'commands'

    id = db.Column(db.Integer, primary_key=True)
    command_type = db.Column(db.String(20), nullable=False)  # LOCKOUT, UNLOCK, ENROLL, UNENROLL, RESET, PIN_RESET
    payload = db.Column(db.String(255), nullable=True)        # Slot ID or other payload data
    status = db.Column(db.String(20), default='PENDING', nullable=False) # PENDING, RELAYED, ACKNOWLEDGED, DONE, FAILED
    created_at = db.Column(db.DateTime, default=_get_utc_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=_get_utc_now, onupdate=_get_utc_now, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'command_type': self.command_type,
            'payload': self.payload,
            'status': self.status,
            'created_at': (self.created_at.isoformat() + 'Z') if self.created_at else None,
            'updated_at': (self.updated_at.isoformat() + 'Z') if self.updated_at else None
        }


class AdminAuth(db.Model):
    __tablename__ = 'admin_auth'

    id = db.Column(db.Integer, primary_key=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=_get_utc_now, nullable=False)


class BiometricUser(db.Model):
    __tablename__ = 'biometric_users'

    id = db.Column(db.Integer, primary_key=True)
    slot_id = db.Column(db.Integer, unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), default='Member', nullable=False)
    created_at = db.Column(db.DateTime, default=_get_utc_now, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'slot_id': self.slot_id,
            'name': self.name,
            'role': self.role,
            'created_at': (self.created_at.isoformat() + 'Z') if self.created_at else None
        }

