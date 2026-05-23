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
            'captured_at': self.captured_at.isoformat() if self.captured_at else None
        }


class AccessLog(db.Model):
    __tablename__ = 'access_logs'

    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=_get_utc_now, nullable=False)
    status = db.Column(db.String(20), nullable=False)  # SUCCESS, FAIL_PIN, FAIL_FP, LOCKOUT
    pin_attempts = db.Column(db.Integer, default=0, nullable=False)
    fp_attempts = db.Column(db.Integer, default=0, nullable=False)
    fp_slot_id = db.Column(db.Integer, nullable=True)
    image_id = db.Column(db.Integer, db.ForeignKey('images.id'), nullable=True)

    # Relationship to image
    image = db.relationship('Image', backref=db.backref('access_log', uselist=False))

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'status': self.status,
            'pin_attempts': self.pin_attempts,
            'fp_attempts': self.fp_attempts,
            'fp_slot_id': self.fp_slot_id,
            'image_id': self.image_id,
            'image': self.image.to_dict() if self.image else None
        }


class Command(db.Model):
    __tablename__ = 'commands'

    id = db.Column(db.Integer, primary_key=True)
    command_type = db.Column(db.String(20), nullable=False)  # LOCKOUT, UNLOCK, ENROLL, UNENROLL, RESET
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
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
