#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>
#include <EEPROM.h> 
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

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
int sessionPinAttempts = 0;
int sessionFpAttempts = 0;

// --- OFFLINE LOG RING BUFFER ---
struct OfflineLogEntry {
  char status[32];
  int pin_attempts;
  int fp_attempts;
  unsigned long timestampMillis;
};
const int MAX_OFFLINE_LOGS = 20;
OfflineLogEntry offlineLogs[MAX_OFFLINE_LOGS];
int offlineLogCount = 0;

void logTelemetry(const char* status, int pinAttempts, int fpAttempts) {
  if (webSocket.isConnected()) {
    char jsonBuf[128];
    snprintf(jsonBuf, sizeof(jsonBuf), "{\"event\":\"LOG\",\"status\":\"%s\",\"pin_attempts\":%d,\"fp_attempts\":%d}", status, pinAttempts, fpAttempts);
    webSocket.sendTXT(jsonBuf);
    Serial.printf("[TELEMETRY] Sent live event: %s\n", status);
  } else {
    if (offlineLogCount < MAX_OFFLINE_LOGS) {
      strncpy(offlineLogs[offlineLogCount].status, status, sizeof(offlineLogs[offlineLogCount].status) - 1);
      offlineLogs[offlineLogCount].status[sizeof(offlineLogs[offlineLogCount].status) - 1] = '\0';
      offlineLogs[offlineLogCount].pin_attempts = pinAttempts;
      offlineLogs[offlineLogCount].fp_attempts = fpAttempts;
      offlineLogs[offlineLogCount].timestampMillis = millis();
      offlineLogCount++;
      Serial.printf("[TELEMETRY] Offline. Buffered event: %s (Buffer count: %d)\n", status, offlineLogCount);
    } else {
      Serial.println("[TELEMETRY] Offline log buffer full!");
    }
  }
}

void flushOfflineLogs() {
  if (offlineLogCount == 0 || !webSocket.isConnected()) return;
  
  Serial.printf("[TELEMETRY] Flushing %d offline backlogged logs to PC...\n", offlineLogCount);
  String batchJson = "{\"event\":\"LOG_BATCH\",\"logs\":[";
  unsigned long currentMillis = millis();
  for (int i = 0; i < offlineLogCount; i++) {
    long offsetSeconds = (currentMillis - offlineLogs[i].timestampMillis) / 1000;
    if (offsetSeconds < 0) offsetSeconds = 0;
    batchJson += "{\"status\":\"" + String(offlineLogs[i].status) + "\",\"pin_attempts\":" + String(offlineLogs[i].pin_attempts) + ",\"fp_attempts\":" + String(offlineLogs[i].fp_attempts) + ",\"offset_seconds\":" + String(offsetSeconds) + "}";
    if (i < offlineLogCount - 1) batchJson += ",";
  }
  batchJson += "]}";
  
  webSocket.sendTXT(batchJson);
  offlineLogCount = 0;
  Serial.println("[TELEMETRY] Offline logs successfully sent to PC!");
}

// --- WEBSOCKET EVENT HANDLER ---
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  if (type == WStype_CONNECTED) {
    Serial.println("[WEB] Connected to Flask WebSocket!");
    flushOfflineLogs();
  }
  else if (type == WStype_TEXT) {
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
      // Biometric management placeholders for future integration
      else if (command == "ENROLL_FINGER") {
        Serial.println("[WEB] Entering biometric enrollment mode...");
      }
      else if (command == "DELETE_FINGER") {
        Serial.println("[WEB] Deleting specified biometric ID...");
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  
  // Memory Load
  EEPROM.begin(64);
  correctPIN = EEPROM.readString(0);
  if (correctPIN.length() != 4) {
    correctPIN = "1234";
    EEPROM.writeString(0, correctPIN);
    EEPROM.commit();
  }
  
  // Hardware Setup
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH); 
  pinMode(CAMERA_TRIGGER_PIN, OUTPUT);
  digitalWrite(CAMERA_TRIGGER_PIN, HIGH); 

  lcd.init();
  lcd.backlight();
  resetDisplay();
  
  // Connect to Wi-Fi
  Serial.print("Connecting to Wi-Fi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.println("\n[WIFI] Connected! IP: " + WiFi.localIP().toString());

  // Connect WebSocket to Flask
  webSocket.begin(flask_ip, flask_port, "/ws");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000); // Auto-reconnect if Flask goes down

  delay(100);
  Serial.println("System Core active. Advanced Security mode initialized.");
}

void loop() {
  unsigned long currentMillis = millis();

  // CRITICAL: Keep the WebSocket connection alive and processing commands
  webSocket.loop();

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
      handleKeypadInput(); 
      long fpRemaining = (60000 - (currentMillis - stateStartTime)) / 1000;
      if (fpRemaining <= 0) {
        registerFailure(); 
      } else if (fpRemaining != lastCountdownSecond) {
        lcd.setCursor(0, 1); lcd.print(fpRemaining); lcd.print("s remaining...  ");
        lastCountdownSecond = fpRemaining;
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
  logTelemetry("FINGERPRINT_SUCCESS", sessionPinAttempts, sessionFpAttempts);
  sessionPinAttempts = 0;
  sessionFpAttempts = 0;
}

void registerFailure() {
  failedAttempts++;
  lcd.clear(); lcd.setCursor(0, 0); lcd.print("ACCESS DENIED");
  delay(2000); 
  if (failedAttempts >= 3) {
    currentState = LOCKED_OUT;
    stateStartTime = millis();
    lcd.clear(); lcd.setCursor(0, 0); lcd.print("SYSTEM LOCKED");
    logTelemetry("LOCKOUT", sessionPinAttempts, sessionFpAttempts);
    sessionPinAttempts = 0;
    sessionFpAttempts = 0;
  } else {
    if (currentState == FINGERPRINT_WAIT) {
      sessionFpAttempts++;
      logTelemetry("FINGERPRINT_FAIL", sessionPinAttempts, sessionFpAttempts);
    } else {
      sessionPinAttempts++;
      logTelemetry("PIN_FAIL", sessionPinAttempts, sessionFpAttempts);
    }
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