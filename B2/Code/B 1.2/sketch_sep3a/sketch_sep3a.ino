
#define BTN 2
#define LED 13

int mode = 0;
unsigned long baud = 9600;
int clicks = 0;
unsigned long pressStart = 0;
unsigned long lastClick = 0;
bool lastBtn = HIGH;

void setup() {
  pinMode(BTN, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  digitalWrite(LED, HIGH);  // tat LED
  Serial.begin(9600);
  Serial.println("He thong san sang - Che do VAN HANH");
}

void loop() {
  bool btn = digitalRead(BTN);

  if (btn == LOW && lastBtn == HIGH) {
    pressStart = millis();
  }

  if (btn == HIGH && lastBtn == LOW) {
    unsigned long held = millis() - pressStart;

    if (held >= 3000) {
      if (mode == 0) {
        mode = 1;
        clicks = 0;
        Serial.println(">> CHE DO CAU HINH <<");
        for (int i = 0; i < 6; i++) {
          digitalWrite(LED, !digitalRead(LED));
          delay(100);
        }
        digitalWrite(LED, HIGH);  // tat LED
      } else {
        mode = 0;
        Serial.println(">> TRO VE VAN HANH <<");
        digitalWrite(LED, HIGH);  // tat LED
      }
    } else if (mode == 1) {
      clicks++;
      lastClick = millis();
    }
  }

  if (mode == 1 && clicks > 0 && millis() - lastClick > 500) {
    if (clicks == 1) {
      baud = 9600;
      digitalWrite(LED, LOW); delay(300); digitalWrite(LED, HIGH);
    } else {
      baud = 115200;
      digitalWrite(LED, LOW); delay(200); digitalWrite(LED, HIGH); delay(200);
      digitalWrite(LED, LOW); delay(200); digitalWrite(LED, HIGH);
    }

    Serial.end();
    Serial.begin(baud);
    delay(50);
    Serial.print("Baud rate: ");
    Serial.println(baud);
    clicks = 0;
  }

  lastBtn = btn;
}