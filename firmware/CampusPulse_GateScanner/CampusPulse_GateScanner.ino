/*
  CampusPulse Gate Scanner (ESP32-CAM)

  Reads the student's daily QR gate pass, sends it to the CampusPulse server over
  Wi-Fi and shows the result on the 0.96" OLED, the green/red LEDs and the buzzer.
  The first valid scan of the day is the check-in (on time or late), the second
  one is the check-out. The server decides; this sketch only displays the answer.

  Arduino IDE settings
    Board package : esp32 by Espressif Systems, version 2.0.17
    Board         : AI Thinker ESP32-CAM
    Libraries     : Adafruit SSD1306 + Adafruit GFX Library (Library Manager)
    QR decoder    : bundled in the src/ folder (ESP32QRCodeReader + quirc)
    Your settings : secrets.h (Wi-Fi name/password, server URL, device key)

  Wiring
    OLED       VCC -> 3V3   GND -> GND   SDA -> GPIO14   SCK/SCL -> GPIO15
    Buzzer     VCC -> 3V3   GND -> GND   I/O -> GPIO13   (active-LOW: LOW = sound)
    Green LED  long leg (+) -> 220 ohm -> GPIO12, short leg (-) -> GND
    Red LED    long leg (+) -> 220 ohm -> GPIO2,  short leg (-) -> GND
*/

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <time.h>
#include "esp_system.h"
#include "img_converters.h"
#include "mbedtls/base64.h"
#include "secrets.h"
#include "src/ESP32QRCodeReader.h"

#define FIRMWARE_VERSION "2.0.6"

// ---------------- Pins (from the wiring table) ----------------
const int PIN_GREEN_LED = 12;
const int PIN_RED_LED = 2;
const int PIN_BUZZER = 13;     // active-LOW buzzer module
const int PIN_OLED_SDA = 14;
const int PIN_OLED_SCL = 15;  // the OLED pin may be labelled SCK
const int PIN_FLASH_LED = 4;   // on-board flash LED, kept off (it causes glare on phone screens)

// ---------------- Behaviour ----------------
const unsigned long SAME_CODE_COOLDOWN_MS = 8000;  // ignore the same code while it stays in front of the camera
const unsigned long RESULT_SHOW_MS = 2500;         // how long a scan result stays on the screen
const unsigned long HEARTBEAT_EVERY_MS = 10UL * 60UL * 1000UL;  // status report for the Trials page
const int HEARTBEAT_FROM_HOUR = 6;                 // heartbeats only between 6:00 AM and 6:00 PM (Asia/Manila)
const int HEARTBEAT_UNTIL_HOUR = 18;
const unsigned long WIFI_RETRY_EVERY_MS = 10000;
const uint16_t HTTP_TIMEOUT_MS = 15000;
// 400x296. Larger grayscale frames (VGA) arrive short on the ESP32-CAM ("cam_hal: FB-SIZE ...")
// and are all dropped, because the camera data can't be copied into PSRAM fast enough.
const framesize_t CAMERA_FRAME_SIZE = FRAMESIZE_CIF;
const uint32_t OLED_I2C_HZ = 100000;                  // standard speed: more margin on jumper wires
const unsigned long OLED_RECOVERY_GAP_MS = 3000;      // how often a silent screen is restarted
// Camera page on the website (teacher-only): after each start the scanner sends a picture about
// every second or two for this long, so it can be aimed and focused. 0 turns it off.
const unsigned long CAMERA_PREVIEW_MS = 5UL * 60UL * 1000UL;
const unsigned long CAMERA_FRAME_GAP_MS = 1000;
const int CAMERA_JPEG_QUALITY = 60;

// ---------------- Hardware objects ----------------
Adafruit_SSD1306 oled(128, 64, &Wire, -1, OLED_I2C_HZ, OLED_I2C_HZ);
ESP32QRCodeReader reader(CAMERA_MODEL_AI_THINKER, CAMERA_FRAME_SIZE);
WiFiClientSecure tlsClient;

