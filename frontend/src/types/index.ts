/**
 * Image frame captured by the ESP32-CAM when the user initiates keypad entry (`IDLE -> PIN_ENTRY`).
 */
export interface Image {
  id: number;
  filename: string;
  filepath: string;
  captured_at: string;
}

/**
 * Audit log for an access attempt.
 * Note: Under the new firmware working principle, `image` and `image_id` represent the photo captured
 * at the moment the user first touched the keypad (`PIN_ENTRY`), across all outcomes including `FAIL_PIN`.
 */
export interface AccessLog {
  id: number;
  timestamp: string;
  status: 'SUCCESS' | 'FAIL_PIN' | 'FAIL_FP' | 'LOCKOUT' | 'KEYPAD_TOUCH';
  pin_attempts: number;
  fp_attempts: number;
  fp_slot_id: number | null;
  user_name?: string | null;
  user_role?: string | null;
  image_id: number | null;
  image: Image | null;
}

export interface BiometricUser {
  id: number | null;
  slot_id: number;
  name: string;
  role: string;
  created_at: string | null;
}

export interface Command {
  id: number;
  command_type: 'LOCKOUT' | 'UNLOCK' | 'ENROLL' | 'UNENROLL' | 'RESET' | 'PIN_RESET';
  payload: string | null;
  status: 'PENDING' | 'RELAYED' | 'ACKNOWLEDGED' | 'DONE' | 'FAILED';
  created_at: string;
  updated_at: string;
}

export interface DeviceStatus {
  last_seen: string | null;
  status: 'online' | 'offline' | 'locked_out';
  host_ip?: string;
}

export interface AnalyticsStats {
  total_today: number;
  successes: number;
  failures: number;
  lockouts: number;
  peak_hours: { hour: number; count: number }[];
  streak: number;
}
