import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from database import db

# Import Blueprints
from routes.device import device_bp
from routes.logs import logs_bp
from routes.images import images_bp
from routes.commands import commands_bp
from routes.stats import stats_bp
from ws_manager import init_websocket

def create_app(config_override=None):
    # Initialize Flask app
    # Set static_folder to 'static' and static_url_path to '' to serve React build files
    app = Flask(__name__, static_folder='static', static_url_path='')
    
    # Configure SQLite database
    # Points to safe.db in the root folder
    base_dir = os.path.abspath(os.path.dirname(__file__))
    app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(base_dir, 'safe.db')}"
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Configure upload folder for physical camera images
    app.config['UPLOAD_FOLDER'] = os.path.join(base_dir, 'images')
    
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
    
    # Initialize WebSocket endpoint /ws for ESP32 Brain
    init_websocket(app)
    
    # Create database tables inside application context
    with app.app_context():
        db.create_all()
        
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
        
    return app

if __name__ == '__main__':
    app = create_app()
    # Run server on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