bool oledReady = false;
uint8_t oledAddress = 0x3C;  // a few modules use 0x3D; detected at start-up
unsigned long lastOledRecoveryAt = 0;
uint32_t oledRecoveries = 0;
bool cameraReady = false;
bool everConnected = false;
bool wasConnected = false;
bool needServerCheck = false;  // set when Wi-Fi (re)connects: ping the server and report in
bool bootReported = false;     // the first report after power-on is marked as a boot
int serverState = 0;           // 0 = unknown, 1 = reachable, -1 = unreachable, -2 = wrong device key
unsigned long lastCameraRetryAt = 0;

// Camera preview for the website.
unsigned long previewUntil = 0;
unsigned long lastFrameSentAt = 0;
uint32_t frameSeq = 0;
uint32_t fpsFramesAt = 0;
unsigned long fpsSince = 0;
float cameraFps = 0;

// Counters reported to the server for the reliability data (scan accuracy, MTBF).
uint32_t statScans = 0, statAccepted = 0, statRejected = 0;
uint32_t statDecodeFails = 0, statHttpErrors = 0, statWifiReconnects = 0;

// Round-trip time of the last scan, sent along with the next request (scan response time).
long pendingScanId = 0;
unsigned long pendingRoundTripMs = 0;

String lastCode = "";
unsigned long lastCodeAt = 0;
String lastReadError = "";  // why the last QR code that was seen couldn't be read (for the camera page)
unsigned long lastHeartbeatAt = 0;
unsigned long lastWifiAttemptAt = 0;
unsigned long lastIdleDrawAt = 0;

// =====================================================================
//  Buzzer and LEDs
// =====================================================================
void buzzerOn() { digitalWrite(PIN_BUZZER, LOW); }
void buzzerOff() { digitalWrite(PIN_BUZZER, HIGH); }

void beep(int onMs, int times = 1, int gapMs = 120) {
  for (int i = 0; i < times; i++) {
    buzzerOn();
    delay(onMs);
    buzzerOff();
    if (i + 1 < times) delay(gapMs);
  }
}

void setLeds(bool green, bool red) {
  digitalWrite(PIN_GREEN_LED, green ? HIGH : LOW);
  digitalWrite(PIN_RED_LED, red ? HIGH : LOW);
}

// =====================================================================
//  OLED
// =====================================================================
String fitText(String text, unsigned int maxChars) {
  text.trim();
  if (text.length() <= maxChars) return text;
  return text.substring(0, maxChars - 1) + ".";
}

// Splits text into two lines of at most `width` characters, breaking at a space.
void splitTwoLines(const String& text, unsigned int width, String& first, String& second) {
  String t = text;
  t.trim();
  if (t.length() <= width) {
    first = t;
    second = "";
    return;
  }
  int cut = t.lastIndexOf(' ', width);
  if (cut <= 0) cut = width;
  first = t.substring(0, cut);
  second = t.substring(cut);
  second.trim();
  second = fitText(second, width);
}

void drawCentered(const String& text, int y, int size) {
  int width = text.length() * 6 * size;  // the built-in font is 6 px wide per character
  int x = (128 - width) / 2;
  if (x < 0) x = 0;
  oled.setTextSize(size);
  oled.setCursor(x, y);
  oled.print(text);
}

String clockText() {
  struct tm now;
  if (!getLocalTime(&now, 0)) return "--:--";
  char buf[12];
  int hour12 = now.tm_hour % 12 == 0 ? 12 : now.tm_hour % 12;
  snprintf(buf, sizeof(buf), "%d:%02d %s", hour12, now.tm_min, now.tm_hour < 12 ? "AM" : "PM");
  return String(buf);
}

bool oledResponds() {
  Wire.beginTransmission(oledAddress);
  return Wire.endTransmission() == 0;
}

