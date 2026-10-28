# ProCAD — Kế hoạch chi tiết M0 (spike)

> Ngày: 2026-10-28 · Trạng thái: **đã code xong, còn bước kiểm tra end-to-end với KiCad thật** (xem mục 0) · Stack: **TypeScript/Node + avr8js** · License: **GPL-3.0-or-later**
> Tài liệu nền: [nghien-cuu-kha-thi.md](nghien-cuu-kha-thi.md)

## 0. Trạng thái (2026-10-29)

| Việc | Trạng thái |
|---|---|
| T1 Khung dự án | Xong: TypeScript 7, vitest 5, commander 15, fast-xml-parser 5, avr8js 0.21.1 (khoá đúng phiên bản) |
| T2 Fixture | **Một phần.** HEX đã build từ sketch thật bằng arduino-cli. `netlist.xml` của F1, F2, F3 là **viết tay** theo đúng schema `E` của KiCad, vì máy chưa cài KiCad. Chưa có file `.kicad_sch` |
| T3–T9, T12 | Xong |
| T10 F1, F2 | Đạt, có test tự động trong `test/acceptance.spec.ts` |
| T11 F3 (2 MCU) | Đạt. Phải viết thêm phần ngoài kế hoạch: USART phát dạng sóng thật trên PD1 và giải mã PD0, vì avr8js chỉ trao đổi theo byte |

**Kết quả đo** (`npm run bench`, chạy khi máy rảnh):

| Phép đo | Tốc độ so với thời gian thực | Chỉ tiêu |
|---|---|---|
| avr8js chạy trần, không có lớp bọc | 2,87× | Mức trần trên máy này |
| F1, 1 MCU | 2,28× | Đạt ≥1×. **Không đạt** mục tiêu phụ ≥3×, vì mục tiêu này đã cao hơn cả mức trần của avr8js |
| F3, 2 MCU | 1,07× | Đạt ≥0,5× |

**Hành vi đáng chú ý**
- **F3:** vài byte đầu của banner ARD2 mà ARD1 in lại bị nhiễu. Nguyên nhân là ARD2 bắt đầu gửi trước khi SoftwareSerial của ARD1 kịp bật ngắt chân. Đây là tranh chấp lúc khởi động, mạch thật cũng gặp; các lệnh gửi sau đó đều đúng.
- **F2:** khi khởi động, LED loé khoảng 3 µs. Lý do là `pinMode(OUTPUT)` chạy trước `digitalWrite(HIGH)` trên LED nối kiểu active-low. Phần cứng thật cũng có hiện tượng này.

**Còn lại**
1. Cài KiCad 9/10.
2. Vẽ 3 schematic thật, rồi chạy lại 3 fixture qua `kicad-cli` để kiểm tra đường đi end-to-end.
3. So sánh trực tiếp với `B2/Proteus/B2/Bai1.2.pdsprj` trong Proteus. Việc này cần bạn mở Proteus.

## 1. Mục tiêu

Chứng minh toàn bộ đường đi **chạy headless, điều khiển bằng CLI**:

```
schematic KiCad → netlist → mạch trong ProCAD → ATmega328P (avr8js) chạy file HEX thật
               → LED / nút nhấn / UART → log, VCD, JSON
```

M0 xong khi chạy được một lệnh như sau và kết quả khớp với Proteus:

```bash
procad run test/fixtures/b2-bai1.2 --fw U1=sketch.hex --press SW1@1s:3.2s --until 6s --vcd out.vcd
```

**Ngoài phạm vi M0:** giao diện đồ hoạ, mô phỏng analog (MNA), ngspice, linh kiện I2C (LCD, DS1307), plugin hay IPC API của KiCad, PIC và ESP32.

---

## 2. Môi trường đã kiểm tra trên máy

