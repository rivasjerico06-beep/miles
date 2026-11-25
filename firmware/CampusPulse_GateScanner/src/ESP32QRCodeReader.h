#ifndef ESP32_QR_CODE_ARDUINO_H_
#define ESP32_QR_CODE_ARDUINO_H_

#include "Arduino.h"
#include "ESP32CameraPins.h"
#include "esp_camera.h"

#ifndef QR_CODE_READER_STACK_SIZE
#define QR_CODE_READER_STACK_SIZE 40 * 1024
#endif

#ifndef QR_CODE_READER_TASK_PRIORITY
#define QR_CODE_READER_TASK_PRIORITY 5
#endif

enum QRCodeReaderSetupErr
{
  SETUP_OK,
  SETUP_NO_PSRAM_ERROR,
  SETUP_CAMERA_INIT_ERROR,
};

/* This structure holds the decoded QR-code data */
struct QRCodeData
{
  bool valid;
  int dataType;
  uint8_t payload[1024];
  int payloadLen;
};

class ESP32QRCodeReader
{
private:
  TaskHandle_t qrCodeTaskHandler;
  CameraPins pins;
  framesize_t frameSize;

public:
  camera_config_t cameraConfig;
  QueueHandle_t qrCodeQueue;
  bool begun = false;
  bool debug = false;

  // Counters for the website's camera page (written by the QR task, read by the sketch).
  volatile uint32_t framesChecked = 0;
  volatile uint32_t codesFound = 0;
  volatile uint32_t codesRead = 0;

  // One grayscale camera frame handed from the QR task to the sketch (buffer in PSRAM).
  uint8_t *snapshotBuffer = NULL;
  size_t snapshotCapacity = 0;
  size_t snapshotLength = 0;
  uint16_t snapshotWidth = 0;
  uint16_t snapshotHeight = 0;
  volatile bool snapshotWanted = false;
  volatile bool snapshotReady = false;

  // Constructor
  ESP32QRCodeReader();
  ESP32QRCodeReader(CameraPins pins);
  ESP32QRCodeReader(CameraPins pins, framesize_t frameSize);
  ESP32QRCodeReader(framesize_t frameSize);
  ~ESP32QRCodeReader();

  // Setup camera
  QRCodeReaderSetupErr setup();

  void begin();
  void beginOnCore(BaseType_t core);
  bool receiveQrCode(struct QRCodeData *qrCodeData, long timeoutMs);
  void end();

  // Asks the QR task to copy its next frame into snapshotBuffer (snapshotReady turns true).
  // Returns false if there is no memory for the copy.
  bool requestSnapshot();
  // Call when done with the copy, so a new one can be taken.
  void releaseSnapshot();

  void setDebug(bool);
};

#endif // ESP32_QR_CODE_ARDUINO_H_