// If the screen's I2C bus stops working (a loose jumper, electrical noise, or other code taking over
// its pins), the screen keeps showing its last picture while the scanner keeps working.
// This frees the line, restarts the I2C bus and sends the screen its settings again.
bool recoverOled() {
  if (lastOledRecoveryAt != 0 && millis() - lastOledRecoveryAt < OLED_RECOVERY_GAP_MS) return false;
  lastOledRecoveryAt = millis();
  Wire.end();

  // Nine clock pulses let the screen finish whatever byte it was stuck in, then a STOP.
  pinMode(PIN_OLED_SDA, INPUT_PULLUP);
  pinMode(PIN_OLED_SCL, OUTPUT_OPEN_DRAIN | PULLUP);
  digitalWrite(PIN_OLED_SCL, HIGH);
  for (int i = 0; i < 9; i++) {
    digitalWrite(PIN_OLED_SCL, LOW);
    delayMicroseconds(10);
    digitalWrite(PIN_OLED_SCL, HIGH);
    delayMicroseconds(10);
  }
  digitalWrite(PIN_OLED_SCL, LOW);
  pinMode(PIN_OLED_SDA, OUTPUT_OPEN_DRAIN | PULLUP);
  digitalWrite(PIN_OLED_SDA, LOW);
  delayMicroseconds(10);
  digitalWrite(PIN_OLED_SCL, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_OLED_SDA, HIGH);
  delayMicroseconds(10);

  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL, OLED_I2C_HZ);
  if (!oledResponds()) return false;
  oled.begin(SSD1306_SWITCHCAPVCC, oledAddress, false, false);
  oledRecoveries++;
  Serial.printf("[oled] screen was not responding - restarted it (%u so far)\n", (unsigned)oledRecoveries);
  return true;
}

// Header bar (name + clock), one big line, two detail lines and a footer.
void drawScreen(const String& big, const String& detail, const String& footer) {
  if (!oledReady) return;
  if (!oledResponds() && !recoverOled()) return;  // tried again on the next screen update
  oled.clearDisplay();

  oled.fillRect(0, 0, 128, 11, SSD1306_WHITE);
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_BLACK);
  oled.setCursor(2, 2);
  oled.print("CampusPulse");
  String clock = clockText();
  oled.setCursor(126 - clock.length() * 6, 2);
  oled.print(clock);

  oled.setTextColor(SSD1306_WHITE);
  drawCentered(fitText(big, 10), 15, 2);

  String first, second;
  splitTwoLines(detail, 21, first, second);
  drawCentered(first, 35, 1);
  drawCentered(second, 44, 1);
  drawCentered(fitText(footer, 21), 55, 1);
  oled.display();
}

bool previewActive() {
  return previewUntil != 0 && (long)(previewUntil - millis()) > 0;
}

void drawIdle() {
  String footer;
  if (WiFi.status() != WL_CONNECTED) footer = "No Wi-Fi - retrying";
  else if (serverState == -2) footer = "Wrong device key";
  else if (serverState == -1) footer = "Server offline";
  else if (cameraReady && previewActive()) footer = String("Camera view on ") + String((previewUntil - millis()) / 60000 + 1) + "m";
  else footer = String("Ready - ") + DEVICE_ID;
  if (!cameraReady) drawScreen("CAM ERROR", "Camera not detected - retrying", "Check ribbon and power");
  else drawScreen("SCAN QR", "Show your CampusPulse gate pass", footer);
  lastIdleDrawAt = millis();
}

// =====================================================================
//  Small JSON helpers (the server sends short, flat JSON objects)
// =====================================================================
String jsonEscape(const String& value) {
  String out;
  out.reserve(value.length() + 8);
  for (unsigned int i = 0; i < value.length(); i++) {
    char c = value[i];
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if ((uint8_t)c < 0x20) {
      char buf[8];
      snprintf(buf, sizeof(buf), "\\u%04x", (unsigned int)(uint8_t)c);
      out += buf;
    } else {
      out += c;
    }
  }
  return out;
}

