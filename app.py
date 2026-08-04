import os
import sys
from flask import Flask, request, send_from_directory
from flask_cors import CORS
from database import db

# Import Blueprints
from routes.device import device_bp
from routes.logs import logs_bp
from routes.images import images_bp
from routes.commands import commands_bp
from routes.stats import stats_bp
from routes.users import users_bp
from routes.auth import auth_bp, seed_default_admin
from ws_manager import init_websocket

def resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller."""
    if getattr(sys, 'frozen', False):
        base_path = getattr(sys, '_MEIPASS', os.path.abspath(os.path.dirname(__file__)))
    else:
        base_path = os.path.abspath(os.path.dirname(__file__))
    return os.path.join(base_path, relative_path)

def data_dir():
    """Get path to persistent data directory (safe.db, images)."""
    if getattr(sys, 'frozen', False):
        local_app_data = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
        target_dir = os.path.join(local_app_data, 'SafeLock')
    else:
        target_dir = os.path.abspath(os.path.dirname(__file__))
    os.makedirs(target_dir, exist_ok=True)
    return target_dir

def create_app(config_override=None):
    # Initialize Flask app
    # Set static_folder to bundled static folder and static_url_path to '' to serve React build files
    app = Flask(__name__, static_folder=resource_path('static'), static_url_path='')
    
    # Configure SQLite database
    # Points to safe.db in data_dir()
    db_path = os.path.join(data_dir(), 'safe.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{db_path}"
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Configure upload folder for physical camera images
    app.config['UPLOAD_FOLDER'] = os.path.join(data_dir(), 'images')
    
    # Apply config overrides if provided (useful for testing)
    if config_override:
        app.config.update(config_override)
        
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Enable CORS to allow React dev server access and custom image headers
    CORS(app, expose_headers=['X-Image-ID'])
    
    # Initialize SQLAlchemy database instance
    db.init_app(app)
    
    # Register blueprints
    app.register_blueprint(device_bp)
    app.register_blueprint(logs_bp)
    app.register_blueprint(images_bp)
    app.register_blueprint(commands_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(auth_bp)
    
    # Initialize WebSocket endpoint /ws for ESP32 Brain
    init_websocket(app)
    
    # Create database tables inside application context
    with app.app_context():
        db.create_all()
        # Seed the prebuilt admin password on first run (no reset from UI)
        seed_default_admin()
        # Mark in-flight commands from a previous session as failed so the queue
        # starts clean. Stale ENROLL commands in particular would otherwise make
        # the dashboard immediately show "waiting for physical scan" on startup.
        from models import Command
        stale = Command.query.filter(Command.status.in_(['PENDING', 'RELAYED', 'ACKNOWLEDGED'])).all()
        for cmd in stale:
            cmd.status = 'FAILED'
        if stale:
            db.session.commit()
        
    # Catch-all route to serve compiled React application
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_react(path):
        if path.startswith('api'):
            return {"error": "not found"}, 404
            
        # If the requested path exists as a static file, serve it
        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
            
        # Otherwise, fall back to index.html for React router
        # Ensure static folder and index.html exist
        os.makedirs(app.static_folder, exist_ok=True)
        index_path = os.path.join(app.static_folder, 'index.html')
        if not os.path.exists(index_path):
            # Create a simple placeholder index.html if not already present
            with open(index_path, 'w', encoding='utf-8') as f:
                f.write("""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SafeLock Admin Panel</title>
    <style>
        body {
            background-color: #0b0f19;
            color: #f3f4f6;
            font-family: system-ui, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .container {
            text-align: center;
            border: 1px solid #1e293b;
            padding: 3rem;
            border-radius: 12px;
            background: rgba(17, 24, 39, 0.7);
            backdrop-filter: blur(10px);
        }
        h1 { margin-bottom: 0.5rem; color: #3b82f6; }
        p { color: #9ca3af; }
    </style>
</head>
<body>
    <div class="container">
        <h1>SafeLock Dashboard</h1>
        <p>Production frontend assets pending. Run frontend build to deploy.</p>
    </div>
</body>
</html>""")
        return send_from_directory(app.static_folder, 'index.html')

    # Fallback for SPA deep links: Flask's built-in static route shadows the
    # catch-all above for paths that don't match an existing file, raising a
    # 404 before serve_react runs. Serve index.html for non-API GET misses.
    @app.errorhandler(404)
    def serve_react_fallback(e):
        if request.method == 'GET' and not request.path.startswith('/api'):
            index_path = os.path.join(app.static_folder, 'index.html')
            if os.path.exists(index_path):
                return send_from_directory(app.static_folder, 'index.html')
        return {"error": "not found"}, 404

    return app

if __name__ == '__main__':
    app = create_app()
    # Run server on port 5000
    is_frozen = getattr(sys, 'frozen', False)
    app.run(host='0.0.0.0', port=5000, debug=not is_frozen, use_reloader=not is_frozen)
