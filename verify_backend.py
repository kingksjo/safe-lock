import os
import sys
import unittest
import json
import datetime
import io

# Add workspace root to system path so we can import our modules
workspace_dir = r"c:\Users\Kamiye\Desktop\safe-lock"
if workspace_dir not in sys.path:
    sys.path.insert(0, workspace_dir)

from app import create_app
from database import db
from models import Image, AccessLog, Command
import tracker

class TestSafeLockBackend(unittest.TestCase):
    def setUp(self):
        # Configure app for testing
        self.app = create_app()
        # Override database to be in-memory for fast and clean unit testing
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.app.config['TESTING'] = True
        self.app.config['UPLOAD_FOLDER'] = os.path.join(workspace_dir, 'images_test')
        os.makedirs(self.app.config['UPLOAD_FOLDER'], exist_ok=True)
        
        self.client = self.app.test_client()
        
        # Initialize database tables
        with self.app.app_context():
            db.create_all()
            
        # Reset tracker
        tracker._last_seen = None

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        # Clean up images_test folder
        if os.path.exists(self.app.config['UPLOAD_FOLDER']):
            for f in os.listdir(self.app.config['UPLOAD_FOLDER']):
                os.remove(os.path.join(self.app.config['UPLOAD_FOLDER'], f))
            os.rmdir(self.app.config['UPLOAD_FOLDER'])

    def test_device_status_initially_offline(self):
        """Verify device starts offline and no last seen."""
        response = self.client.get('/api/device/status')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIsNone(data['last_seen'])
        self.assertEqual(data['status'], 'offline')

    def test_device_status_online_after_activity(self):
        """Verify device reports online immediately after updating last seen."""
        tracker.update_last_seen()
        response = self.client.get('/api/device/status')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIsNotNone(data['last_seen'])
        self.assertEqual(data['status'], 'online')

    def test_device_status_lockout(self):
        """Verify dynamic lockout status detection."""
        # Create a lockout log entry
        with self.app.app_context():
            log = AccessLog(status='LOCKOUT', timestamp=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None))
            db.session.add(log)
            db.session.commit()
            
        response = self.client.get('/api/device/status')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['status'], 'locked_out')

    def test_create_log(self):
        """Verify access log creation endpoint."""
        payload = {
            'status': 'FAIL_PIN',
            'pin_attempts': 2,
            'fp_attempts': 0
        }
        response = self.client.post('/api/log', json=payload)
        self.assertEqual(response.status_code, 201)
        data = json.loads(response.data)
        self.assertEqual(data['status'], 'ok')
        self.assertIn('log_id', data)
        
        # Verify stored in DB
        with self.app.app_context():
            log = db.session.get(AccessLog, data['log_id'])
            self.assertIsNotNone(log)
            self.assertEqual(log.status, 'FAIL_PIN')
            self.assertEqual(log.pin_attempts, 2)
            self.assertEqual(log.fp_attempts, 0)
            
        # Verify last seen was updated
        self.assertIsNotNone(tracker.get_last_seen())

    def test_get_logs_pagination_and_filtering(self):
        """Verify logs query with status filters and paging."""
        with self.app.app_context():
            db.session.add(AccessLog(status='SUCCESS', pin_attempts=1))
            db.session.add(AccessLog(status='FAIL_FP', pin_attempts=1, fp_attempts=2))
            db.session.add(AccessLog(status='LOCKOUT', pin_attempts=1, fp_attempts=3))
            db.session.commit()
            
        # Get all logs
        response = self.client.get('/api/logs?page=1&per_page=2')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(len(data['data']), 2)
        self.assertEqual(data['total'], 3)
        self.assertEqual(data['pages'], 2)
        
        # Get with status filter
        response = self.client.get('/api/logs?status=LOCKOUT')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(len(data['data']), 1)
        self.assertEqual(data['data'][0]['status'], 'LOCKOUT')

    def test_image_upload_and_serve(self):
        """Verify image uploading, association with log, and serving."""
        # 1. Create a log first
        with self.app.app_context():
            log = AccessLog(status='SUCCESS')
            db.session.add(log)
            db.session.commit()
            log_id = log.id

        # 2. Upload image with log_id association
        image_data = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00' # basic mockup jpeg header
        response = self.client.post(
            '/api/image',
            data={
                'image': (io.BytesIO(image_data), 'test_camera_shot.jpg'),
                'log_id': log_id
            },
            content_type='multipart/form-data'
        )
        self.assertEqual(response.status_code, 201)
        data = json.loads(response.data)
        self.assertEqual(data['status'], 'ok')
        image_id = data['image_id']
        
        # Verify log association in DB
        with self.app.app_context():
            updated_log = db.session.get(AccessLog, log_id)
            self.assertEqual(updated_log.image_id, image_id)
            self.assertIsNotNone(updated_log.image)
            self.assertTrue(updated_log.image.filename.startswith('img_'))
            
        # Verify serving the image
        with self.client.get(f'/api/images/{image_id}') as response:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, image_data)

    def test_commands_workflow(self):
        """Verify queueing, status updates, and pending retrieval of commands."""
        # 1. Queue lockout command
        response = self.client.post('/api/commands/lockout')
        self.assertEqual(response.status_code, 201)
        cmd_data = json.loads(response.data)
        self.assertEqual(cmd_data['command_type'], 'LOCKOUT')
        self.assertEqual(cmd_data['status'], 'PENDING')
        cmd_id = cmd_data['id']
        
        # 2. Queue unenroll command with payload
        response = self.client.post('/api/commands/unenroll', json={'slot_id': 12})
        self.assertEqual(response.status_code, 201)
        unenroll_data = json.loads(response.data)
        self.assertEqual(unenroll_data['command_type'], 'UNENROLL')
        self.assertEqual(unenroll_data['payload'], '12')
        
        # 3. Retrieve oldest pending command
        response = self.client.get('/api/commands/pending')
        self.assertEqual(response.status_code, 200)
        pending_data = json.loads(response.data)
        self.assertEqual(pending_data['id'], cmd_id)
        self.assertEqual(pending_data['command_type'], 'LOCKOUT')
        
        # 4. Update command status to DONE
        response = self.client.patch(
            f'/api/commands/{cmd_id}/status',
            json={'status': 'DONE'}
        )
        self.assertEqual(response.status_code, 200)
        
        # Verify updated in DB
        with self.app.app_context():
            cmd = db.session.get(Command, cmd_id)
            self.assertEqual(cmd.status, 'DONE')
            
        # 5. Fetch commands queue history
        response = self.client.get('/api/commands')
        self.assertEqual(response.status_code, 200)
        history = json.loads(response.data)
        self.assertEqual(len(history), 2)
        # Should be sorted most recent first (so UNENROLL first, then LOCKOUT)
        self.assertEqual(history[0]['command_type'], 'UNENROLL')
        self.assertEqual(history[1]['command_type'], 'LOCKOUT')

    def test_pin_reset_command(self):
        """Verify validation and queueing of PIN_RESET command."""
        # 1. Invalid PIN: empty/missing
        response = self.client.post('/api/commands/pin_reset', json={})
        self.assertEqual(response.status_code, 400)
        
        # 2. Invalid PIN: too short
        response = self.client.post('/api/commands/pin_reset', json={'pin': '123'})
        self.assertEqual(response.status_code, 400)
        
        # 3. Invalid PIN: non-numeric
        response = self.client.post('/api/commands/pin_reset', json={'pin': '123a'})
        self.assertEqual(response.status_code, 400)
        
        # 4. Valid PIN
        response = self.client.post('/api/commands/pin_reset', json={'pin': '9876'})
        self.assertEqual(response.status_code, 201)
        data = json.loads(response.data)
        self.assertEqual(data['command_type'], 'PIN_RESET')
        self.assertEqual(data['payload'], '9876')
        self.assertEqual(data['status'], 'PENDING')
        cmd_id = data['id']
        
        # Verify stored in DB
        with self.app.app_context():
            cmd = db.session.get(Command, cmd_id)
            self.assertIsNotNone(cmd)
            self.assertEqual(cmd.command_type, 'PIN_RESET')
            self.assertEqual(cmd.payload, '9876')

    def test_analytics_stats(self):
        """Verify calculations of stats (total, failures, success, streaks, peak hours)."""
        # Create some access log history
        with self.app.app_context():
            # Time setup
            now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
            yesterday = now - datetime.timedelta(days=1, hours=2)
            
            # Yesterday: 1 FAIL_PIN
            db.session.add(AccessLog(status='FAIL_PIN', timestamp=yesterday))
            
            # Today: SUCCESS, FAIL_FP, LOCKOUT, SUCCESS
            db.session.add(AccessLog(status='SUCCESS', timestamp=now))
            db.session.add(AccessLog(status='FAIL_FP', timestamp=now))
            db.session.add(AccessLog(status='LOCKOUT', timestamp=now))
            db.session.add(AccessLog(status='SUCCESS', timestamp=now))
            
            db.session.commit()
            
        response = self.client.get('/api/stats')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        self.assertEqual(data['total_today'], 4) # Only the 4 from today
        self.assertEqual(data['successes'], 2)   # All time
        self.assertEqual(data['failures'], 3)    # All time: FAIL_PIN + FAIL_FP + LOCKOUT
        self.assertEqual(data['lockouts'], 1)    # All time
        
        # Streaks:
        # Yesterday: FAIL
        # Today: SUCCESS, FAIL, FAIL, SUCCESS
        # Max consecutive failure streak should be 2 (the FAIL_FP and LOCKOUT in a row before SUCCESS)
        # Wait, chronologically:
        # 1. Yesterday FAIL_PIN (streak = 1)
        # 2. Today SUCCESS (streak resets to 0)
        # 3. Today FAIL_FP (streak = 1)
        # 4. Today LOCKOUT (streak = 2)
        # 5. Today SUCCESS (streak resets to 0)
        # Max streak should be 2. Let's verify!
        self.assertEqual(data['streak'], 2)
        
        # Peak hours: should have counts in current hour
        current_hour = now.hour
        peak_hour_entry = next(item for item in data['peak_hours'] if item['hour'] == current_hour)
        self.assertEqual(peak_hour_entry['count'], 4)

if __name__ == '__main__':
    unittest.main()