int findJsonValue(const String& json, const char* key) {
  String pattern = String("\"") + key + "\"";
  int i = json.indexOf(pattern);
  if (i < 0) return -1;
  i = json.indexOf(':', i + pattern.length());
  if (i < 0) return -1;
  i++;
  while (i < (int)json.length() && json[i] == ' ') i++;
  return i < (int)json.length() ? i : -1;
}

String jsonString(const String& json, const char* key) {
  int i = findJsonValue(json, key);
  if (i < 0 || json[i] != '"') return "";
  i++;
  String out;
  while (i < (int)json.length()) {
    char c = json[i++];
    if (c == '"') break;
    if (c == '\\' && i < (int)json.length()) {
      char escaped = json[i++];
      if (escaped == 'u') {
        i += 4;
        out += '?';
      } else if (escaped == 'n' || escaped == 't' || escaped == 'r') {
        out += ' ';
      } else {
        out += escaped;
      }
    } else {
      out += c;
    }
  }
  return out;
}

long jsonNumber(const String& json, const char* key) {
  int i = findJsonValue(json, key);
  if (i < 0) return 0;
  return json.substring(i).toInt();
}

// =====================================================================
//  HTTPS to the CampusPulse server
// =====================================================================
String serverUrl(const char* path) {
  String base = SERVER_URL;
  while (base.endsWith("/")) base.remove(base.length() - 1);
  return base + path;
}

// Returns the HTTP status (> 0) or a negative error. A request is retried once on a fresh
// connection only when it never reached the server (stale keep-alive connection).
int httpRequest(const char* method, const char* path, const String& body, String& response) {
  response = "";
  if (WiFi.status() != WL_CONNECTED) return -100;
  for (int attempt = 0; attempt < 2; attempt++) {
    HTTPClient http;
    http.setReuse(true);
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.setConnectTimeout(8000);
    if (!http.begin(tlsClient, serverUrl(path))) {
      tlsClient.stop();
      continue;
    }
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Api-Key", DEVICE_API_KEY);
    http.addHeader("X-Device-Id", DEVICE_ID);
    int status = strcmp(method, "GET") == 0 ? http.GET() : http.POST(body);
    if (status > 0) {
      response = http.getString();
      http.end();
      return status;
    }
    http.end();
    tlsClient.stop();
    bool neverSent = status == HTTPC_ERROR_CONNECTION_REFUSED || status == HTTPC_ERROR_SEND_HEADER_FAILED ||
                     status == HTTPC_ERROR_SEND_PAYLOAD_FAILED || status == HTTPC_ERROR_NOT_CONNECTED;
    if (!neverSent) return status;
  }
  return -1;
}

String prevTimingJson() {
  if (pendingScanId <= 0) return "";
  return String(",\"prev\":{\"scanId\":") + String(pendingScanId) + ",\"ms\":" + String(pendingRoundTripMs) + "}";
}

const char* resetReasonName() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "power_on";
    case ESP_RST_EXT: return "external";
    case ESP_RST_SW: return "software";
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_INT_WDT: return "interrupt_watchdog";
    case ESP_RST_TASK_WDT: return "task_watchdog";
    case ESP_RST_WDT: return "watchdog";
    case ESP_RST_DEEPSLEEP: return "deep_sleep";
    case ESP_RST_BROWNOUT: return "brownout";
    case ESP_RST_SDIO: return "sdio";
    default: return "unknown";
  }
}

void pingServer() {
  String response;
  int status = httpRequest("GET", "/api/device/ping", "", response);
  if (status == 200) serverState = 1;
  else if (status == 401) serverState = -2;
  else serverState = -1;
  Serial.printf("[ping] HTTP %d %s\n", status, response.c_str());
}

