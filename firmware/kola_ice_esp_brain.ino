#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>
#include <EEPROM.h> 
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// --- AS608 FINGERPRINT SENSOR ---
#include <Adafruit_Fingerprint.h>

HardwareSerial mySerial(2); // Use hardware UART2 remapped to GPIO 26 and 27
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

// --- NETWORK CONFIGURATION ---
const char* ssid = "Safelock";
const char* password = "safelock123";
const char* flask_ip = "192.168.137.1"; // CHANGE TO YOUR FLASK SERVER IP
const int flask_port = 5000;

WebSocketsClient webSocket;

// --- PIN DEFINITIONS ---
const int RELAY_PIN = 23;            
const int CAMERA_TRIGGER_PIN = 2;   

// Keypad Matrix Layout
const byte ROWS = 4; 
const byte COLS = 3; 
char keys[ROWS][COLS] = {
  {'1','2','3'},
  {'4','5','6'},
  {'7','8','9'},
  {'*','0','#'}
};
byte rowPins[ROWS] = {13, 12, 25, 33}; 
byte colPins[COLS] = {19, 18, 5}; 
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

LiquidCrystal_I2C lcd(0x27, 16, 2);

// --- SYSTEM VARIABLES ---
String correctPIN = "1234"; 
String inputPIN = "";
String tempNewPIN = "";     
int failedAttempts = 0;
int currentPinAttempts = 0;
int currentFpAttempts = 0;

unsigned long lastInteractionTime = 0; 
unsigned long stateStartTime = 0;      
int lastCountdownSecond = -1;

// --- EEPROM LAYOUT ---
#define EEPROM_PIN_ADDR   0
#define EEPROM_MAGIC_ADDR 60   // separate from the 4-byte PIN string
#define EEPROM_MAGIC_VAL  0xAB

// --- WIFI / WEBSOCKET STATE (non-blocking) ---
bool wifiConnected = false;          // last known connection state
bool websocketStarted = false;       // has webSocket.begin() been called yet
unsigned long lastWifiAttempt = 0;
const unsigned long WIFI_RETRY_INTERVAL = 10000; // try to (re)connect every 10s while offline

enum SystemState { 
  NORMAL, 
  FINGERPRINT_WAIT, 
  UNLOCKED, 
  LOCKED_OUT, 
  CHANGE_PIN_OLD, 
  CHANGE_PIN_NEW, 
  CHANGE_PIN_CONFIRM,
  ENROLLING          // Biometric enrollment in progress - keypad blocked
};
SystemState currentState = NORMAL;

// --- WEBSOCKET EVENT HANDLER ---
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  if (type == WStype_TEXT) {
    Serial.printf("[WEB] Command received: %s\n", payload);
    
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, payload);
    
    if (!error) {
      String command = doc["command"];
      
      if (command == "PING") {
        // Server heartbeat — no action needed
      }
      else if (command == "UNLOCK") {
        Serial.println("[WEB] Remote unlock authorized.");
        // Show receipt confirmation before grantAccess() overwrites the display
        lcd.clear(); lcd.setCursor(0, 0); lcd.print("REMOTE UNLOCK");
        lcd.setCursor(0, 1); lcd.print("Override active");
        delay(600);
        grantAccess();
      } 
      else if (command == "LOCKDOWN") {
        Serial.println("[WEB] Remote LOCKDOWN initiated!");
        failedAttempts = 3;
        currentState = LOCKED_OUT;
        stateStartTime = millis();
        lcd.clear(); lcd.setCursor(0, 0); lcd.print("SYSTEM LOCKED");
        lcd.setCursor(0, 1); lcd.print("Remote override");
      }
      else if (command == "RESET_PIN") {
        String newPin = doc["pin"];
        if(newPin.length() == 4) {
          correctPIN = newPin;
          EEPROM.writeString(0, correctPIN);
          EEPROM.commit();
          Serial.println("[WEB] PIN successfully updated remotely.");
          lcd.clear(); lcd.setCursor(0, 0); lcd.print("PIN UPDATED");
          lcd.setCursor(0, 1); lcd.print("Remote sync OK");
          delay(2000);
          resetDisplay();
        }
      }
      else if (command == "ENROLL_FINGER") {
        int idToEnroll = doc["id"];
        if(idToEnroll > 0 && idToEnroll < 128) {
           Serial.printf("[WEB] Remote command to enroll ID #%d\n", idToEnroll);
           enrollFingerprint(idToEnroll); 
        }
      }
      else if (command == "DELETE_FINGER") {
        int idToDelete = doc["id"];
        if(idToDelete > 0 && idToDelete < 128) {
           bool success = (finger.deleteModel(idToDelete) == FINGERPRINT_OK);
           if (success) {
             Serial.printf("[WEB] Deleted biometric ID #%d\n", idToDelete);
             lcd.clear(); lcd.setCursor(0, 0); lcd.print("SLOT UNENROLLED");
             lcd.setCursor(0, 1); lcd.printf("ID #%d success", idToDelete);
             delay(2000);
             resetDisplay();
           } else {
             Serial.printf("[WEB] Failed to delete biometric ID #%d\n", idToDelete);
             lcd.clear(); lcd.setCursor(0, 0); lcd.print("UNENROLL FAILED");
             lcd.setCursor(0, 1); lcd.printf("ID #%d error", idToDelete);
             delay(2000);
             resetDisplay();
           }
           sendUnenrollResult(success, idToDelete);
        }
      }
    }
  }
}