| Thành phần | Trạng thái | Ghi chú |
|---|---|---|
| Node.js / npm | v24.20.0 / 11.17.0 | Đủ dùng |
| arduino-cli | 1.5.1, đi kèm Arduino IDE (`%LOCALAPPDATA%\Programs\arduino-ide\resources\app\lib\backend\resources\arduino-cli.exe`) | Có core `arduino:avr 1.8.8` để build HEX cho fixture |
| File HEX có sẵn | B2 (bài 1.1, 1.2), B3, B5, Doan/SmartRoom | Firmware thật để test |
| kicad-cli | **Chưa có** | Cần cài KiCad. Các project trong `D:\KiCad Design` lưu theo format `20250114` (KiCad 9), nên cài KiCad 9 hoặc 10 |
| Trình biên dịch C/C++ | Không có | Không cần cho M0, vì M0 không dùng thư viện native |

---

## 3. Lựa chọn kỹ thuật

| Hạng mục | Chọn | Lý do |
|---|---|---|
| Runtime | Node 24, TypeScript 5 (`strict`), ESM | Đã có trên máy |
| Lõi MCU | `avr8js@0.21.1` (MIT) từ npm | Đã đọc mã nguồn: `CPU`, `AVRIOPort`, `AVRTimer`, `AVRUSART`, `AVRTWI`, `AVRADC`, `addClockEvent` |
| CLI | `commander` | Phổ biến, gọn |
| XML netlist | `fast-xml-parser` | Không phụ thuộc native |
| Test | `vitest` | Nhanh, chạy TypeScript trực tiếp |
| Build | `tsc` (chưa cần bundler) | Ít thành phần |
| Intel HEX | **Tự viết** | Loader trong demo của avr8js bỏ qua record 02/04 và không kiểm checksum |
| License | **GPL-3.0** (đề xuất, chờ chốt) | Tương thích KiCad và simavr; avr8js là MIT nên dùng được |

---

## 4. Cấu trúc thư mục

```
ProCAD/
  package.json  tsconfig.json  vitest.config.ts  LICENSE  README.md
  src/
    cli/index.ts             # commander: netlist | check | run | version
    import/kicad-cli.ts      # tìm kicad-cli, gọi "sch export netlist --format kicadxml"
    import/kicad-xml.ts      # XML netlist → Circuit
    circuit/types.ts         # Circuit, Part, Net, PinRef
    circuit/mapping.ts       # symbol/field → model; tên chân → cổng MCU
    sim/time.ts              # đơn vị ps, parse "1.5s" / "200ms" / "1us"
    sim/scheduler.ts         # heap sự kiện, đồng bộ nhiều MCU, điều tốc real-time
    sim/net.ts               # giải net mức switch (Supply/Strong/Pull/Weak/Z)
    mcu/intel-hex.ts
    mcu/atmega328p.ts        # bọc avr8js: port B/C/D, timer 0/1/2, USART0, cầu nối chân
    parts/resistor.ts  led.ts  button.ts  power.ts  uart-terminal.ts
    out/vcd.ts  trace-jsonl.ts  console.ts  stats.ts
  test/
    fixtures/blink/  b2-bai1.2/  b2-bai1.1/   # .kicad_sch, netlist.xml, .ino, .hex
    *.spec.ts
```

---

## 5. Thiết kế lõi

### 5.1 Đầu vào

- **Chính:** `kicad-cli sch export netlist --format kicadxml`. Tôi đã kiểm tra trong mã nguồn KiCad (`netlist_exporter_xml.cpp`, schema version `"E"`). Cấu trúc gồm:
  - `components/comp[@ref]` chứa `value`, `libsource[@lib,@part]` và `fields/field[@name]`. Các field `Sim.*` và `ProCAD.*` nằm ở đây.
  - `nets/net[@code,@name]/node[@ref,@pin,@pinfunction,@pintype]`.
- **Dự phòng khi máy chưa có kicad-cli:** truyền thẳng file `netlist.xml` đã xuất sẵn. Test luôn dùng file XML đã commit, nên không cần cài KiCad mới chạy được test.
- Tự đọc trực tiếp `.kicad_sch` (tính kết nối từ dây và nhãn) là việc khó hơn, **để sang M1/M2**.

### 5.2 Ánh xạ symbol sang model

Tên chân dưới đây đã đối chiếu trực tiếp với thư viện `kicad-symbols`.