void sendHeartbeat(bool boot) {
  String body = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"fw\":\"" FIRMWARE_VERSION "\"";
  body += String(",\"boot\":") + (boot ? "true" : "false");
  if (boot) body += String(",\"resetReason\":\"") + resetReasonName() + "\"";
  body += ",\"uptimeS\":" + String(millis() / 1000);
  body += ",\"rssi\":" + String(WiFi.RSSI());
  body += ",\"freeHeap\":" + String(ESP.getFreeHeap());
  body += ",\"freePsram\":" + String(ESP.getFreePsram());
  body += ",\"scans\":" + String(statScans);
  body += ",\"accepted\":" + String(statAccepted);
  body += ",\"rejected\":" + String(statRejected);
  body += ",\"decodeFails\":" + String(statDecodeFails);
  body += ",\"httpErrors\":" + String(statHttpErrors);
  body += ",\"wifiReconnects\":" + String(statWifiReconnects);
  body += prevTimingJson();
  body += "}";

  String response;
  int status = httpRequest("POST", "/api/device/heartbeat", body, response);
  if (status > 0) pendingScanId = 0;  // the pending timing went out with this request
  if (status == 200) serverState = 1;
  else if (status == 401) serverState = -2;
  else {
    serverState = -1;
    statHttpErrors++;
  }
  lastHeartbeatAt = millis();
  Serial.printf("[heartbeat] HTTP %d\n", status);
}

// =====================================================================
//  Camera preview for the website (teacher-only camera page)
// =====================================================================
// Average brightness of the whole picture, and a sharpness score (average edge strength) in the
// middle half, where the QR code is held. Higher sharpness = better focus.
void measureFrame(const uint8_t* px, int w, int h, int& brightness, int& sharpness) {
  uint32_t sum = 0, n = 0;
  for (int i = 0; i < w * h; i += 7) {
    sum += px[i];
    n++;
  }
  brightness = n ? sum / n : 0;
  uint32_t edges = 0, m = 0;
  for (int y = h / 4; y < h * 3 / 4; y += 2) {
    const uint8_t* row = px + y * w;
    for (int x = w / 4; x < w * 3 / 4; x += 2) {
      edges += abs((int)row[x + 1] - (int)row[x]) + abs((int)row[x + w] - (int)row[x]);
      m++;
    }
  }
  sharpness = m ? (edges * 10) / m : 0;
}

void sendCameraFrame() {
  const uint8_t* px = reader.snapshotBuffer;
  int w = reader.snapshotWidth;
  int h = reader.snapshotHeight;
  int brightness = 0, sharpness = 0;
  measureFrame(px, w, h, brightness, sharpness);

  uint8_t* jpg = NULL;
  size_t jpgLen = 0;
  if (!fmt2jpg((uint8_t*)px, reader.snapshotLength, w, h, PIXFORMAT_GRAYSCALE, CAMERA_JPEG_QUALITY, &jpg, &jpgLen) || jpg == NULL) {
    Serial.println("[camera view] JPEG encoding failed");
    return;
  }
  size_t needed = 0;
  mbedtls_base64_encode(NULL, 0, &needed, jpg, jpgLen);  // asks for the encoded size
  unsigned char* b64 = (unsigned char*)ps_malloc(needed + 1);
  size_t b64Len = 0;
  if (b64 == NULL || mbedtls_base64_encode(b64, needed + 1, &b64Len, jpg, jpgLen) != 0) {
    free(jpg);
    if (b64 != NULL) free(b64);
    Serial.println("[camera view] not enough memory");
    return;
  }
  free(jpg);
  b64[b64Len] = '\0';

  // How many frames per second the QR reader checks, measured between pictures.
  unsigned long now = millis();
  uint32_t frames = reader.framesChecked;
  if (fpsSince != 0 && now > fpsSince) cameraFps = (frames - fpsFramesAt) * 1000.0f / (now - fpsSince);
  fpsSince = now;
  fpsFramesAt = frames;
  frameSeq++;

  String body;
  body.reserve(b64Len + 512);
  body += String("{\"deviceId\":\"") + DEVICE_ID + "\",\"width\":" + String(w) + ",\"height\":" + String(h);
  body += ",\"seq\":" + String(frameSeq);
  body += ",\"stats\":{\"fw\":\"" FIRMWARE_VERSION "\"";
  body += ",\"frames\":" + String(frames);
  body += ",\"fps\":" + String(cameraFps, 1);
  body += ",\"found\":" + String(reader.codesFound);
  body += ",\"read\":" + String(reader.codesRead);
  body += ",\"decodeFails\":" + String(statDecodeFails);
  if (lastReadError.length() > 0) body += ",\"lastError\":\"" + jsonEscape(lastReadError.substring(0, 40)) + "\"";
  body += ",\"scans\":" + String(statScans);
  body += ",\"brightness\":" + String(brightness);
  body += ",\"sharpness\":" + String(sharpness);
  body += ",\"previewLeftS\":" + String(previewActive() ? (previewUntil - millis()) / 1000 : 0);
  body += ",\"uptimeS\":" + String(millis() / 1000);
  body += ",\"rssi\":" + String(WiFi.RSSI());
  body += "},\"jpeg\":\"";
  body += (const char*)b64;
  body += "\"}";
  free(b64);

  String response;
  int status = httpRequest("POST", "/api/device/snapshot", body, response);
  Serial.printf("[camera view] picture %u: %u bytes, brightness %d, sharpness %d, HTTP %d\n",
                (unsigned)frameSeq, (unsigned)jpgLen, brightness, sharpness, status);
}