// Starts (or restarts) the WebSocket client. Safe to call multiple times.
void startWebSocket() {
  webSocket.begin(flask_ip, flask_port, "/ws");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  websocketStarted = true;
}

// Call every loop() iteration. Non-blocking: never delays the keypad/fingerprint code.
// - If WiFi is down, retries every WIFI_RETRY_INTERVAL instead of hanging.
// - The moment WiFi comes back, it starts (or resumes) the WebSocket automatically.
// - webSocket.loop() only runs once we're actually connected, so it can't stall
//   the keypad while offline.
void handleWifiAndWebSocket(unsigned long currentMillis) {
  bool nowConnected = (WiFi.status() == WL_CONNECTED);

  if (nowConnected && !wifiConnected) {
    // Just came online (either first connect, or recovered after a drop)
    Serial.println("[WIFI] Network is back up! IP: " + WiFi.localIP().toString());
    wifiConnected = true;
    if (!websocketStarted) {
      startWebSocket();
    }
    // If it was already started before, WebSocketsClient will auto-reconnect
    // on its own once the underlying TCP link is available again.
  }

  if (!nowConnected && wifiConnected) {
    // Just dropped
    Serial.println("[WIFI] Connection lost - safe continues operating offline.");
    wifiConnected = false;
  }

  if (!nowConnected) {
    // Periodically retry without blocking anything else
    if (currentMillis - lastWifiAttempt >= WIFI_RETRY_INTERVAL) {
      Serial.println("[WIFI] Retrying connection...");
      WiFi.reconnect();
      lastWifiAttempt = currentMillis;
    }
    return; // nothing more to do until we're back online
  }

  // Connected: let the WebSocket library do its thing (send/receive, its own
  // internal auto-reconnect for the ws:// link specifically)
  webSocket.loop();
}

void setup() {
  Serial.begin(115200);
  
  // Memory Load
  EEPROM.begin(64);
  if (EEPROM.read(EEPROM_MAGIC_ADDR) != EEPROM_MAGIC_VAL) {
    // First real boot (or corrupted flash) - force a known-good PIN
    correctPIN = "1234";
    EEPROM.writeString(EEPROM_PIN_ADDR, correctPIN);
    EEPROM.write(EEPROM_MAGIC_ADDR, EEPROM_MAGIC_VAL);
    EEPROM.commit();
    Serial.println("[EEPROM] First boot detected - PIN reset to default 1234");
  } else {
    correctPIN = EEPROM.readString(EEPROM_PIN_ADDR);
    Serial.println("[EEPROM] Loaded stored PIN");
  }
  
  // Hardware Setup
  // RELAY LOGIC (Inverted / Active-HIGH):
  //   LOW  = relay de-energized → no solenoid current → spring bolt engaged (LOCKED)
  //   HIGH = relay energized → solenoid current flows → bolt retracts (UNLOCKED)
  // This keeps the relay coil de-energized during normal standby to save power.
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);   // Relay OFF (LOCKED) on startup
  pinMode(CAMERA_TRIGGER_PIN, OUTPUT);
  digitalWrite(CAMERA_TRIGGER_PIN, HIGH); 

  lcd.init();
  lcd.backlight();
  resetDisplay();
  
  // --- AS608 INITIALIZATION ---
  // Remap HardwareSerial2 to GPIO 26 (RX) and 27 (TX)
  mySerial.begin(57600, SERIAL_8N1, 26, 27);
  // Do NOT call finger.begin(57600) as it resets pin mappings to default 16/17!
  if (finger.verifyPassword()) {
    Serial.println("[SUCCESS] AS608 Fingerprint sensor detected!");
  } else {
    Serial.println("[ERROR] Did not find fingerprint sensor. Check wiring.");
  }

  // Connect to Wi-Fi (bounded wait - the safe must work locally even if this fails)
  Serial.print("Connecting to Wi-Fi");
  WiFi.begin(ssid, password);
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 10000) {
    delay(500); Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected! IP: " + WiFi.localIP().toString());
    wifiConnected = true;
    startWebSocket();
  } else {
    Serial.println("\n[WIFI] Not connected yet - continuing offline. Will keep retrying in background.");
    wifiConnected = false;
  }
  lastWifiAttempt = millis();

  Serial.println("System Core active. Advanced Security mode initialized.");
}