| Symbol KiCad | Model | Ánh xạ chân (lấy từ `pinfunction`) |
|---|---|---|
| `MCU_Module:Arduino_UNO_R3` | `atmega328p` | Tách tên chân theo `/`, lấy token khớp `^D(\d+)$` hoặc `^A(\d)$`: D0–7 → PD0–7, D8–13 → PB0–5, A0–5 → PC0–5. `SDA/A4` và `SCL/A5` xuất hiện 2 lần trên symbol, cả hai đều về PC4/PC5. Chân `+5V`/`3V3` (`power_out`) là nguồn cấp, `GND` là đất |
| `MCU_Microchip_ATmega:ATmega328P-P` (kế thừa `ATmega48PV-10P`) | `atmega328p` | Token khớp `^P([BCD])(\d)$`, ví dụ `PB5`, `XTAL1/PB6`, `~{RESET}/PC6` |
| `Device:R*` | `resistor` | 2 chân; giá trị dạng `220`, `10k`, `4k7` |
| `Device:LED*` | `led` | Chân 1 = `K`, chân 2 = `A` |
| `Switch:SW_Push*` | `button` | Chân 1 và 2 |
| Net tên `GND`, `GNDD`, `0` / `+5V`, `VCC`, `+3V3` | `power` | Ray nguồn |

- Field ghi đè: `ProCAD.Model`, `ProCAD.Firmware` (đường dẫn tương đối theo project), `ProCAD.Clock` (mặc định 16 MHz).
- Linh kiện không có model: `procad check` báo lỗi, còn `procad run` dừng lại trừ khi có cờ `--allow-unmapped`.

### 5.3 Giải net ở mức switch (chưa có điện áp)

- **Thang cường độ:** `SUPPLY` > `STRONG` (chân output của MCU, nút đang đóng nối ra ray) > `PULL` (đi qua điện trở) > `WEAK` (pull-up nội của MCU) > `Z`.
- **Quy tắc giải:** cường độ cao nhất thắng. Hai nguồn cùng cường độ mà khác mức thì net thành `X` và in cảnh báo "tranh chấp".
- **Điện trở** chuyển mức từ phía bên kia sang, hạ xuống `PULL`. Lặp đến khi ổn định (có giới hạn số vòng để chống mạch vòng).
- **Nút nhấn đóng** gộp hai net làm một (union-find), tính lại mỗi khi nút đổi trạng thái.
- **LED sáng** khi phía anode có mức 1 từ `PULL` trở lên và phía cathode là 0. Cách này phủ được LED active-high lẫn active-low như trong bài B2.
- **Chân input của MCU** đọc mức của net. Nếu net là `Z` hoặc `X` thì đọc mức cũ và in cảnh báo "chân thả nổi".
- **Giới hạn đã biết:** chưa tính dòng hay áp, nên chưa xử lý được cầu chia áp hay ADC. Phần này thuộc M2.

### 5.4 Thời gian và bộ lập lịch

- **Đơn vị thời gian:** picosecond, lưu bằng `number`. Một chu kỳ 16 MHz là 62 500 ps. Kiểu double giữ chính xác số nguyên tới khoảng 9 007 s (2,5 giờ mô phỏng), đủ cho M0.
- **Hàng đợi:** binary heap `{t, seq, fn}`. Thứ tự `seq` giúp kết quả lặp lại y hệt giữa các lần chạy.
- **Một MCU:** chạy `avrInstruction(cpu); cpu.tick()` liên tục đến thời điểm sự kiện ngoài kế tiếp (nhấn nút, gửi chữ vào UART).
- **Nhiều MCU** (fixture B2 bài 1.1):
  - Luôn chạy MCU đang có thời gian cục bộ nhỏ nhất, mỗi lượt tối đa một `quantum` (mặc định 1 µs = 16 chu kỳ).
  - Tín hiệu gửi tới MCU **đang chậm hơn** được đặt lịch đúng chu kỳ bằng `cpu.addClockEvent`, nên không có sai số.
  - Tín hiệu gửi tới MCU **đang nhanh hơn** thì áp dụng ngay, trễ tối đa 1 quantum. Số lần trễ được đếm và in trong `--stats`.
  - SoftwareSerial 9600 baud có thời gian 1 bit là 104 µs, nên sai số 1 µs (≈1 %) là chấp nhận được.
