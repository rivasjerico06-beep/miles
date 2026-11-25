// Copy this file to secrets.h and fill in your values.
// secrets.h is ignored by git so your Wi-Fi password and device key stay private.
#pragma once

// Wi-Fi the scanner joins (2.4 GHz only; the ESP32 cannot join 5 GHz networks).
#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// Address of the CampusPulse web app on Vercel, without a trailing slash.
#define SERVER_URL "https://your-project.vercel.app"

// Must match the DEVICE_API_KEY environment variable of the Vercel project.
#define DEVICE_API_KEY "paste-the-device-key-here"

// A short name for this scanner. It appears in the attendance logs.
#define DEVICE_ID "gate-1"