void loop() {
  unsigned long currentMillis = millis();

  // --- NON-BLOCKING WIFI / WEBSOCKET MANAGEMENT ---
  handleWifiAndWebSocket(currentMillis);

  // 1. Idle Timeout
  if (currentState != UNLOCKED && currentState != LOCKED_OUT && currentState != FINGERPRINT_WAIT) {
    if (inputPIN.length() > 0 && (currentMillis - lastInteractionTime >= 30000)) {
      inputPIN = "";
      currentState = NORMAL;
      resetDisplay();
    }
  }

  // 2. Time-Based States
  switch (currentState) {
    case NORMAL:
    case CHANGE_PIN_OLD:
    case CHANGE_PIN_NEW:
    case CHANGE_PIN_CONFIRM:
      handleKeypadInput();
      break;

    case FINGERPRINT_WAIT: { 
      handleKeypadInput(); // To catch the bypass testing key (#)
      
      long fpRemaining = (60000L - (long)(currentMillis - stateStartTime)) / 1000L;
      if (fpRemaining <= 0) {
        registerFailure(); 
      } else if (fpRemaining != lastCountdownSecond) {
        lcd.setCursor(0, 1); lcd.print(fpRemaining); lcd.print("s remaining...  ");
        lastCountdownSecond = fpRemaining;
      }
      
      // --- BIOMETRIC SCAN LOOP ---
      uint8_t p = finger.getImage();
      if (p == FINGERPRINT_OK) {
        p = finger.image2Tz();
        if (p == FINGERPRINT_OK) {
          currentFpAttempts++;
          p = finger.fingerSearch();
          if (p == FINGERPRINT_OK) {
            Serial.printf("[BIOMETRIC] Match found! ID #%d (Confidence: %d)\n", finger.fingerID, finger.confidence);
            grantAccess();
          } else {
            Serial.println("[BIOMETRIC] Print does not match any enrolled ID.");
            registerFailure(); // Wrong fingerprint triggers a strike
          }
        }
      }
      break;
    } 

    case ENROLLING:
      // enrollFingerprint() runs synchronously and resets state itself.
      // This case just prevents the keypad from being read mid-enrollment.
      break;

    case UNLOCKED: {
      long unlockRemaining = (5000L - (long)(currentMillis - stateStartTime)) / 1000L;
      if (unlockRemaining <= 0) {
        digitalWrite(RELAY_PIN, LOW);   // Relay OFF (LOCKED)
        currentState = NORMAL;
        resetDisplay();
      } else if (unlockRemaining != lastCountdownSecond) {
        // Keep row 1 showing a live countdown so the LCD feels alive
        lcd.setCursor(0, 1); lcd.print("Relocking in "); lcd.print(unlockRemaining); lcd.print("s  ");
        lastCountdownSecond = unlockRemaining;
      }
      break;
    }

    case LOCKED_OUT: { 
      long lockRemaining = (30000L - (long)(currentMillis - stateStartTime)) / 1000L;
      if (lockRemaining <= 0) {
        failedAttempts = 0; 
        currentState = NORMAL;
        resetDisplay();
      } else if (lockRemaining != lastCountdownSecond) {
        lcd.setCursor(0, 1); lcd.print("Wait: "); lcd.print(lockRemaining); lcd.print("s       ");
        lastCountdownSecond = lockRemaining;
      }
      break;
    } 
  }
}

