import os
import uuid
import datetime
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from database import db
from models import Image, AccessLog
from tracker import update_last_seen

images_bp = Blueprint('images', __name__)

@images_bp.route('/api/image', methods=['POST'])
def upload_image():
    # Retrieve file from request.files
    # Handle either 'image' or 'file' key
    file = request.files.get('image') or request.files.get('file')
    if not file:
        return jsonify({'error': 'No image file provided in the request'}), 400
        
    if file.filename == '':
        return jsonify({'error': 'No filename provided'}), 400
        
    # Generate a unique secure filename
    timestamp = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).strftime('%Y%m%d_%H%M%S')
    unique_suffix = uuid.uuid4().hex[:8]
    ext = os.path.splitext(file.filename)[1] or '.jpg'
    filename = f"img_{timestamp}_{unique_suffix}{ext}"
    
    # Save the file
    upload_folder = current_app.config['UPLOAD_FOLDER']
    # Ensure directory exists just in case
    os.makedirs(upload_folder, exist_ok=True)
    
    filepath = os.path.join(upload_folder, filename)
    file.save(filepath)
    
    # Create the Image record
    image_record = Image(
        filename=filename,
        filepath=filepath,
        captured_at=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    )
    
    db.session.add(image_record)
    db.session.flush() # Flush to get the ID before committing
    
    # Check if a log_id is provided to associate this image
    log_id = request.form.get('log_id', type=int) or request.args.get('log_id', type=int)
    if log_id:
        log = db.session.get(AccessLog, log_id)
        if log:
            log.image_id = image_record.id
            
    db.session.commit()
    
    # Update device activity
    update_last_seen()
    
    return jsonify({
        'status': 'ok',
        'image_id': image_record.id
    }), 201


@images_bp.route('/api/images/<int:image_id>', methods=['GET'])
def get_image(image_id):
    image_record = db.session.get(Image, image_id)
    if not image_record:
        return jsonify({'error': 'Image record not found'}), 404
        
    upload_folder = current_app.config['UPLOAD_FOLDER']
    return send_from_directory(upload_folder, image_record.filename)
