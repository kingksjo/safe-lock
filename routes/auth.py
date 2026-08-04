"""SafeLock dashboard authentication (server-side).

The admin password is PREBUILT — chosen by the operator, seeded as a salted
PBKDF2 hash in `admin_auth`, and never set/reset by the admin in-app. This
module verifies it on the server and issues short-lived session tokens that
the dashboard must present when dispatching admin commands.

Token store is in-memory: restarting the server invalidates all sessions,
which is consistent with the dashboard's in-memory (non-persisted) session.
"""
import functools
import secrets
import time

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash

from database import db
from models import AdminAuth

auth_bp = Blueprint('auth', __name__)

TOKEN_TTL_SECONDS = 15 * 60
_active_tokens = {}  # token -> expiry (unix timestamp)


def _create_token():
    token = secrets.token_urlsafe(32)
    _active_tokens[token] = time.time() + TOKEN_TTL_SECONDS
    return token


def _token_valid(token):
    if not token:
        return False
    expiry = _active_tokens.get(token)
    if expiry is None:
        return False
    if time.time() > expiry:
        _active_tokens.pop(token, None)
        return False
    return True


def require_token(f):
    """Decorator: reject requests without a valid X-Session-Token header."""
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        token = request.headers.get('X-Session-Token', '')
        if not _token_valid(token):
            return jsonify({'error': 'unauthorized'}), 401
        return f(*args, **kwargs)
    return wrapper


def seed_default_admin():
    """Create the prebuilt admin password hash if none exists yet."""
    if AdminAuth.query.order_by(AdminAuth.id).first() is None:
        from config import DEFAULT_ADMIN_PASSWORD
        from werkzeug.security import generate_password_hash
        db.session.add(AdminAuth(password_hash=generate_password_hash(DEFAULT_ADMIN_PASSWORD)))
        db.session.commit()


@auth_bp.route('/api/auth/verify', methods=['POST'])
def verify_password():
    """Verify the admin password against the stored hash.

    Body: {"password": "..."}
    Success -> 200 {"status": "ok", "token": "<session token>"}
    Failure -> 401 {"error": "invalid password"}
    """
    data = request.get_json(silent=True) or {}
    password = data.get('password', '')
    auth_row = AdminAuth.query.order_by(AdminAuth.id).first()
    if auth_row and check_password_hash(auth_row.password_hash, password):
        return jsonify({'status': 'ok', 'token': _create_token()}), 200
    return jsonify({'error': 'invalid password'}), 401


@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    """Invalidate the presented session token (called on manual lock)."""
    token = request.headers.get('X-Session-Token', '')
    _active_tokens.pop(token, None)
    return jsonify({'status': 'ok'}), 200
