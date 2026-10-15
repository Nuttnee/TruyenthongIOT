#include <Wire.h>
#include <RTClib.h>
#include <LiquidCrystal_I2C.h>
#include <EEPROM.h>
#include <avr/interrupt.h>

#define FORCE_SET_TIME 0

#define BTN_MODE 4
#define BTN_UP   5
#define BTN_DOWN 6
#define BTN_SET  7

#define PIN_LED  8
#define PIN_BUZZ 9

#define LED_ON    LOW
#define LED_OFF   HIGH
#define BUZZ_IDLE HIGH

LiquidCrystal_I2C lcd(0x20, 16, 2);
RTC_DS1307 rtc;

byte mode = 0;
byte step = 0;
bool ringing = false;

byte alarmH = 6;
byte alarmM = 30;
bool alarmOn = true;

byte tH, tM, tS;
DateTime now;

unsigned long tRead = 0;
unsigned long tDraw = 0;
unsigned long tRing = 0;
unsigned long tHold = 0;
int lastKey = -1;

const byte pins[4] = {BTN_MODE, BTN_UP, BTN_DOWN, BTN_SET};
unsigned long lastPressTime[4] = {0, 0, 0, 0};

bool modePressed = false;
bool modeHoldDone = false;

// Bien duoc ISR cap nhat.
volatile byte pressedMask = 0;
volatile byte releasedMask = 0;
volatile byte lastPortD = 0;

const char *NAME_ALARM[2] = {"Gio ", "Phut"};
const char *NAME_TIME[3] = {"Gio ", "Phut", "Giay"};

bool timeValid(DateTime t) {
  return t.year() >= 2020 && t.year() <= 2099 &&
         t.month() >= 1 && t.month() <= 12 &&
         t.day() >= 1 && t.day() <= 31 &&
         t.hour() < 24 && t.minute() < 60 && t.second() < 60;
}

void saveAlarm() {
  EEPROM.update(0, 0x5A);
  EEPROM.update(1, alarmH);
  EEPROM.update(2, alarmM);
  EEPROM.update(3, alarmOn);
}

void loadAlarm() {
  if (EEPROM.read(0) == 0x5A) {
    alarmH = EEPROM.read(1);
    alarmM = EEPROM.read(2);
    alarmOn = EEPROM.read(3);
  }

  if (alarmH > 23) alarmH = 6;
  if (alarmM > 59) alarmM = 30;
}

void showLine(byte row, const char *s) {
  lcd.setCursor(0, row);

  byte n = 0;
  while (s[n] && n < 16) {
    lcd.print(s[n]);
    n++;
  }

  while (n < 16) {
    lcd.print(' ');
    n++;
  }
}

// Ngat PCINT cho PORTD.
// Chi xu ly D4, D5, D6, D7; khong xu ly D0, D1.
ISR(PCINT2_vect) {
  byte currentPortD = PIND;
  byte buttonMask = _BV(PD4) | _BV(PD5) | _BV(PD6) | _BV(PD7);
  byte changed = (currentPortD ^ lastPortD) & buttonMask;

  // Nut dung INPUT_PULLUP: LOW la dang nhan.
  pressedMask |= changed & lastPortD & ~currentPortD;
  releasedMask |= changed & ~lastPortD & currentPortD;

  lastPortD = currentPortD;
}

void readButtonEvents(byte &pressed, byte &released) {
  noInterrupts();
  pressed = pressedMask;
  released = releasedMask;
  pressedMask = 0;
  releasedMask = 0;
  interrupts();
}

// Loc doi nut o loop, khong dung delay trong ISR.
byte debouncePressed(byte rawPressed) {
  byte validPressed = 0;
  unsigned long currentTime = millis();

  for (byte i = 0; i < 4; i++) {
    byte mask = _BV(pins[i]);

    if ((rawPressed & mask) &&
        currentTime - lastPressTime[i] >= 30) {
      lastPressTime[i] = currentTime;
      validPressed |= mask;
    }
  }

  return validPressed;
}

void setup() {
  for (byte i = 0; i < 4; i++) {
    pinMode(pins[i], INPUT_PULLUP);
  }

  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LED_OFF);

  pinMode(PIN_BUZZ, OUTPUT);
  digitalWrite(PIN_BUZZ, BUZZ_IDLE);

  lcd.init();
  lcd.backlight();

  rtc.begin();
  now = rtc.now();

  if (FORCE_SET_TIME || !rtc.isrunning() || !timeValid(now)) {
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    now = rtc.now();
  }

  loadAlarm();

  // Bat Pin Change Interrupt cho D4-D7.
  lastPortD = PIND;
  PCICR |= _BV(PCIE2);
  PCMSK2 |= _BV(PCINT20);
  PCMSK2 |= _BV(PCINT21);
  PCMSK2 |= _BV(PCINT22);
  PCMSK2 |= _BV(PCINT23);
}

