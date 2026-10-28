// F1 fixture: D13 toggles every second, one line on Serial at boot.
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("blink ready");
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}