void handleKeypadInput() {
  char key = keypad.getKey();
  if (!key) return;

  lastInteractionTime = millis(); 

  // Dev Bypass
  if (currentState == FINGERPRINT_WAIT && key == '#') {
    finger.fingerID = 0;
    grantAccess();
    return;
  }

  // Fire Camera
  if (inputPIN.length() == 0 && currentState == NORMAL) {
    triggerCamera();
    currentPinAttempts = 0;
    currentFpAttempts = 0;
  }

  // Clear Button Logic
  if (key == '*') {
    if (inputPIN == "*#3334#") {} 
    else if (inputPIN.length() == 0) {} 
    else {
      inputPIN = "";
      updatePINDisplay();
      return; 
    }
  }

  inputPIN += key;
  updatePINDisplay();

  // State Routing
  if (currentState == NORMAL) {
    if (inputPIN.charAt(0) == '*') {
      if (inputPIN == "*#3334#*") {
        inputPIN = "";
        grantAccess(); 
      } else if (inputPIN.length() >= 8) {
        inputPIN = "";
        currentPinAttempts++;
        registerFailure(); 
      }
    } 
    else if (inputPIN.length() == 4) {
      if (inputPIN == "0000") {
        currentState = CHANGE_PIN_OLD;
        inputPIN = "";
        resetDisplay();
      } else {
        currentPinAttempts++;
        if (inputPIN == correctPIN) {
          currentState = FINGERPRINT_WAIT;
          stateStartTime = millis();
          inputPIN = "";
          resetDisplay();
        } else {
          inputPIN = "";
          registerFailure();
        }
      }
    }
  } 
  else if (currentState == CHANGE_PIN_OLD) {
    if (inputPIN.length() == 4) {
      if (inputPIN == correctPIN) {
        currentState = CHANGE_PIN_NEW;
        resetDisplay();
      } else {
        lcd.clear(); lcd.setCursor(0,0); lcd.print("INCORRECT PIN");
        delay(2000);
        currentState = NORMAL;
        resetDisplay();
      }
      inputPIN = "";
    }
  } 
  else if (currentState == CHANGE_PIN_NEW) {
    if (inputPIN.length() == 4) {
      tempNewPIN = inputPIN;
      currentState = CHANGE_PIN_CONFIRM;
      inputPIN = "";
      resetDisplay();
    }
  } 
  else if (currentState == CHANGE_PIN_CONFIRM) {
    if (inputPIN.length() == 4) {
      if (inputPIN == tempNewPIN) {
        correctPIN = tempNewPIN;
        EEPROM.writeString(0, correctPIN); 
        EEPROM.commit();                   
        lcd.clear(); lcd.setCursor(0,0); lcd.print("PIN UPDATED!");
      } else {
        lcd.clear(); lcd.setCursor(0,0); lcd.print("PIN MISMATCH!");
      }
      delay(2000);
      currentState = NORMAL;
      inputPIN = "";
      resetDisplay();
    }
  }
}

void triggerCamera() {
  digitalWrite(CAMERA_TRIGGER_PIN, LOW);  
  delay(150); 
  digitalWrite(CAMERA_TRIGGER_PIN, HIGH); 
}

// Sends a JSON access log event back to Flask over WebSocket.
void sendAccessLog(const char* status, int pinAttempts, int fpAttempts, int fpSlotId) {
  if (!webSocket.isConnected()) return;
  
  char buf[128];
  if (fpSlotId >= 0) {
    snprintf(buf, sizeof(buf),
      "{\"event\":\"LOG\",\"status\":\"%s\",\"pin_attempts\":%d,\"fp_attempts\":%d,\"fp_slot_id\":%d}",
      status, pinAttempts, fpAttempts, fpSlotId);
  } else {
    snprintf(buf, sizeof(buf),
      "{\"event\":\"LOG\",\"status\":\"%s\",\"pin_attempts\":%d,\"fp_attempts\":%d,\"fp_slot_id\":null}",
      status, pinAttempts, fpAttempts);
  }
  
  webSocket.sendTXT(buf);
  Serial.printf("[LOG] Sent access log: %s (PIN: %d, FP: %d, Slot: %d)\n", status, pinAttempts, fpAttempts, fpSlotId);
}

