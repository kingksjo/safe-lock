#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>
#include <EEPROM.h> 
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// --- AS608 FINGERPRINT SENSOR ---
#include <Adafruit_Fingerprint.h>
HardwareSerial mySerial(2); // RX = Pin 16, TX = Pin 17
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

// --- NETWORK CONFIGURATION ---
const char* ssid = "Safelock";
const char* password = "safelock123";
const char* flask_ip = "192.168.137.1"; // CHANGE TO YOUR FLASK SERVER IP
const int flask_port = 5000;

WebSocketsClient webSocket;

// --- PIN DEFINITIONS ---
const int RELAY_PIN = 4;            
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
byte rowPins[ROWS] = {13, 12, 14, 27}; 
byte colPins[COLS] = {26, 25, 33}; 
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

LiquidCrystal_I2C lcd(0x27, 16, 2);

// --- SYSTEM VARIABLES ---
String correctPIN = "1234"; 
String inputPIN = "";
String tempNewPIN = "";     
int failedAttempts = 0;

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
  CHANGE_PIN_CONFIRM 
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
      
      if (command == "UNLOCK") {
        Serial.println("[WEB] Remote unlock authorized.");
        grantAccess();
      } 
      else if (command == "LOCKDOWN") {
        Serial.println("[WEB] Remote LOCKDOWN initiated!");
        failedAttempts = 3;
        currentState = LOCKED_OUT;
        stateStartTime = millis();
        lcd.clear(); lcd.setCursor(0,0); lcd.print("SYSTEM LOCKED");
      }
      else if (command == "RESET_PIN") {
        String newPin = doc["pin"];
        if(newPin.length() == 4) {
          correctPIN = newPin;
          EEPROM.writeString(0, correctPIN);
          EEPROM.commit();
          Serial.println("[WEB] PIN successfully updated remotely.");
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
           if (finger.deleteModel(idToDelete) == FINGERPRINT_OK) {
             Serial.printf("[WEB] Deleted biometric ID #%d\n", idToDelete);
           } else {
             Serial.printf("[WEB] Failed to delete biometric ID #%d\n", idToDelete);
           }
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
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); 
  pinMode(CAMERA_TRIGGER_PIN, OUTPUT);
  digitalWrite(CAMERA_TRIGGER_PIN, HIGH); 

  lcd.init();
  lcd.backlight();
  resetDisplay();
  
  // --- AS608 INITIALIZATION ---
  finger.begin(57600);
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
      
      long fpRemaining = (60000 - (currentMillis - stateStartTime)) / 1000;
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

    case UNLOCKED:
      if (currentMillis - stateStartTime >= 5000) { 
        digitalWrite(RELAY_PIN, HIGH); 
        currentState = NORMAL;
        resetDisplay();
      }
      break;

    case LOCKED_OUT: { 
      long lockRemaining = (30000 - (currentMillis - stateStartTime)) / 1000;
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
    grantAccess();
    return;
  }

  // Fire Camera
  if (inputPIN.length() == 0 && currentState == NORMAL) {
    triggerCamera();
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
        registerFailure(); 
      }
    } 
    else if (inputPIN.length() == 4) {
      if (inputPIN == "0000") {
        currentState = CHANGE_PIN_OLD;
        inputPIN = "";
        resetDisplay();
      } else if (inputPIN == correctPIN) {
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

void grantAccess() {
  failedAttempts = 0;
  currentState = UNLOCKED;
  stateStartTime = millis();
  digitalWrite(RELAY_PIN, LOW); 
  lcd.clear(); lcd.setCursor(0, 0); lcd.print("ACCESS GRANTED");
}

void registerFailure() {
  failedAttempts++;
  lcd.clear(); lcd.setCursor(0, 0); lcd.print("ACCESS DENIED");
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

// --- BIOMETRIC ENROLLMENT ROUTINE ---
// This is a blocking function triggered by the React Admin Dashboard. 
// It requires the user to place and remove their finger to create a solid template.
void enrollFingerprint(int id) {
  lcd.clear(); lcd.setCursor(0,0); lcd.print("ENROLL ID "); lcd.print(id);
  lcd.setCursor(0,1); lcd.print("Place Finger...");
  
  int p = -1;
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    if (p == FINGERPRINT_OK) {
      Serial.println("[BIOMETRIC] Image taken");
    }
  }

  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) { Serial.println("Error converting image."); return; }

  lcd.clear(); lcd.setCursor(0,0); lcd.print("Remove Finger");
  delay(2000);
  
  p = 0;
  while (p != FINGERPRINT_NOFINGER) { p = finger.getImage(); }

  lcd.clear(); lcd.setCursor(0,0); lcd.print("Place Same");
  lcd.setCursor(0,1); lcd.print("Finger Again");
  
  p = -1;
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
  }

  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) { Serial.println("Error converting image."); return; }

  p = finger.createModel();
  if (p == FINGERPRINT_OK) {
    Serial.println("[BIOMETRIC] Prints matched!");
  } else {
    Serial.println("[BIOMETRIC] Prints did not match.");
    lcd.clear(); lcd.setCursor(0,0); lcd.print("Enroll Failed");
    delay(2000); resetDisplay(); return;
  }

  p = finger.storeModel(id);
  if (p == FINGERPRINT_OK) {
    Serial.println("[BIOMETRIC] Stored successfully!");
    lcd.clear(); lcd.setCursor(0,0); lcd.print("Enroll Success!");
  } else {
    Serial.println("[BIOMETRIC] Error saving to sensor memory.");
    lcd.clear(); lcd.setCursor(0,0); lcd.print("Save Failed");
  }
  
  delay(2000);
  resetDisplay();
}