#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

// ===== LED RGB có sẵn trên board ESP32-S3 =====
#define RGB_PIN    48   // DevKitC v1.0 = 48, v1.1 = 38
#define BRIGHTNESS 40   // 0-255, để thấp cho đỡ chói
#define BUTTON_PIN 4    // chân an toàn trên S3

#define SERVICE_UUID        "12345678-1234-1234-1234-123456789000"
#define CHARACTERISTIC_UUID "12345678-1234-1234-1234-123456789001"

BLEServer *pServer;

// Tương thích Arduino core 2.x và 3.x
void setColor(uint8_t r, uint8_t g, uint8_t b) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  rgbLedWrite(RGB_PIN, r, g, b);
#else
  neopixelWrite(RGB_PIN, r, g, b);
#endif
}

class ServerCallback : public BLEServerCallbacks {
  void onConnect(BLEServer *s) {
    Serial.println("Phone connected");
  }
  void onDisconnect(BLEServer *s) {
    Serial.println("Phone disconnected -> advertising again");
    BLEDevice::startAdvertising();
  }
};

class CommandCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String value = pCharacteristic->getValue().c_str();
    value.trim();
    value.toUpperCase();

    Serial.print("Received: ");
    Serial.println(value);

    if (value == "RED") {
      setColor(BRIGHTNESS, 0, 0);
    } else if (value == "GREEN") {
      setColor(0, BRIGHTNESS, 0);
    } else if (value == "BLUE") {
      setColor(0, 0, BRIGHTNESS);
    } else if (value == "WHITE") {
      setColor(BRIGHTNESS, BRIGHTNESS, BRIGHTNESS);
    } else if (value == "OFF") {
      setColor(0, 0, 0);
    } else {
      Serial.println("Unknown command!");
      return;
    }
    Serial.println("LED -> " + value);
  }
};

void setup() {
  Serial.begin(115200);
  delay(1000);  // chờ USB Serial của S3 sẵn sàng

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  setColor(0, 0, 0);

  // ===== BLE =====
  BLEDevice::init("BopBop");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallback());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  BLECharacteristic *pCharacteristic =
      pService->createCharacteristic(
        CHARACTERISTIC_UUID,
        BLECharacteristic::PROPERTY_WRITE
      );
  pCharacteristic->setCallbacks(new CommandCallback());
  pService->start();

  // ===== Advertising: tên ở gói chính, UUID ở scan response =====
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();

  BLEAdvertisementData advData;
  advData.setFlags(0x06);
  advData.setName("BopBop");
  pAdvertising->setAdvertisementData(advData);

  BLEAdvertisementData scanData;
  scanData.setCompleteServices(BLEUUID(SERVICE_UUID));
  pAdvertising->setScanResponseData(scanData);

  pAdvertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  // Nháy xanh lá 1 lần để báo đã khởi động xong
  setColor(0, BRIGHTNESS, 0);
  delay(300);
  setColor(0, 0, 0);

  Serial.println("--------------------------");
  Serial.println("BopBop started");
  Serial.println("Commands: RED, GREEN, BLUE, WHITE, OFF");
  Serial.println("--------------------------");
}

void loop() {
}