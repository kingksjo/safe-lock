import os
import uuid
import datetime
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from database import db
from models import Image, AccessLog
from tracker import update_last_seen

images_bp = Blueprint('images', __name__)

@images_bp.route('/api/image', methods=['POST'])
@images_bp.route('/upload', methods=['POST'])
def upload_image():
    # Generate a unique secure filename
    timestamp = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).strftime('%Y%m%d_%H%M%S')
    unique_suffix = uuid.uuid4().hex[:8]
    upload_folder = current_app.config['UPLOAD_FOLDER']
    os.makedirs(upload_folder, exist_ok=True)
    
    file = request.files.get('image') or request.files.get('file')
    if file and file.filename != '':
        ext = os.path.splitext(file.filename)[1] or '.jpg'
        filename = f"img_{timestamp}_{unique_suffix}{ext}"
        local_disk_path = os.path.join(upload_folder, filename)
        file.save(local_disk_path)
    elif request.data:
        # ESP32-CAM sending raw JPEG stream directly
        x_image_id = request.headers.get('X-Image-ID', '')
        prefix = f"cam_{x_image_id}_" if x_image_id else "img_"
        filename = f"{prefix}{timestamp}_{unique_suffix}.jpg"
        local_disk_path = os.path.join(upload_folder, filename)
        with open(local_disk_path, 'wb') as f:
            f.write(request.data)
    else:
        return jsonify({'error': 'No image file or raw data provided in the request'}), 400
        
    # Relative web path for React dashboard
    web_filepath = f"/images/{filename}"
    
    # Create the Image record
    image_record = Image(
        filename=filename,
        filepath=web_filepath,
        captured_at=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    )
    
    db.session.add(image_record)
    db.session.flush() # Flush to get the ID before committing
    
    # Check if a log_id is provided to associate this image
    log_id = request.form.get('log_id', type=int) or request.args.get('log_id', type=int)
    log_record = None
    if log_id:
        log_record = db.session.get(AccessLog, log_id)
        if log_record:
            log_record.image_id = image_record.id
    else:
        # Automatically create an AccessLog entry for KEYPAD_TOUCH when camera triggers upon keypad use
        log_record = AccessLog(
            status='KEYPAD_TOUCH',
            pin_attempts=0,
            fp_attempts=0,
            fp_slot_id=None,
            image_id=image_record.id,
            timestamp=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        )
        db.session.add(log_record)
        db.session.flush()
            
    db.session.commit()
    
    # Update device activity
    update_last_seen()
    
    # Must return 200 OK so ESP32-CAM (kola_ice_cam_project.ino) sees httpResponseCode == 200
    return jsonify({
        'status': 'ok',
        'image_id': image_record.id,
        'log_id': log_record.id if log_record else None,
        'filepath': web_filepath
    }), 200


@images_bp.route('/api/images/<int:image_id>', methods=['GET'])
def get_image(image_id):
    image_record = db.session.get(Image, image_id)
    if not image_record:
        return jsonify({'error': 'Image record not found'}), 404
        
    upload_folder = current_app.config['UPLOAD_FOLDER']
    return send_from_directory(upload_folder, image_record.filename)


@images_bp.route('/images/<path:filename>', methods=['GET'])
def serve_image_file(filename):
    upload_folder = current_app.config['UPLOAD_FOLDER']
    return send_from_directory(upload_folder, filename)
