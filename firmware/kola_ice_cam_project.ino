#include "esp_camera.h"
#include "SD_MMC.h"
#include <WiFi.h>
#include "esp_http_server.h"
#include <HTTPClient.h>
#include <EEPROM.h>

// --- NETWORK CONFIGURATION ---
const char* ssid     = "Fiber Edge";
const char* password = "Thinkers";
const char* upload_url = "http://10.103.233.33:5000/upload"; // CHANGE TO YOUR FLASK IP

// --- CAMERA PIN ARRANGEMENT (AI-THINKER) ---
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

const int TRIGGER_PIN = 13; 

// --- STATE & MEMORY MANAGEMENT ---
volatile bool captureRequested = false;
unsigned long lastTriggerTime = 0;
const unsigned long cooldownMillis = 2000; 

camera_fb_t * latest_fb = NULL;            
int pictureCount = 0;   
int lastUploaded = 0; // Tracks the last index successfully sent to Flask

// HTTP GET Request Handler (Legacy support for React direct-fetch)
esp_err_t image_get_handler(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  if (!latest_fb) {
    httpd_resp_send_404(req);
    return ESP_FAIL;
  }
  httpd_resp_set_type(req, "image/jpeg");
  return httpd_resp_send(req, (const char *)latest_fb->buf, latest_fb->len);
}

void startWebServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  httpd_uri_t image_uri = { .uri = "/get-image", .method = HTTP_GET, .handler = image_get_handler, .user_ctx = NULL };
  httpd_handle_t camera_server = NULL;
  if (httpd_start(&camera_server, &config) == ESP_OK) {
    httpd_register_uri_handler(camera_server, &image_uri);
  }
}

// Submits the picture binary directly to Flask
void uploadPictureToFlask(camera_fb_t * fb, int currentPicId) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Offline. Image saved to SD but upload deferred.");
    return;
  }

  Serial.println("[NETWORK] Attempting HTTP POST to Flask server...");
  HTTPClient http;
  http.begin(upload_url);
  http.addHeader("Content-Type", "image/jpeg");
  
  // Custom header so Flask knows which image number this is
  http.addHeader("X-Image-ID", String(currentPicId));

  int httpResponseCode = http.POST(fb->buf, fb->len);

  if (httpResponseCode == 200) {
    Serial.println("[NETWORK] Upload successful!");
    lastUploaded = currentPicId;
    EEPROM.writeInt(0, lastUploaded);
    EEPROM.commit();
  } else {
    Serial.printf("[NETWORK] Upload failed. HTTP Error code: %d\n", httpResponseCode);
  }
  http.end();
}

// Batch process to sync photos saved to SD card while offline back to Flask when connection is restored
void syncBacklogFromSD() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (lastUploaded >= pictureCount) return;
  if (SD_MMC.cardSize() <= 0) return;
  
  int nextId = lastUploaded + 1;
  String path = "/security_log_" + String(nextId) + ".jpg";
  
  File file = SD_MMC.open(path.c_str(), FILE_READ);
  if (!file) {
    Serial.printf("[SYNC] SD file %s missing. Advancing pointer to prevent loop.\n", path.c_str());
    lastUploaded = nextId;
    EEPROM.writeInt(0, lastUploaded);
    EEPROM.commit();
    return;
  }
  
  size_t fileSize = file.size();
  if (fileSize == 0) {
    file.close();
    lastUploaded = nextId;
    EEPROM.writeInt(0, lastUploaded);
    EEPROM.commit();
    return;
  }
  
  uint8_t * buf = (uint8_t *)ps_malloc(fileSize);
  if (!buf) buf = (uint8_t *)malloc(fileSize);
  if (!buf) {
    Serial.println("[SYNC] Memory allocation failed for backlog buffer.");
    file.close();
    return;
  }
  
  file.read(buf, fileSize);
  file.close();
  
  Serial.printf("[SYNC] Uploading offline backlogged picture ID %d (%u bytes) to PC...\n", nextId, fileSize);
  HTTPClient http;
  http.begin(upload_url);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("X-Image-ID", String(nextId));
  http.addHeader("X-Image-Sync", "backlog");
  
  int httpResponseCode = http.POST(buf, fileSize);
  free(buf);
  
  if (httpResponseCode == 200) {
    Serial.printf("[SYNC] Backlog ID %d successfully dumped to PC database!\n", nextId);
    lastUploaded = nextId;
    EEPROM.writeInt(0, lastUploaded);
    EEPROM.commit();
  } else {
    Serial.printf("[SYNC] Dump failed for ID %d (HTTP %d). Will retry on next loop.\n", nextId, httpResponseCode);
  }
  http.end();
}

void setup() {
  Serial.begin(115200);

  // Initialize EEPROM tracking for picture uploads
  EEPROM.begin(8);
  lastUploaded = EEPROM.readInt(0);
  if(lastUploaded < 0 || lastUploaded > 100000) { lastUploaded = 0; } // Sanity check
  
  pictureCount = EEPROM.readInt(4);
  if(pictureCount < 0 || pictureCount > 100000 || pictureCount < lastUploaded) { 
    pictureCount = lastUploaded; 
    EEPROM.writeInt(4, pictureCount);
    EEPROM.commit();
  }
  
  pinMode(TRIGGER_PIN, INPUT_PULLUP);

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM; config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM; config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM; config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM; config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM; config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM; config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM; config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000; config.pixel_format = PIXFORMAT_JPEG;
  
  if(psramFound()){
    config.frame_size = FRAMESIZE_VGA; 
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_camera_init(&config);
  SD_MMC.begin("/sdcard", true);

  // Auto-discover existing offline photos on SD card if pictureCount is behind
  while (SD_MMC.exists("/security_log_" + String(pictureCount + 1) + ".jpg")) {
    pictureCount++;
    EEPROM.writeInt(4, pictureCount);
    EEPROM.commit();
  }

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
  
  startWebServer();
  delay(500);                 
  captureRequested = false;   
}

void loop() {
  if (digitalRead(TRIGGER_PIN) == LOW) {
    unsigned long currentTime = millis();
    if (currentTime - lastTriggerTime > cooldownMillis) {
      captureRequested = true;
      lastTriggerTime = currentTime;
    }
  }

  if (captureRequested) {
    captureRequested = false; 
    pictureCount++;
    EEPROM.writeInt(4, pictureCount);
    EEPROM.commit();

    if (latest_fb) { esp_camera_fb_return(latest_fb); latest_fb = NULL; }
    // Flush cached/stale DMA framebuffer to ensure we capture the real-time live image right now
    camera_fb_t * stale_fb = esp_camera_fb_get();
    if (stale_fb) { esp_camera_fb_return(stale_fb); }
    
    latest_fb = esp_camera_fb_get();
    
    if (latest_fb) {
      // 1. Save to SD Card
      if (SD_MMC.cardSize() > 0) {
        String path = "/security_log_" + String(pictureCount) + ".jpg";
        File file = SD_MMC.open(path.c_str(), FILE_WRITE);
        if(file){
          file.write(latest_fb->buf, latest_fb->len);
          file.close();
        }
      }
      // 2. Upload to Flask Server
      uploadPictureToFlask(latest_fb, pictureCount);
    }
  }
  
  // Non-blocking background check every 3 seconds to dump any offline SD backlog to the PC
  static unsigned long lastSyncCheck = 0;
  if (millis() - lastSyncCheck > 3000) {
    lastSyncCheck = millis();
    syncBacklogFromSD();
  }

  delay(10); 
}