# CampusPulse Gate Scanner (ESP32-CAM)

The scanner at the classroom entrance. It reads the QR code on the student's gate pass, sends it to
the CampusPulse server over Wi-Fi, and shows the result on the OLED, LEDs and buzzer.

## Wiring

Same as the component wiring sheet. Wire the OLED by its printed labels: many modules put GND
first, and the clock pin may be labelled SCK instead of SCL. The camera ribbon stays as it is.

| Component | Component pin | ESP32-CAM pin | Notes |
| --- | --- | --- | --- |
| 0.96" OLED (SSD1306, I2C) | VCC | 3V3 | 3.3 V power |
| | GND | GND | common ground |
| | SDA | GPIO 14 | I2C data |
| | SCK / SCL | GPIO 15 | I2C clock |
| 3-pin buzzer module | VCC | 3V3 | 3.3 V power |
| | GND | GND | common ground |
| | I/O | GPIO 13 | active-LOW (LOW = sound, HIGH = silent) |
| Green LED | long leg (+) | GPIO 12 | through a 220 Ω resistor |
| | short leg (−) | GND | |
| Red LED | long leg (+) | GPIO 2 | through a 220 Ω resistor |
| | short leg (−) | GND | |

Power the board from the 5 V 2 A adapter through the ESP32-CAM-MB programming board.

GPIO 12 decides the flash voltage when the board starts: keep the green LED's long leg on GPIO 12
and the short leg on GND (never the other way around, and never pull GPIO 12 to 3V3), or the board
will not boot.

## What the scanner shows

| Result | OLED (big text) | LED | Buzzer |
| --- | --- | --- | --- |
| Check-in on time | `CHECKED IN` + name + time | green | 1 short beep |
| Check-in after the cut-off | `LATE` + name + time | green | 2 short beeps |
| Check-out (second scan) | `CHECK-OUT` + name + time | green | 1 longer beep |
| Same pass again right away | `RECORDED` (nothing new saved) | green | 1 short beep |
| Wrong code, code older than 3 minutes, or used pass | `INVALID QR` / `EXPIRED` / `USED PASS` | red | 1 long beep |
| No Wi-Fi / server down | `NOT SENT` | red | 1 long beep |

Green means the scan was valid, red means it was rejected. The server decides every result and
sends the text, so messages can change without re-uploading the code.

## Uploading the code (Arduino IDE 2)

1. **Board package** — File › Preferences › *Additional boards manager URLs*, add
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
   Then Tools › Board › Boards Manager, search **esp32** (by Espressif Systems) and install
   **version 4.0.0**, the version this code was tested with. (Already installed on this computer.)
2. **Libraries** — Tools › Manage Libraries: install **Adafruit SSD1306** (accept *Adafruit GFX
   Library* and *Adafruit BusIO* when asked). The QR decoder is already inside the `src` folder of
   the sketch, so there is nothing else to install. (Already installed on this computer.)
3. **Settings** — open `CampusPulse_GateScanner/secrets.h` and check:
   - `WIFI_SSID` / `WIFI_PASSWORD`: a **2.4 GHz** network (a phone hotspot works).
   - `SERVER_URL`: `https://campuspulse-acnsths.vercel.app`
   - `DEVICE_API_KEY`: must be the same as the `DEVICE_API_KEY` of the Vercel project.
   - `DEVICE_ID`: a name for this scanner, e.g. `gate-1`.
   If `secrets.h` is missing, copy `secrets.example.h` to `secrets.h` and fill it in.
4. Open `CampusPulse_GateScanner/CampusPulse_GateScanner.ino`.
5. Tools › Board › esp32 › **AI Thinker ESP32-CAM**. Leave the other options as they are
   (Partition scheme: Huge APP, PSRAM on).
6. Put the ESP32-CAM on the MB board, plug the USB cable in, and pick its COM port under Tools › Port.
7. Click **Upload**. If it stops at `Connecting....`, hold the **IO0** button on the MB board, tap
   **RST**, release IO0, and upload again. When it says *Hard resetting*, press **RST** once.
8. Tools › Serial Monitor at **115200** baud shows the pin map, the Wi-Fi connection and every scan.

