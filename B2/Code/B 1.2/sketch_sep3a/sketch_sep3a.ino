const byte BUTTON_PIN = 2;
const byte LED_PIN = 13;

const unsigned long HOLD_TIME = 3000;
const unsigned long DOUBLE_CLICK_TIME = 650;

unsigned long currentBaud = 9600;
bool configMode = false;

// Mach LED: VCC -> R -> LED -> D13
// D13 = LOW thi LED sang.
void ledOn() {
  digitalWrite(LED_PIN, LOW);
}

void ledOff() {
  digitalWrite(LED_PIN, HIGH);
}

void blinkLed(byte times, unsigned int intervalMs) {
  for (byte i = 0; i < times; i++) {
    ledOn();
    delay(intervalMs);
    ledOff();
    delay(intervalMs);
  }
}

// Goi ham nay chi sau khi da xac nhan nut dang duoc nhan.
// Tra ve thoi gian nut duoc giu.
unsigned long waitButtonRelease() {
  unsigned long pressStart = millis();

  while (digitalRead(BUTTON_PIN) == LOW) {
    delay(10);
  }

  delay(30); // chong doi nut
  return millis() - pressStart;
}

void setBaudRate(unsigned long baud) {
  Serial.print("Chuyen baud rate sang: ");
  Serial.println(baud);
  Serial.flush();

  currentBaud = baud;
  Serial.begin(currentBaud);

  Serial.print("UART dang chay o ");
  Serial.print(currentBaud);
  Serial.println(" bps");
}

void enterConfigMode() {
  configMode = true;

  Serial.println("Vao che do cau hinh UART");
  blinkLed(4, 500);

  Serial.println("Nhan 1 lan: 9600 bps");
  Serial.println("Nhan 2 lan: 115200 bps");
  Serial.println("Nhan giu 3 giay de thoat cau hinh");
}

void exitConfigMode() {
  configMode = false;

  Serial.println("Thoat cau hinh, ve che do van hanh");
  blinkLed(2, 500);
}

void handleConfigMode() {
  if (digitalRead(BUTTON_PIN) != LOW) {
    return;
  }

  delay(30);
  if (digitalRead(BUTTON_PIN) != LOW) {
    return;
  }

  // Lan nhan dau tien
  unsigned long pressTime = waitButtonRelease();

  // Nhan giu 3 giay: thoat che do cau hinh
  if (pressTime >= HOLD_TIME) {
    exitConfigMode();
    return;
  }

  // Cho 650 ms de kiem tra co lan nhan thu hai khong
  unsigned long waitStart = millis();

  while (millis() - waitStart < DOUBLE_CLICK_TIME) {
    if (digitalRead(BUTTON_PIN) == LOW) {
      delay(30);

      if (digitalRead(BUTTON_PIN) == LOW) {
        unsigned long secondPressTime = waitButtonRelease();

        if (secondPressTime >= HOLD_TIME) {
          exitConfigMode();
          return;
        }

        // Nhan 2 lan: 115200 bps
        blinkLed(2, 500);
        setBaudRate(115200);
        return;
      }
    }
  }

  // Chi nhan 1 lan: 9600 bps
  blinkLed(1, 500);
  setBaudRate(9600);
}

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);

  ledOff();

  Serial.begin(currentBaud);
  Serial.println("He thong khoi dong");
  Serial.println("Nhan giu nut 3 giay de vao cau hinh UART");
}

void loop() {
  if (!configMode) {
    if (digitalRead(BUTTON_PIN) == LOW) {
      delay(30);

      if (digitalRead(BUTTON_PIN) == LOW) {
        unsigned long pressTime = waitButtonRelease();

        if (pressTime >= HOLD_TIME) {
          enterConfigMode();
        }
      }
    }
  } else {
    handleConfigMode();
  }
}