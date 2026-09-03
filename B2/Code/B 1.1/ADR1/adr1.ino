/*
  ARD1 - Nhan lenh tu PC (qua USB/Virtual Terminal)
         va chuyen tiep sang ARD2 qua UART mem (SoftwareSerial)

  Serial cung (pin 0,1)    : noi voi Virtual Terminal / PC
  SoftwareSerial (pin 8,9) : noi voi ARD2
    - pin 8 = TX (gui di)   -> noi vao chan 0 (RX) cua ARD2
    - pin 9 = RX (nhan ve)  <- noi tu chan 1 (TX) cua ARD2
*/

#include <SoftwareSerial.h>

SoftwareSerial toARD2(9, 8); // RX=9, TX=8

void setup() {
  Serial.begin(9600);   // giao tiep voi Virtual Terminal / PC
  toARD2.begin(9600);   // giao tiep voi ARD2
  Serial.println("ARD1 san sang. Nhap lenh de dieu khien LED qua ARD2.");
}

void loop() {
  // Tu PC -> chuyen sang ARD2
  if (Serial.available() > 0) {
    char c = Serial.read();
    toARD2.write(c);
  }

  // Tu ARD2 -> chuyen ve PC (de xem phan hoi)
  if (toARD2.available() > 0) {
    char c = toARD2.read();
    Serial.write(c);
  }
}