// Called from loop(): asks the QR task for a frame, then sends it when the copy is ready.
void serviceCameraPreview() {
  if (!cameraReady || !previewActive() || WiFi.status() != WL_CONNECTED) return;
  if (reader.snapshotReady) {
    sendCameraFrame();
    reader.releaseSnapshot();
    lastFrameSentAt = millis();
  } else if (!reader.snapshotWanted && millis() - lastFrameSentAt > CAMERA_FRAME_GAP_MS) {
    if (!reader.requestSnapshot()) previewUntil = 0;  // no memory for pictures: stop the preview
  }
}

bool inSchoolHours() {
  struct tm now;
  if (!getLocalTime(&now, 0)) return true;  // clock not synced yet: send anyway
  return now.tm_hour >= HEARTBEAT_FROM_HOUR && now.tm_hour < HEARTBEAT_UNTIL_HOUR;
}

// =====================================================================
//  Scan handling
// =====================================================================
void showResult(bool accepted, const String& big, const String& detail, const String& footer, const String& sound) {
  drawScreen(big, detail, footer);
  setLeds(accepted, !accepted);  // green = valid scan, red = rejected
  unsigned long shownAt = millis();
  if (sound == "late") beep(120, 2);
  else if (sound == "out") beep(300);
  else if (sound == "error") beep(700);
  else beep(150);
  while (millis() - shownAt < RESULT_SHOW_MS) delay(20);
  setLeds(false, false);
}

