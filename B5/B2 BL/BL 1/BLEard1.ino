void setup() {
  Serial.begin(9600); // Giao tiếp với Bluetooth ở tốc độ 9600
}

void loop() {
  Serial.print('1'); // Gửi lệnh bật LED
  delay(2000);

  Serial.print('0'); // Gửi lệnh tắt LED
  delay(2000);
}
