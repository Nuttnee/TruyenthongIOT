#if defined(ESP8266)
  #include <ESP8266WiFi.h>
#else
  #include <WiFi.h>
#endif

#include <WiFiUdp.h>
#include <coap-simple.h>

/* ---------- CẤU HÌNH ---------- */

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Đổi thành địa chỉ IPv4 của máy chạy server Node.js
IPAddress serverIP(10, 246, 27, 209);

const int COAP_PORT = 5683;
const char* COAP_RESOURCE = "sensor/temp";

// true = bản tin CON, false = bản tin NON
const bool USE_CONFIRMABLE = true;

// Gửi dữ liệu mỗi 5 giây
const unsigned long SEND_INTERVAL = 5000;

/* ------------------------------- */

WiFiUDP udp;
Coap coap(udp);

unsigned long previousSendTime = 0;

void connectWiFi() {
  Serial.print("Dang ket noi Wi-Fi");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("Da ket noi Wi-Fi");
  Serial.print("IP cua ESP: ");
  Serial.println(WiFi.localIP());
}

void responseCallback(
  CoapPacket& packet,
  IPAddress ip,
  int port
) {
  Serial.print("Nhan phan hoi tu ");
  Serial.print(ip);
  Serial.print(":");
  Serial.println(port);

  Serial.print("Payload: ");

  for (int i = 0; i < packet.payloadlen; i++) {
    Serial.print((char)packet.payload[i]);
  }

  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  connectWiFi();

  coap.response(responseCallback);
  coap.start();

  Serial.println("CoAP client da khoi dong");

  if (USE_CONFIRMABLE) {
    Serial.println("Che do: CON");
  } else {
    Serial.println("Che do: NON");
  }
}

void loop() {
  // Xử lý các gói CoAP nhận được
  coap.loop();

  if (millis() - previousSendTime >= SEND_INTERVAL) {
    previousSendTime = millis();

    String payload = "temp=30.5";

    Serial.println();
    Serial.print("Dang gui CoAP ");
    Serial.print(USE_CONFIRMABLE ? "CON" : "NON");
    Serial.print(" POST /");
    Serial.print(COAP_RESOURCE);
    Serial.print(" - ");
    Serial.println(payload);

  coap.send(
  serverIP,
  COAP_PORT,
  COAP_RESOURCE,
  USE_CONFIRMABLE ? COAP_CON : COAP_NONCON,
  COAP_POST,
  nullptr,  // Không sử dụng Token
  0,        // Độ dài Token
  reinterpret_cast<const uint8_t*>(payload.c_str()),
  payload.length()
  );
  }
}