void handleScan(const String& code) {
  statScans++;
  setLeds(false, false);
  drawScreen("CHECKING", "Please hold still...", "");

  String body = String("{\"token\":\"") + jsonEscape(code) + "\",\"action\":\"auto\",\"deviceId\":\"" + DEVICE_ID +
                "\",\"fw\":\"" FIRMWARE_VERSION "\"" + prevTimingJson() + "}";
  unsigned long startedAt = millis();
  String response;
  int status = httpRequest("POST", "/api/attendance/qr/verify", body, response);
  unsigned long roundTripMs = millis() - startedAt;
  Serial.printf("[scan] HTTP %d in %lu ms: %s\n", status, roundTripMs, response.c_str());

  if (status <= 0) {
    statHttpErrors++;
    serverState = -1;
    bool online = WiFi.status() == WL_CONNECTED;
    showResult(false, "NOT SENT", online ? "Server did not answer" : "No Wi-Fi connection", "Please scan again", "error");
    return;
  }

  pendingScanId = 0;  // any earlier timing was delivered with this request
  long scanId = jsonNumber(response, "scanId");
  if (scanId > 0) {
    pendingScanId = scanId;
    pendingRoundTripMs = roundTripMs;
  }

  bool accepted = status == 200 || status == 201;
  if (status == 401) serverState = -2;
  else serverState = 1;

  String big = jsonString(response, "line1");
  String detail = jsonString(response, "line2");
  String footer = jsonString(response, "line3");
  String sound = jsonString(response, "beep");
  if (big.length() == 0) big = accepted ? "ACCEPTED" : (status == 401 ? "BAD KEY" : "REJECTED");
  if (detail.length() == 0) detail = jsonString(response, "error");
  if (detail.length() == 0) detail = String("Server code ") + String(status);
  if (sound.length() == 0) sound = accepted ? "ok" : "error";

  if (accepted) statAccepted++;
  else statRejected++;
  showResult(accepted, big, detail, footer, sound);
}

void drainQueue() {
  static struct QRCodeData discarded;
  while (reader.receiveQrCode(&discarded, 0)) {
  }
}

// =====================================================================
//  Wi-Fi
// =====================================================================
void connectWifi(unsigned long timeoutMs) {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // faster replies; the scanner is always powered
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long startedAt = millis();
  int dots = 0;
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < timeoutMs) {
    drawScreen("WI-FI", String("Connecting to ") + WIFI_SSID, String("Please wait") + String("...").substring(0, dots % 4));
    dots++;
    delay(500);
  }
  lastWifiAttemptAt = millis();
}