// Sends a JSON enrollment result event back to Flask over WebSocket.
static void sendEnrollResult(bool success, const char* reason, int id = 0) {
  if (!webSocket.isConnected()) return;
  char buf[96];
  if (success) {
    snprintf(buf, sizeof(buf),
      "{\"event\":\"ENROLL_RESULT\",\"success\":true,\"id\":%d}", id);
  } else {
    snprintf(buf, sizeof(buf),
      "{\"event\":\"ENROLL_RESULT\",\"success\":false,\"reason\":\"%s\"}", reason);
  }
  webSocket.sendTXT(buf);
}

// Sends a JSON unenroll result event back to Flask over WebSocket.
static void sendUnenrollResult(bool success, int id) {
  if (!webSocket.isConnected()) return;
  char buf[96];
  snprintf(buf, sizeof(buf),
    "{\"event\":\"UNENROLL_RESULT\",\"success\":%s,\"id\":%d}",
    success ? "true" : "false", id);
  webSocket.sendTXT(buf);
}

// Full two-scan enrollment flow driven by a dashboard ENROLL_FINGER command.
// Blocks loop() for the duration of enrollment (by design — it is an attended
// admin operation). Calls webSocket.loop() internally to keep the WS link alive.
void enrollFingerprint(uint8_t enrollId) {
  currentState = ENROLLING;
  Serial.printf("[ENROLL] Starting enrollment for ID #%d\n", enrollId);

  // ── STEP 1: first scan ───────────────────────────────────────────────────
  lcd.clear(); lcd.setCursor(0, 0); lcd.print("ENROLL MODE");
  lcd.setCursor(0, 1); lcd.print("Place finger");

  int p = -1;
  unsigned long t = millis();
  while (p != FINGERPRINT_OK) {
    if (millis() - t > 30000) {
      lcd.clear(); lcd.setCursor(0, 0); lcd.print("TIMED OUT");
      Serial.println("[ENROLL] Timed out waiting for first scan.");
      delay(2000);
      currentState = NORMAL; resetDisplay();
      sendEnrollResult(false, "timeout_scan1");
      return;
    }
    p = finger.getImage();
    webSocket.loop();
    delay(50);
  }

  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) {
    lcd.clear(); lcd.setCursor(0, 0); lcd.print("IMAGE ERROR");
    Serial.println("[ENROLL] image2Tz(1) failed.");
    delay(2000);
    currentState = NORMAL; resetDisplay();
    sendEnrollResult(false, "image_error_1");
    return;
  }

  // ── STEP 2: wait for finger removal ──────────────────────────────────────
  lcd.clear(); lcd.setCursor(0, 0); lcd.print("Remove finger");
  Serial.println("[ENROLL] First scan OK — remove finger.");
  delay(1000);
  p = 0;
  while (p != FINGERPRINT_NOFINGER) {
    p = finger.getImage();
    webSocket.loop();
    delay(50);
  }

  // ── STEP 3: second scan (same finger) ────────────────────────────────────
  lcd.clear(); lcd.setCursor(0, 0); lcd.print("Place finger");
  lcd.setCursor(0, 1); lcd.print("again");
  Serial.println("[ENROLL] Place same finger again.");

  p = -1;
  t = millis();
  while (p != FINGERPRINT_OK) {
    if (millis() - t > 30000) {
      lcd.clear(); lcd.setCursor(0, 0); lcd.print("TIMED OUT");
      Serial.println("[ENROLL] Timed out waiting for second scan.");
      delay(2000);
      currentState = NORMAL; resetDisplay();
      sendEnrollResult(false, "timeout_scan2");
      return;
    }
    p = finger.getImage();
    webSocket.loop();
    delay(50);
  }

  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) {
    lcd.clear(); lcd.setCursor(0, 0); lcd.print("IMAGE ERROR");
    Serial.println("[ENROLL] image2Tz(2) failed.");
    delay(2000);
    currentState = NORMAL; resetDisplay();
    sendEnrollResult(false, "image_error_2");
    return;
  }

  // ── STEP 4: create model (compares both templates) ────────────────────────
  p = finger.createModel();
  if (p == FINGERPRINT_ENROLLMISMATCH) {
    lcd.clear(); lcd.setCursor(0, 0); lcd.print("MISMATCH!");
    lcd.setCursor(0, 1); lcd.print("Try again");
    Serial.println("[ENROLL] Fingerprints did not match.");
    delay(2000);
    currentState = NORMAL; resetDisplay();
    sendEnrollResult(false, "mismatch");
    return;
  } else if (p != FINGERPRINT_OK) {
    lcd.clear(); lcd.setCursor(0, 0); lcd.print("MODEL FAILED");
    Serial.printf("[ENROLL] createModel() error: %d\n", p);
    delay(2000);
    currentState = NORMAL; resetDisplay();
    sendEnrollResult(false, "create_model_failed");
    return;
  }

  // ── STEP 5: store model in sensor flash ───────────────────────────────────
  p = finger.storeModel(enrollId);
  if (p == FINGERPRINT_OK) {
    lcd.clear(); lcd.setCursor(0, 0); lcd.print("ENROLLED!");
    lcd.setCursor(0, 1); lcd.print("ID #"); lcd.print(enrollId);
    Serial.printf("[ENROLL] Successfully enrolled ID #%d\n", enrollId);
    delay(2000);
    currentState = NORMAL; resetDisplay();
    sendEnrollResult(true, nullptr, enrollId);
  } else {
    lcd.clear(); lcd.setCursor(0, 0); lcd.print("STORE FAILED");
    Serial.printf("[ENROLL] storeModel() error: %d\n", p);
    delay(2000);
    currentState = NORMAL; resetDisplay();
    sendEnrollResult(false, "store_failed");
  }
}