void loop() {
  char buf[17];

  byte rawPressed, rawReleased;
  readButtonEvents(rawPressed, rawReleased);

  byte pressed = debouncePressed(rawPressed);
  bool modeReleased =
      (rawReleased & _BV(BTN_MODE)) &&
      digitalRead(BTN_MODE) == HIGH;

  if (millis() - tRead >= 500) {
    tRead = millis();

    DateTime t = rtc.now();
    if (timeValid(t)) {
      now = t;
    }
  }

  int key = now.hour() * 60 + now.minute();

  if (key != lastKey) {
    lastKey = key;

    if (alarmOn && !ringing &&
        now.hour() == alarmH &&
        now.minute() == alarmM) {
      ringing = true;
      tRing = millis();
      tone(PIN_BUZZ, 2500);
      digitalWrite(PIN_LED, LED_ON);
    }
  }

  if (ringing) {
    if (pressed || millis() - tRing >= 30000) {
      ringing = false;
      noTone(PIN_BUZZ);
      digitalWrite(PIN_BUZZ, BUZZ_IDLE);
      digitalWrite(PIN_LED, LED_OFF);
    }
  } else {
    // MODE: bat dau dem khi co ngat nhan nut.
    if (pressed & _BV(BTN_MODE)) {
      modePressed = true;
      modeHoldDone = false;
      tHold = millis();
    }

    // Giu MODE 2 giay: bat/tat bao thuc.
    if (modePressed && !modeHoldDone &&
        millis() - tHold >= 2000) {
      modeHoldDone = true;
      alarmOn = !alarmOn;
      saveAlarm();
      mode = 0;
    }

    // Tha MODE truoc 2 giay: chuyen che do.
    if (modeReleased && modePressed) {
      if (!modeHoldDone) {
        mode = (mode + 1) % 3;
        step = 0;

        if (mode == 1) {
          tH = alarmH;
          tM = alarmM;
        }

        if (mode == 2) {
          tH = now.hour();
          tM = now.minute();
          tS = now.second();
        }
      }

      modePressed = false;
    }

    int d = 0;

    if (pressed & _BV(BTN_UP)) {
      d = 1;
    }

    if (pressed & _BV(BTN_DOWN)) {
      d = -1;
    }

    bool setPressed = pressed & _BV(BTN_SET);

    if (mode == 1) {
      if (d) {
        if (step == 0) {
          tH = (tH + 24 + d) % 24;
        } else {
          tM = (tM + 60 + d) % 60;
        }
      }

      if (setPressed) {
        if (step == 0) {
          step = 1;
        } else {
          alarmH = tH;
          alarmM = tM;
          saveAlarm();
          lastKey = -1;
          mode = 0;
        }
      }
    } else if (mode == 2) {
      if (d) {
        if (step == 0) {
          tH = (tH + 24 + d) % 24;
        } else if (step == 1) {
          tM = (tM + 60 + d) % 60;
        } else {
          tS = (tS + 60 + d) % 60;
        }
      }

      if (setPressed) {
        if (step < 2) {
          step++;
        } else {
          rtc.adjust(DateTime(
            now.year(), now.month(), now.day(),
            tH, tM, tS
          ));

          lastKey = -1;
          mode = 0;
        }
      }
    }
  }

  if (millis() - tDraw >= 200) {
    tDraw = millis();

    if (ringing) {
      showLine(0, "*** BAO THUC ***");
      showLine(1, "Nhan nut de tat");
    } else if (mode == 0) {
      sprintf(
        buf, "%02d:%02d:%02d  %s",
        now.hour(), now.minute(), now.second(),
        alarmOn ? "AL ON" : "AL OFF"
      );
      showLine(0, buf);

      sprintf(
        buf, "%02d/%02d/%04d %02d:%02d",
        now.day(), now.month(), now.year(),
        alarmH, alarmM
      );
      showLine(1, buf);
    } else if (mode == 1) {
      showLine(0, "CAI BAO THUC");
      sprintf(buf, "%s   %02d:%02d", NAME_ALARM[step], tH, tM);
      showLine(1, buf);
    } else {
      showLine(0, "CAI THOI GIAN");
      sprintf(buf, "%s %02d:%02d:%02d", NAME_TIME[step], tH, tM, tS);
      showLine(1, buf);
    }
  }
}