void maintainWifi() {
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wasConnected) {
    if (everConnected) statWifiReconnects++;
    everConnected = true;
    needServerCheck = true;  // report to the website right away, not only at the next heartbeat
    Serial.printf("[wifi] connected, IP %s, RSSI %d\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  }
  wasConnected = connected;
  if (!connected && millis() - lastWifiAttemptAt > WIFI_RETRY_EVERY_MS) {
    lastWifiAttemptAt = millis();
    Serial.println("[wifi] reconnecting...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// =====================================================================
//  Camera
// =====================================================================
// The camera can fail to start while the power supply is still settling, so it is tried
// a few times at start-up and then again every 15 seconds until it works.
bool startCamera(int attempts) {
  for (int attempt = 1; attempt <= attempts; attempt++) {
    QRCodeReaderSetupErr status = reader.setup();
    if (status == SETUP_OK) {
      sensor_t* sensor = esp_camera_sensor_get();
      if (sensor != NULL) {
        sensor->set_contrast(sensor, 1);  // crisper edges on phone screens
        sensor->set_vflip(sensor, 1);     // this module's picture comes out mirrored top-to-bottom; QR codes can't be read from a mirror image
      }
      reader.begin();  // decoding runs in its own task on core 0, the network code stays on core 1
      Serial.println("[camera] ready");
      return true;
    }
    if (status == SETUP_NO_PSRAM_ERROR) {
      Serial.println("[camera] no PSRAM - select the AI Thinker ESP32-CAM board");
      return false;
    }
    Serial.printf("[camera] not detected (attempt %d of %d) - check the ribbon and the 5V power\n", attempt, attempts);
    delay(1500);
  }
  return false;
}

// =====================================================================
//  Setup and loop
// =====================================================================
void setup() {
  // Silence the active-LOW buzzer before anything else.
  digitalWrite(PIN_BUZZER, HIGH);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, HIGH);
  pinMode(PIN_GREEN_LED, OUTPUT);
  pinMode(PIN_RED_LED, OUTPUT);
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, LOW);
  setLeds(false, false);

  Serial.begin(115200);
  delay(200);
  Serial.printf("\nCampusPulse Gate Scanner %s (%s), reset: %s\n", FIRMWARE_VERSION, DEVICE_ID, resetReasonName());

  Serial.printf("Pins: OLED SDA=GPIO%d SCL=GPIO%d | buzzer=GPIO%d (active-LOW) | green LED=GPIO%d | red LED=GPIO%d\n",
                PIN_OLED_SDA, PIN_OLED_SCL, PIN_BUZZER, PIN_GREEN_LED, PIN_RED_LED);

  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL, OLED_I2C_HZ);
  if (!oledResponds()) {
    oledAddress = 0x3D;  // a few modules use 0x3D
    if (!oledResponds()) oledAddress = 0x3C;
  }
  oledReady = oled.begin(SSD1306_SWITCHCAPVCC, oledAddress, false, false);
  if (!oledResponds()) Serial.println("[oled] not found - check VCC=3V3, GND, SDA=GPIO14, SCK/SCL=GPIO15");
  drawScreen("STARTING", "Camera and Wi-Fi", String("Firmware ") + FIRMWARE_VERSION);

  delay(500);  // let the 5V supply settle before the camera draws current
  cameraReady = startCamera(3);
  lastCameraRetryAt = millis();
  if (!cameraReady) {
    drawScreen("CAM ERROR", "Camera not detected - retrying", "Check ribbon and power");
    setLeds(false, true);
    beep(700);
    delay(2000);
    setLeds(false, false);
  }

  // LED and buzzer self-test.
  setLeds(true, false);
  delay(250);
  setLeds(false, true);
  delay(250);
  setLeds(false, false);
  beep(60);

  tlsClient.setInsecure();  // the device key authenticates the scanner; see README for certificate pinning
  tlsClient.setHandshakeTimeout(15);

  connectWifi(20000);
  configTzTime("PHT-8", "pool.ntp.org", "time.google.com", "time.cloudflare.com");  // Asia/Manila (UTC+8)
  drawIdle();  // the server check runs from loop() as soon as Wi-Fi is up
}

void loop() {
  maintainWifi();

  // Whenever Wi-Fi (re)connects: check the server and report in (the first report marks the boot).
  if (needServerCheck && WiFi.status() == WL_CONNECTED) {
    needServerCheck = false;
    drawScreen("SERVER", "Checking connection", SERVER_URL);
    pingServer();
    sendHeartbeat(!bootReported);
    if (!bootReported && CAMERA_PREVIEW_MS > 0) previewUntil = millis() + CAMERA_PREVIEW_MS;  // camera page after each start
    bootReported = true;
    drawIdle();
  }

  serviceCameraPreview();

  if (!cameraReady && millis() - lastCameraRetryAt > 15000) {
    lastCameraRetryAt = millis();
    cameraReady = startCamera(1);
    drawIdle();
  }

  static struct QRCodeData qr;
  if (cameraReady && reader.receiveQrCode(&qr, 50)) {
    if (!qr.valid) {
      statDecodeFails++;  // a QR code was seen but could not be decoded (blur, glare, too far)
      lastReadError = String((const char*)qr.payload);
      Serial.printf("[qr] code seen but not readable: %s\n", lastReadError.c_str());
    } else {
      String code = String((const char*)qr.payload);
      code.trim();
      unsigned long now = millis();
      bool sameAsLast = code == lastCode && now - lastCodeAt < SAME_CODE_COOLDOWN_MS;
      if (code.length() > 0 && code.length() <= 200 && !sameAsLast) {
        handleScan(code);
        lastCode = code;
        drainQueue();
        drawIdle();
      }
      lastCodeAt = millis();  // keeps the cooldown going while the same code stays in view
    }
  }

  if (WiFi.status() == WL_CONNECTED && millis() - lastHeartbeatAt > HEARTBEAT_EVERY_MS && inSchoolHours()) {
    sendHeartbeat(false);
    drawIdle();
  }

  if (millis() - lastIdleDrawAt > 1000) drawIdle();  // keeps the clock and Wi-Fi status fresh
}