void grantAccess() {
  if (currentState == FINGERPRINT_WAIT) {
    sendAccessLog("SUCCESS", currentPinAttempts, currentFpAttempts, finger.fingerID);
  }
  failedAttempts = 0;
  currentState = UNLOCKED;
  stateStartTime = millis();
  lastCountdownSecond = -1;         // Force immediate countdown render on first loop tick
  digitalWrite(RELAY_PIN, HIGH);    // Relay ON — energize solenoid (unlock for 5s)
  lcd.clear(); lcd.setCursor(0, 0); lcd.print("ACCESS GRANTED");
  lcd.setCursor(0, 1); lcd.print("Relocking in 5s ");
}

void registerFailure() {
  failedAttempts++;
  lcd.clear(); lcd.setCursor(0, 0); lcd.print("ACCESS DENIED");
  
  if (currentState == NORMAL) {
    sendAccessLog(failedAttempts >= 3 ? "LOCKOUT" : "FAIL_PIN", currentPinAttempts, currentFpAttempts, -1);
  } else if (currentState == FINGERPRINT_WAIT) {
    sendAccessLog(failedAttempts >= 3 ? "LOCKOUT" : "FAIL_FP", currentPinAttempts, currentFpAttempts, -1);
  }
  
  delay(2000); 
  if (failedAttempts >= 3) {
    currentState = LOCKED_OUT;
    stateStartTime = millis();
    lcd.clear(); lcd.setCursor(0, 0); lcd.print("SYSTEM LOCKED");
  } else {
    currentState = NORMAL;
    resetDisplay();
  }
}

void resetDisplay() {
  lcd.clear(); lcd.setCursor(0, 0);
  switch(currentState) {
    case NORMAL: lcd.print("SAFE LOCKED"); lcd.setCursor(0, 1); lcd.print("Enter PIN"); break;
    case FINGERPRINT_WAIT: lcd.print("SCAN FINGER"); break;
    case CHANGE_PIN_OLD: lcd.print("CHANGE PIN MODE"); lcd.setCursor(0, 1); lcd.print("Old:"); break;
    case CHANGE_PIN_NEW: lcd.print("CHANGE PIN MODE"); lcd.setCursor(0, 1); lcd.print("New:"); break;
    case CHANGE_PIN_CONFIRM: lcd.print("CHANGE PIN MODE"); lcd.setCursor(0, 1); lcd.print("Confirm:"); break;
    default: break;
  }
}

void updatePINDisplay() {
  lcd.setCursor(0, 1); lcd.print("                "); lcd.setCursor(0, 1);
  if (currentState == CHANGE_PIN_OLD) lcd.print("Old: ");
  if (currentState == CHANGE_PIN_NEW) lcd.print("New: ");
  if (currentState == CHANGE_PIN_CONFIRM) lcd.print("Confirm: ");
  for (int i = 0; i < inputPIN.length(); i++) { lcd.print("*"); }
}