- **Real-time** (`--realtime`, `--speed 1|0.5|2|max`): chạy từng lát 10 ms mô phỏng rồi chờ đồng hồ thật bắt kịp. Chế độ này chuẩn bị sẵn cho GUI ở M1.

### 5.5 UART

- **Ra:** `usart.onByteTransmit` → terminal của từng MCU → stdout, mỗi dòng có tiền tố tên MCU, ví dụ `[U1] He thong san sang`.
- **Vào:**
  - `--serial-in U1@0.5s="1"` đẩy byte vào bằng `usart.writeByte()`.
  - Ở chế độ `--realtime`, gõ trực tiếp từ bàn phím (stdin raw) để giả lập Virtual Terminal của Proteus.

### 5.6 Đầu ra

- **VCD** (IEEE 1364, timescale 1 ns): ghi các net và trạng thái LED; dùng `--probe` để chọn bớt. Mở được bằng GTKWave hoặc PulseView.
- **`--trace out.jsonl`:** mỗi dòng một sự kiện `{t, kind, ref, value}` để script hoặc test đọc lại.
- **`--stats`:** thời gian mô phỏng, thời gian thực, tốc độ (×), số lệnh/giây, số lần tín hiệu bị trễ.

---

## 6. Đặc tả CLI của M0

```text
procad netlist <project-dir | .kicad_sch | netlist.xml> [--json]
    In ra mạch ProCAD hiểu được: linh kiện, model, net, chân MCU.

procad check <...>
    Exit 0 nếu mọi linh kiện đều có model; exit 3 nếu có linh kiện chưa ánh xạ.

procad run <...>
    [--fw REF=file.hex]...      firmware cho từng MCU (ghi đè ProCAD.Firmware)
    [--until 5s]                dừng sau thời gian mô phỏng (mặc định 10s)
    [--until-serial "TEXT"]     dừng khi UART in ra chuỗi này
    [--press REF@t:dur]...      nhấn nút ở thời điểm t, giữ trong dur
    [--serial-in REF@t=text]... gửi chuỗi vào UART
    [--realtime] [--speed 1]
    [--vcd out.vcd] [--trace out.jsonl] [--probe net1,LED1]
    [--quantum 1us] [--stats] [--quiet] [--allow-unmapped]

procad version
```

**Mã thoát:** 0 = OK · 1 = sai cú pháp · 2 = lỗi import · 3 = có linh kiện chưa ánh xạ · 4 = lỗi firmware/HEX · 5 = lỗi khi chạy (opcode lạ, tranh chấp nghiêm trọng).

---

## 7. Fixture và tiêu chí nghiệm thu

| Fixture | Mạch | Kiểm tra |
|---|---|---|
| **F1 – Blink** (tạo mới) | Arduino_UNO_R3, D13 → R 220 Ω → LED → GND | D13 đổi mức mỗi 1,000 s, sai số ±0,1 %; trạng thái LED1 khớp; file VCD mở được |
| **F2 – B2 bài 1.2** (bài thật, `B2/Code/B 1.2/sketch_sep3a`) | D2 `INPUT_PULLUP` + nút SW1 xuống GND; LED D13 active-low; Serial 9600 | Khởi động in `He thong san sang - Che do VAN HANH`. Nhấn giữ SW1 3,2 s thì in `>> CHE DO CAU HINH <<` và LED đổi mức 6 lần, mỗi lần cách 100 ms. So sánh bằng mắt với `B2/Proteus/B2/Bai1.2.pdsprj` |
| **F3 – B2 bài 1.1** (mục tiêu mở rộng) | 2 Arduino: ARD1 dùng SoftwareSerial D9/D8 nối với UART của ARD2; ARD2 có 3 LED active-low ở D2–D4 | `--serial-in ARD1@1s="1"` thì LED1 của ARD2 sáng và ARD1 in lại `LED1: BAT`. Đây là bài kiểm tra đồng bộ nhiều MCU và độ chính xác thời gian của SoftwareSerial |

