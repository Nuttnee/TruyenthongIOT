#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Kiem tra day co dung IP may chay Mosquitto khong
const char* mqtt_server = "192.168.100.109";
const int mqtt_port = 1883;

const char* mqtt_user = "YOUR_MQTT_USERNAME";
const char* mqtt_pass = "YOUR_MQTT_PASSWORD";

const char* student_id = "10124238";
const char* mqtt_topic = "iot/lab1/10124238/sensor";

WiFiClient espClient;
PubSubClient client(espClient);

void setup_wifi() {
  Serial.print("Dang ket noi Wi-Fi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWi-Fi da ket noi");
  Serial.print("IP cua ESP: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    String clientId = "ESP32S3-" + String(student_id);

    Serial.print("Dang ket noi MQTT: ");
    Serial.println(mqtt_server);

    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("MQTT connected");
    } else {
      Serial.print("MQTT failed, rc=");
      Serial.println(client.state());
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  StaticJsonDocument<200> doc;
  doc["temp"] = random(250, 350) / 10.0;
  doc["hum"] = random(400, 800) / 10.0;

  char payload[128];
  serializeJson(doc, payload, sizeof(payload));

  if (client.publish(mqtt_topic, payload)) {
    Serial.print("Da gui: ");
    Serial.println(payload);
  } else {
    Serial.println("Gui MQTT that bai");
  }

  delay(5000);
}