**ESP32-CAM wired to the MB board with jumpers** (instead of sitting on it): connect MB 5V→5V,
GND→GND, U0T→U0T, U0R→U0R, and set Tools › Upload Speed to **115200**. For uploading only, also
connect **IO0 to GND**, then press RST. Take that IO0 wire off after the upload and press RST again:
while the scanner runs, IO0 carries the camera clock and must not be connected to anything.

On start the screen shows `STARTING`, the green and red LEDs blink once and the buzzer chirps, then
the screen goes `WI-FI` → `SERVER` → `SCAN QR` (with the time and `Ready - gate-1`).

## Scanning tips

- Each code on the pass works for 3 minutes, and the app shows a new one by itself. A code that is
  older (for example a screenshot) gets `EXPIRED` and nothing is recorded. This check happens on
  the server, not in the scanner.
- Students open **Today's gate pass** in the app (or *Show bigger for scanning*) with the screen
  brightness up, and hold the phone still about 15–20 cm in front of the camera.
- Mount the scanner so the phone faces the camera straight on, away from direct sunlight.
- If codes read poorly at that distance, the OV2640 lens can be turned slightly to focus closer.
- The same code is ignored while it stays in front of the camera, so a student can't check out by
  accident.

## Camera page (aiming and focusing)

For 5 minutes after every start (the screen footer shows `Camera view on`), the scanner sends a
picture about every 1–2 seconds to the website. Open `/teacher/camera` while logged in as a teacher
(the page isn't linked from the menus) to see what the camera sees, with:

- **Brightness** (0–255) and **Sharpness**: watch sharpness while moving the pass or turning the lens.
- **Frames checked**, **QR codes found**, **Read OK** and **Couldn't read**, counted since the start.
  *Found* but not *read* means blur or glare; nothing *found* means the code is too small, too far
  or out of view.

Press RST to start another 5 minutes. Only the newest picture is kept. Set `CAMERA_PREVIEW_MS` to
`0` in the sketch to turn the pictures off.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| OLED stays dark | Check VCC→3V3, GND, SDA→GPIO14, SCK/SCL→GPIO15. The serial monitor says if it wasn't found. |
| Screen stuck on one picture (e.g. `STARTING`) while the website shows the scanner online, or no beeps | Use firmware 2.0.3 or newer. Older versions included library code that took GPIO13 (buzzer) and GPIO14 (OLED SDA) away whenever the camera started. Since 2.0.2 the scanner also restarts the screen by itself if its I2C line stops (loose jumper, noise). |
| `CAM ERROR` | Re-seat the camera ribbon; make sure the board is *AI Thinker ESP32-CAM*. |
| `No Wi-Fi - retrying` | The ESP32 only joins 2.4 GHz networks; check the name and password in `secrets.h`. |
| `Wrong device key` / `BAD KEY` | `DEVICE_API_KEY` in `secrets.h` must match the one on Vercel. |
| `Server offline` / `NOT SENT` | Check the internet connection and `SERVER_URL`. |
| Keeps restarting (brownout) | Use the 5 V 2 A adapter, not a laptop USB port. |
| Won't boot after wiring | Check that nothing pulls GPIO 12 high (see the wiring note). |

## Reliability data

Every 10 minutes between 6 AM and 6 PM the scanner reports its status (signal, uptime,
unreadable codes, failed requests, Wi-Fi drops, restarts). It also measures each scan's round
trip (QR read → answer on the screen). Teachers see this under **Trials** in the web app and can
download it as CSV.

## Licenses of bundled code

`src/` contains ESP32QRCodeReader by Alvaro Viebrantz (MIT, `src/LICENSE-ESP32QRCodeReader.md`)
and quirc by Daniel Beer (ISC, `src/quirc/LICENSE`). Changes from the originals: two include paths
were adjusted so they compile inside a sketch folder, the camera config uses the current `pin_sccb_*`
field names, an ESP-EYE-only block that reconfigured GPIO13/GPIO14 on every board was removed, and
the flood-fill stack in `src/openmv/collections.c` was enlarged from 255 bytes to 32 KB (the small
stack cut off any QR finder square taller than about 31 pixels, so large codes never decoded).