**Hiệu năng (đo trên máy này):**
- F1 chạy 10 s mô phỏng ở chế độ headless phải đạt **≥ 1× thời gian thực**, mục tiêu ≥ 3×.
- F3 với 2 MCU phải đạt ≥ 0,5×.

**Unit test:**
- Intel HEX: kiểm checksum, record 02/04, báo lỗi khi file hỏng.
- Bảng chân trị của bộ giải net.
- Ánh xạ chân Arduino và ATmega.
- Parser XML chạy trên fixture.
- Định dạng file VCD.

---

## 8. Danh sách việc

Ước lượng thô cho 1 người làm toàn thời gian. Nếu làm bán thời gian thì nhân khoảng ×2.

| # | Việc | Phụ thuộc | Ước lượng |
|---|---|---|---|
| T1 | Khung dự án: package.json, tsconfig, vitest, LICENSE, README | Chốt license | 0,5 ngày |
| T2 | Cài KiCad 9/10; vẽ schematic F1, F2 (F3); xuất `netlist.xml`; build HEX bằng arduino-cli | KiCad | 1 ngày |
| T3 | Parser XML netlist + kiểu `Circuit` + lệnh `procad netlist` | T1 | 1 ngày |
| T4 | Ánh xạ model và chân + lệnh `procad check` | T3 | 1 ngày |
| T5 | Loader Intel HEX + wrapper ATmega328P | T1 | 1 ngày |
| T6 | Bộ giải net mức switch + R, LED, nút, nguồn | T4 | 1,5 ngày |
| T7 | Bộ lập lịch 1 MCU + vòng chạy, `--until` | T5, T6 | 1 ngày |
| T8 | Đầu ra: UART ra console, VCD, JSONL, stats | T7 | 1 ngày |
| T9 | Kích thích đầu vào: `--press`, `--serial-in` | T7 | 0,5 ngày |
| T10 | Test nghiệm thu F1, F2 | T2, T8, T9 | 1 ngày |
| T11 | *(Mở rộng)* Đồng bộ nhiều MCU + F3 | T10 | 1,5 ngày |
| T12 | Điều tốc real-time + UART gõ trực tiếp | T7 | 0,5 ngày |

**Tổng:** khoảng 10–12 ngày làm việc, tức ~2 tuần toàn thời gian hoặc 3–4 tuần bán thời gian.

---

## 9. Rủi ro riêng của M0

| Rủi ro | Giảm thiểu |
|---|---|
| Chưa có kicad-cli nên T2 bị chặn | Viết tay `netlist.xml` nhỏ cho F1 để làm trước T3–T9 |
| Giải net mức switch sai với mạch cầu chia áp hoặc LED không có điện trở | Ghi rõ đây là giới hạn của M0 và in cảnh báo; M2 thay bằng MNA |
| avr8js thiếu ngoại vi (ví dụ analog comparator) | Fixture M0 không dùng; khi gặp opcode hay thanh ghi chưa hỗ trợ thì báo lỗi rõ ràng |
| SoftwareSerial nhạy với timing | Dùng quantum 1 µs, đo số lần tín hiệu trễ; nếu cần thì giảm quantum |

---

## 10. Phát hiện mới ảnh hưởng tới lộ trình

- Đồ án 2 trong `D:\KiCad Design` dùng **PIC16F877A**, kèm bo mở rộng ESP32-S3. avr8js **không** chạy được PIC.
  - Nếu muốn ProCAD mô phỏng được chính đồ án này, M4 cần thêm một lõi PIC.
  - Ứng viên hợp với stack TypeScript: **picsim** (thư viện C của PICSimLab, có hỗ trợ PIC16F877A; cần kiểm tra license) biên dịch sang WebAssembly, rồi gọi từ Node qua cùng interface `Mcu`.
  - Vì vậy wrapper MCU ở T5 nên được thiết kế theo interface chung ngay từ đầu, ví dụ `Mcu { pins, step(untilPs), onPinChange, setInput }`.
- Hai quyết định còn mở là "cửa sổ riêng hay canvas KiCad" và "license" **không** chặn M0, trừ việc file LICENSE ở T1.
