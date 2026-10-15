const int ledPin = 13;

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600); // Đón nhận tín hiệu từ Bluetooth HC2
}

void loop() {
  if (Serial.available() > 0) {
    char data = Serial.read();
    if (data == '1') {
      digitalWrite(ledPin, LOW); // Bật LED
    } else if (data == '0') {
      digitalWrite(ledPin, HIGH);  // Tắt LED
    }
  }
}