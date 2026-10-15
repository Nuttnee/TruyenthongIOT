String command = "";

void setup() {
  Serial.begin(9600);
}

void loop() {
  if (Serial.available() > 0) {
    command = Serial.readStringUntil('\n');
    command.trim(); // Xóa khoảng trắng và ký tự xuống dòng \r

    if (command.length() > 0) {
      if (command == "AT") {
        Serial.println("OK");
      }
      else if (command.startsWith("AT+NAME=") || command == "AT+NAME?") {
        Serial.println("OK");
      }
      else if (command.startsWith("AT+PSWD=") || command.startsWith("AT+PASWD=")) {
        Serial.println("OK");
      }
      else if (command == "AT+VERSION?") {
        Serial.println("+VERSION:2.0 OK");
      }
      else if (command.startsWith("AT+UART=") || command.startsWith("AT+UART")) {
        Serial.println("OK");
      }
      else if (command == "AT+ORGL") {
        Serial.println("OK");
      }
      else if (command.startsWith("AT+ROLE=")) {
        Serial.println("OK");
      }
      else if (command.startsWith("AT+MODE=")) { // Đã bổ sung
        Serial.println("OK");
      }
      else if (command.startsWith("AT+BIND=") || command.startsWith("AT+BIND-")) { // Đã bổ sung
        Serial.println("OK");
      }
      else if (command.startsWith("AT+LINK=") || command.startsWith("AT+LINK")) { // Đã bổ sung
        Serial.println("OK");
      }
      else if (command == "AT+ADDR?") {
        Serial.println("ADDR:123:34:232321");
      }
      else {
        Serial.println("ERROR");
      }
    }
  }
}
