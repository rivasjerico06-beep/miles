/*
  ESP32-CAM test
  1. Checks the parts from the wiring sheet: LEDs blink, buzzer beeps, OLED shows text.
  2. Starts its own Wi-Fi network and shows the live camera picture in a browser.

  View the camera: join Wi-Fi "ESP32-CAM-TEST" (password camtest123), open http://192.168.4.1
  Board: "AI Thinker ESP32-CAM" (esp32 by Espressif 2.0.17). Library: Adafruit SSD1306.
*/

#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "esp_camera.h"

const char* AP_NAME = "ESP32-CAM-TEST";
const char* AP_PASSWORD = "camtest123";  // at least 8 characters

const int PIN_GREEN_LED = 12;
const int PIN_RED_LED = 2;
const int PIN_BUZZER = 13;  // active-LOW: LOW = sound
const int PIN_OLED_SDA = 14;
const int PIN_OLED_SCL = 15;  // the OLED pin may be labelled SCK
const int PIN_FLASH_LED = 4;

Adafruit_SSD1306 oled(128, 64, &Wire, -1);
WebServer server(80);
bool oledOk = false;
bool cameraOk = false;

void show(const String& a, const String& b = "", const String& c = "", const String& d = "") {
  Serial.println(a + " " + b + " " + c + " " + d);
  if (!oledOk) return;
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.println(a);
  oled.println(b);
  oled.println(c);
  oled.println(d);
  oled.display();
}

bool startCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_pwdn = 32;
  config.pin_reset = -1;
  config.pin_xclk = 0;
  config.pin_sccb_sda = 26;
  config.pin_sccb_scl = 27;
  config.pin_d7 = 35;
  config.pin_d6 = 34;
  config.pin_d5 = 39;
  config.pin_d4 = 36;
  config.pin_d3 = 21;
  config.pin_d2 = 19;
  config.pin_d1 = 18;
  config.pin_d0 = 5;
  config.pin_vsync = 25;
  config.pin_href = 23;
  config.pin_pclk = 22;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;
  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;  // 640 x 480
    config.jpeg_quality = 12;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    config.frame_size = FRAMESIZE_QVGA;  // 320 x 240
    config.jpeg_quality = 15;
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }
  return true;
}

void handleRoot() {
  server.send(200, "text/html",
              "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
              "<title>ESP32-CAM test</title><style>body{font-family:sans-serif;text-align:center;background:#111;color:#eee}"
              "img{width:100%;max-width:640px;border-radius:8px}a{color:#f9a8d4}</style></head><body>"
              "<h2>ESP32-CAM live view</h2><img src='/stream'>"
              "<p><a href='/capture' target='_blank'>Take a photo</a> &middot; "
              "<a href='/flash'>Flash on/off</a></p></body></html>");
}

void handleStream() {
  WiFiClient client = server.client();
  client.print("HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary=frame\r\nCache-Control: no-cache\r\n\r\n");
  while (client.connected()) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Frame capture failed");
      delay(100);
      continue;
    }
    client.printf("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len);
    client.write(fb->buf, fb->len);
    client.print("\r\n");
    esp_camera_fb_return(fb);
  }
}

void handleCapture() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    server.send(500, "text/plain", "Capture failed");
    return;
  }
  server.sendHeader("Cache-Control", "no-cache");
  server.send_P(200, "image/jpeg", (const char*)fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

void handleFlash() {
  digitalWrite(PIN_FLASH_LED, !digitalRead(PIN_FLASH_LED));
  server.sendHeader("Location", "/");
  server.send(303);
}

void setup() {
  digitalWrite(PIN_BUZZER, HIGH);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_GREEN_LED, OUTPUT);
  pinMode(PIN_RED_LED, OUTPUT);
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, LOW);

  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== ESP32-CAM test ===");

  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  oledOk = oled.begin(SSD1306_SWITCHCAPVCC, 0x3C) || oled.begin(SSD1306_SWITCHCAPVCC, 0x3D);
  Serial.println(oledOk ? "OLED: OK" : "OLED: not found (check SDA=14, SCK/SCL=15, VCC=3V3)");
  show("ESP32-CAM TEST", "Testing parts...");

  Serial.println("Green LED on (GPIO12)");
  digitalWrite(PIN_GREEN_LED, HIGH);
  delay(600);
  digitalWrite(PIN_GREEN_LED, LOW);
  Serial.println("Red LED on (GPIO2)");
  digitalWrite(PIN_RED_LED, HIGH);
  delay(600);
  digitalWrite(PIN_RED_LED, LOW);
  Serial.println("Buzzer beep (GPIO13)");
  digitalWrite(PIN_BUZZER, LOW);
  delay(200);
  digitalWrite(PIN_BUZZER, HIGH);

  Serial.printf("PSRAM: %s\n", psramFound() ? "found" : "NOT found");
  cameraOk = startCamera();
  if (!cameraOk) {
    show("CAMERA FAILED", "Check the ribbon", "cable and board", "AI Thinker ESP32-CAM");
    digitalWrite(PIN_RED_LED, HIGH);
    return;
  }
  Serial.println("Camera: OK");

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_NAME, AP_PASSWORD);
  IPAddress ip = WiFi.softAPIP();
  server.on("/", handleRoot);
  server.on("/stream", handleStream);
  server.on("/capture", handleCapture);
  server.on("/flash", handleFlash);
  server.begin();

  digitalWrite(PIN_GREEN_LED, HIGH);
  show("CAMERA OK", String("WiFi: ") + AP_NAME, String("Pass: ") + AP_PASSWORD, "http://" + ip.toString());
  Serial.printf("Join Wi-Fi \"%s\" (password %s), then open http://%s\n", AP_NAME, AP_PASSWORD, ip.toString().c_str());
}

void loop() {
  if (cameraOk) server.handleClient();
  delay(2);
}