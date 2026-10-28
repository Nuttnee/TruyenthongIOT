#define LED1_PIN 2
#define LED2_PIN 3
#define LED3_PIN 4

void setup() {
  Serial.begin(9600);

  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(LED3_PIN, OUTPUT);

  // Active LOW: HIGH = tat, LOW = bat
  digitalWrite(LED1_PIN, HIGH);
  digitalWrite(LED2_PIN, HIGH);
  digitalWrite(LED3_PIN, HIGH);

  Serial.println("ARD2 san sang nhan lenh dieu khien LED");
}

void loop() {
  if (Serial.available() > 0) {
    char c = Serial.read();

    switch (c) {
      case '1':
        digitalWrite(LED1_PIN, LOW);   // BAT
        Serial.println("LED1: BAT");
        break;
      case '2':
        digitalWrite(LED2_PIN, LOW);
        Serial.println("LED2: BAT");
        break;
      case '3':
        digitalWrite(LED3_PIN, LOW);
        Serial.println("LED3: BAT");
        break;

      case 'a':
      case 'A':
        digitalWrite(LED1_PIN, HIGH);  // TAT
        Serial.println("LED1: TAT");
        break;
      case 'b':
      case 'B':
        digitalWrite(LED2_PIN, HIGH);
        Serial.println("LED2: TAT");
        break;
      case 'c':
      case 'C':
        digitalWrite(LED3_PIN, HIGH);
        Serial.println("LED3: TAT");
        break;

      case '0':
        digitalWrite(LED1_PIN, HIGH);
        digitalWrite(LED2_PIN, HIGH);
        digitalWrite(LED3_PIN, HIGH);
        Serial.println("Tat ca LED: TAT");
        break;

      default:
        break;
    }
  }
}