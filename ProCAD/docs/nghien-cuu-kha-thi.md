# ProCAD — Nghiên cứu mã nguồn & đánh giá khả thi (giai đoạn 0)

> Ngày: 2026-10-28 · Trạng thái: **chỉ nghiên cứu, chưa build** · Mã nguồn tham khảo nằm ở `ProCAD/vendor/` (đã gitignore, ~1.7 GB)

## 1. Kết luận nhanh

**Khả thi**, nhưng với 3 điều chỉnh so với ý tưởng ban đầu:

1. **Không lấy được "module logic" của Proteus.** Proteus là phần mềm đóng. Giao diện model của nó (VSM SDK) chỉ cấp khi ký NDA kèm hợp đồng Update Service. File `HELP/VSMSDK.chm` trong máy chỉ là một trang hướng dẫn liên hệ Labcenter, bên trong không có tài liệu API. Phần mô phỏng của ProCAD phải tự viết hoặc dùng engine nguồn mở có kiến trúc tương đương: **ngspice + simavr/avr8js + mô hình SimulIDE**.
2. **Không nên fork toàn bộ KiCad.** KiCad có ~1,87 triệu dòng C++ và build rất nặng. Hướng hợp lý: dùng KiCad làm **trình vẽ mạch và định dạng file**, còn ProCAD là **engine mô phỏng riêng + CLI + cửa sổ mô phỏng tương tác**. ProCAD gắn vào KiCad qua `kicad-cli`, IPC API và nút plugin trên toolbar Eeschema.
3. **MVP giới hạn ở Arduino Uno (ATmega328P)** và các ngoại vi đã dùng trong các bài B2–B13 và KT1. ESP32-S3 (WiFi/BLE) để giai đoạn sau, vì Proteus cũng không mô phỏng được phần này.

KiCad hiện **chưa có** lệnh mô phỏng trong `kicad-cli` và **chưa có** mô phỏng tương tác kiểu Proteus VSM. ProCAD có giá trị thật vì lấp đúng chỗ trống đó.

---

## 2. Nguồn đã thu thập

| Nguồn | Phiên bản | License | Quy mô | Vai trò với ProCAD |
|---|---|---|---|---|
| KiCad | master `3a3a56c` (28/10/2026), `10.99.0` = bản dev của KiCad 11 | GPL-3.0 | 1,87M dòng; `eeschema` 428k; `eeschema/sim` 41,7k | Trình vẽ mạch, định dạng `.kicad_sch`, quy ước `Sim.*`, IPC API, kicad-cli |
| ngspice | `47+` (master) | Modified BSD (một số file LGPL/MIT) | 86 MB | Lõi analog SPICE, co-sim `d_cosim`, shared lib API |
| simavr | master | GPL-3.0 | lõi ~18k dòng C, 40 core AVR | Giả lập AVR viết bằng C, có sẵn part HD44780, DS1338, 74HC595… |
| avr8js | 0.21.1 | **MIT** | ~5,4k dòng TS | Giả lập ATmega328P chạy trên Node/trình duyệt (lõi của Wokwi) |
| SimulIDE-dev | master | **AGPL-3.0** | ~175k dòng C++/Qt | Kiến trúc tham khảo gần Proteus VSM nhất (mô phỏng thời gian thực) |
| Proteus 8 Professional | đã cài sẵn | Độc quyền | 132 file BIN, 357 file MODELS | Chỉ đọc **tài liệu người dùng công khai** và **file project của chính bạn**. Không dịch ngược. |

---

## 3. Proteus: lấy được gì, không lấy được gì

### 3.1 Kiến trúc (suy ra từ tài liệu công khai và tên module đã cài)

| Khối Proteus | File cài đặt | Chức năng | Tương đương nguồn mở |
|---|---|---|---|
| ProSPICE (analog) | `PROSPICE.DLL`, `SPICESIM.DLL`, `SPICEINP.DLL` | Lõi SPICE mixed-mode | ngspice |
| DSIM (digital) | `DSIM.DLL` | Mô phỏng số theo sự kiện | XSPICE digital / tự viết event queue |
| Interface objects | primitive ADC/DAC (ngưỡng `VTL`, `VTH`…) | Cầu nối analog ↔ digital | `adc_bridge`/`dac_bridge` của XSPICE |
| VSM CPU models | `AVR2.DLL` (3,7 MB), PIC, 8051, ARM… | Giả lập MCU chạy file HEX | simavr / avr8js / QEMU |
| Active models | `LCDALPHA.DLL`, `KEYPAD.DLL`, `DS1307.DLL`… | Linh kiện có hoạt ảnh, tương tác | Tự viết (tham khảo simavr parts) |
| MDF | `*.MDF` | Model định nghĩa bằng netlist primitive | Subcircuit SPICE |
| Instruments | `DSO`, `VTERM`, `COMPIM`, `I2CDEBUG`, `SPIDEBUG`, `SIGGEN`, `PATTGEN`, `CTIMER` | Dao động ký, terminal UART, COM thật, debugger bus | Tự viết |

Proteus VSM thực chất gồm 3 lớp: **lõi analog + lõi digital theo sự kiện + các model DLL cắm vào qua giao diện C++**. ProCAD có thể tái tạo đúng mô hình này bằng thành phần nguồn mở.

### 3.2 Định dạng project `.pdsprj`

Đây là file ZIP, gồm `ROOT.DSN` (nhị phân, header `ISIS SCHEMATIC FILE`), `ROOT.CDB`, `PROJECT.XML`, `GRAPHS.DAT` và `SCRIPTS/PWRRAILS.DAT`. Để đọc được `ROOT.DSN` phải dịch ngược một định dạng độc quyền nên **không khuyến nghị** hỗ trợ import `.pdsprj`. Cách thay thế là vẽ lại mạch trong KiCad.

### 3.3 Các bài của bạn dùng gì (quét `ROOT.DSN` trong `D:\IOT`)

| Project | Model Proteus được dùng |
|---|---|
| B2, B3, B5, KT1 | `AVR2.DLL` (ATmega328P / Arduino Uno), `ino.hex`, LED, `CRYSTAL` |
| B3, KT1 (bản backup) | `DS1307` (RTC), `PCF8574` (LCD I2C) |
| B5 (Bluetooth) | `COMPIM` (cổng COM ảo/thật) |
| Mọi project | Instruments: `VTERM`, `DSO`, `I2CDEBUG`, `SPIDEBUG`, `SIGGEN`, `PATTGEN`, `CTIMER` |
| Doan | Không có model MCU (ESP32-S3 không mô phỏng được trong Proteus) |

Các thư viện trong firmware: `Wire`, `LiquidCrystal_I2C`, `RTClib`, `DHT`, `SoftwareSerial`, `EEPROM`, cùng `WiFi`/`PubSubClient`/`BLE*` cho ESP32.

→ **Bộ linh kiện tối thiểu của MVP:** ATmega328P/Arduino Uno, LED, nút nhấn, biến trở, LCD 16x2 (song song + PCF8574), DS1307, DHT11/22, Virtual Terminal (UART), cầu nối cổng COM, logic analyzer/VCD.

---

## 4. KiCad: tái sử dụng được gì

### 4.1 Bộ mô phỏng hiện có (`eeschema/sim/`)

- `simulator.h` / `spice_simulator.h` định nghĩa interface `SIMULATOR` → `SPICE_SIMULATOR` (`Init`, `LoadNetlist`, `Command`, `Run`, `Stop`, `GetRealVector`…).
- `ngspice.cpp` nạp `libngspice` động qua `wxDynamicLibrary`, chạy `bg_run` trên luồng nền rồi đọc vector kết quả. KiCad **chỉ** dùng `ngSpice_Init/Circ/Command/Get_Vec_Info/AllPlots/AllVecs`, **không** dùng `ngSpice_Init_Sync` hay `ngSpice_Init_Evt`. Nói cách khác, KiCad không có co-simulation, không mô phỏng thời gian thực và không có linh kiện tương tác. Mô phỏng của KiCad tương đương *chế độ đồ thị* của Proteus, không phải *chế độ VSM tương tác*.
- Quy ước gắn model vào symbol qua các field: `Sim.Device`, `Sim.Type`, `Sim.Pins`, `Sim.Params`, `Sim.Library`, `Sim.Name`, `Sim.Enable`. **ProCAD nên đọc lại đúng quy ước này** và chỉ bổ sung field riêng, ví dụ `ProCAD.Model`, `ProCAD.Firmware`, `ProCAD.Clock`.
- `netlist_exporters/netlist_exporter_spice.cpp` và `spice_circuit_model.cpp` chuyển schematic sang netlist SPICE.

### 4.2 CLI và API

- `kicad-cli sch` hiện có `export` (netlist, plot, bom, pythonbom), `erc`, `diff`, `upgrade`, `downgrade` và `import`. **Không có lệnh `simulate`.**
- Netlist xuất được ở các định dạng `kicadsexpr`, `kicadxml`, `spice`, `spicemodel`, `cadstar`, `orcadpcb2`, `pads`, `allegro`. ProCAD có thể dùng `kicadxml` hoặc `kicadsexpr` làm đầu vào.
- **IPC API** (`api/proto/`, protobuf qua NNG):
  - Schematic: `GetSchematicNetlist`, `GetSchematicHierarchy`, `PlaceSymbolFromLibrary`, đọc/ghi item.
  - Cross-probe: `HighlightNets`, `SyncSelection`, `FocusOnItem`. Có thể dùng để tô sáng net đang ở mức HIGH ngay trong KiCad.
  - `kicad-cli api-server` chạy API ở chế độ headless.
  - Plugin API hiện thành nút trên toolbar Eeschema (`toolbars_sch_editor.cpp`). Đây là đường để có nút "Simulate with ProCAD" trong KiCad.
- Parser S-expression riêng (`libs/sexpr`) dùng để đọc trực tiếp `.kicad_sch`.

### 4.3 Chi phí nếu fork KiCad

- Phụ thuộc qua vcpkg: boost, wxWidgets 3.3, OpenCascade, cairo, harfbuzz, ICU, python3, ngspice, sqlite…
- Máy hiện **chưa có** cmake, trình biên dịch C/C++ hay KiCad. Chỉ có Git, Python 3.12, Node.js, .NET và Java.
- Nhánh master (10.99) chưa phát hành nên API còn thay đổi.
- `AGENTS.md` của KiCad cho phép AI hỗ trợ khi phát triển cục bộ, nhưng cấm AI tự tạo merge request hoặc issue. Mọi đóng góp ngược lên KiCad phải do người viết.

---

## 5. Các engine "kiểu Proteus" nguồn mở

### 5.1 ngspice: cắm MCU thẳng vào SPICE

- **`d_cosim`** (`src/include/ngspice/cosim.h`) là code model XSPICE nạp một shared library làm *co-simulator số*. Thư viện đó chỉ cần cài đặt `Cosim_setup()` và các hàm `step()`, `in_fn()`, `out_fn()`, đồng bộ qua biến `vtime`. ngspice đã có ví dụ dùng Verilator, GHDL và Icarus. → **Bọc simavr thành một co-sim** là cách để chạy ATmega328P trong mạch analog SPICE chính xác (chế độ "accurate").
- `ngSpice_Init_Sync` cung cấp các callback `GetVSRCData`, `GetISRCData` và `GetSyncData`. ProCAD có thể điều khiển nguồn áp/dòng từ bên ngoài và đồng bộ bước thời gian.
- `ngSpice_Init_Evt` / `ngGet_Evt_NodeInfo` đọc trạng thái các node digital.

### 5.2 simavr (C, GPL-3)

- 40 core, gồm `mega328`, `mega328pb`, `mega2560`, `mega32u4`, `tiny85`.
- Có sẵn các part: `hd44780` (LCD), `ds1338_virt` (RTC gần giống DS1307), `hc595`, `button`, `i2c_eeprom`, `ssd1306`/`sh1106` (OLED), `uart_pty`/`uart_udp`, `rotenc`.
- Xuất VCD và có gdb stub. Build trên Windows cần MSYS2 và libelf.

### 5.3 avr8js (TypeScript, MIT)

- Tập trung vào ATmega328P và chạy được cả trên Node lẫn trình duyệt. Wokwi dùng chính thư viện này để mô phỏng Arduino Uno gần thời gian thực.
- Ngoại vi có sẵn: `gpio`, `timer`, `usart`, `spi`, `twi`, `adc`, `eeprom`, `watchdog`, `clock`, `usi`.
- Nhỏ (5,4k dòng), license MIT nên dễ nhúng. Đây là **đường nhanh nhất để có Arduino Uno chạy được**.

### 5.4 SimulIDE (C++/Qt, AGPL-3): kiến trúc nên học

- **Thời gian tính bằng picosecond**, có hàng đợi sự kiện (`addEventAt`).
- **Ma trận MNA** (`circmatrix`). Mỗi phần tử cài đặt `stamp()`, `voltChanged()` và `runEvent()`. Ma trận chỉ được giải lại khi có node thay đổi, còn phần tử phi tuyến thì lặp đến khi hội tụ.
- **Vòng lặp khung hình**: giao diện cập nhật 20 FPS. Mỗi khung chạy hết các sự kiện trong `psPerFrame`, và tốc độ mô phỏng chỉnh được (`psPerSec`).
- Các core MCU: `avr`, `pic`, `i51`, `z80`, `mcs65`, `qemu` (ESP32, STM32 chạy QEMU ở process riêng qua `QProcess`).
- → Đây là mô hình nên áp dụng cho chế độ tương tác của ProCAD. **Chỉ học kiến trúc, không chép code**, vì chép code sẽ buộc ProCAD theo AGPL-3.

---

## 6. So sánh các phương án

| Tiêu chí | A. Fork KiCad (eeschema + mô phỏng tương tác) | **B. Engine độc lập + CLI + cửa sổ mô phỏng, KiCad làm editor** | C. Fork SimulIDE + import KiCad + CLI |
|---|---|---|---|
| Khối lượng | Rất lớn (1,87M dòng, build vài giờ) | **Vừa phải** (viết mới, nhỏ gọn) | Trung bình |
| Rủi ro kỹ thuật | Cao: chèn vòng lặp real-time vào wxWidgets, phải theo kịp upstream | **Trung bình**: tự viết scheduler và solver | Trung bình: phải hiểu codebase Qt lớn |
| Mô phỏng "ngay trong app" | Ngay trong KiCad | Cửa sổ ProCAD + nút plugin trong KiCad + tô sáng net qua API | Trong SimulIDE (giao diện khác KiCad) |
| CLI | Phải tự thêm vào kicad-cli | **Thiết kế từ đầu, ưu tiên CLI** | Phải tự thêm |
| License | GPL-3 | GPL-3 (do simavr) hoặc MIT/GPL (nếu chỉ dùng avr8js + ngspice) | **AGPL-3** bắt buộc |
| Hợp với sinh viên làm | Thấp | **Cao** | Trung bình |

**Khuyến nghị: phương án B**, áp dụng kiến trúc đã kiểm chứng của SimulIDE (không dùng code) và quy ước model của KiCad.

---

## 7. Kiến trúc đề xuất cho ProCAD

```
  KiCad (.kicad_sch / .kicad_pro)
        │  (1) đọc trực tiếp S-expr   (2) kicad-cli sch export netlist --format kicadxml
        │  (3) IPC API: GetSchematicNetlist (khi KiCad đang mở)
        ▼
  procad-import ──► Circuit graph: net, linh kiện, field Sim.* + ProCAD.*
        │                     │
        │          procad check: báo linh kiện chưa có model (giống ERC)
        ▼
  ┌──────────── Scheduler: thời gian ps, hàng đợi sự kiện, điều tốc real-time ────────────┐
  │                 │                          │                         │                  │
  │  Digital nets   │  Analog solver           │  MCU cores              │  Active parts    │
  │  (theo sự kiện, │  (MNA tựa tĩnh +         │  avr8js / simavr        │  LED, LCD1602,   │
  │  mức 0/1/Z/X)   │  Newton cho LED/diode)   │  (QEMU ESP32 về sau)    │  DS1307, DHT,    │
  │                 │                          │                         │  keypad, servo,  │
  │                 │                          │                         │  VTerm, COMPIM   │
  └──────── ngspice: chế độ "accurate" (batch .tran/.ac) hoặc d_cosim + simavr ───────────┘
        │
        ├── procad CLI (headless, CI, xuất VCD/CSV/JSON)
        └── JSON-RPC (stdio / WebSocket)
               ├── Cửa sổ ProCAD: SVG schematic (kicad-cli sch export svg) + lớp hoạt ảnh,
               │   bấm nút, xoay biến trở, xem LCD, terminal UART, logic analyzer
               └── Plugin KiCad: nút "Simulate", HighlightNets theo trạng thái HIGH/LOW
```

### 7.1 Interface model riêng của ProCAD (thay cho VSM SDK)

Interface mở và tự định nghĩa, ý tưởng giống VSM nhưng không dựa trên tài liệu NDA:

```text
DeviceModel
  setup(ctx)                    // khai báo chân, tham số từ field KiCad
  onPinChange(pin, level, t)    // phần số
  stamp(matrix) / onVoltage(t)  // phần analog (tuỳ chọn)
  onEvent(t)                    // sự kiện đã hẹn giờ
  uiState() / onUserInput(e)    // dữ liệu cho cửa sổ: LED sáng, ký tự LCD, nút bấm…
```

### 7.2 Ánh xạ symbol KiCad sang model

| Symbol KiCad (ví dụ) | Model ProCAD |
|---|---|
| `MCU_Module:Arduino_UNO_R3`, `MCU_Microchip_ATmega:ATmega328P-P` | `atmega328p` + `ProCAD.Firmware=build/sketch.hex` |
| `Device:LED`, `Device:R`, `Device:R_Potentiometer` | LED (Newton), điện trở, biến trở tương tác |
| `Switch:SW_Push` | nút bấm tương tác |
| `Display_Character:*` (HD44780) + `Interface_Expansion:PCF8574` | LCD1602 + I2C backpack |
| `Timer_RTC:DS1307+` | DS1307 (I2C, lấy giờ hệ thống) |
| `Sensor:DHT11` | DHT11/22 (thanh trượt nhiệt độ, độ ẩm) |

Linh kiện thụ động không có field `ProCAD.*` sẽ dùng `Sim.*` của KiCad. Nếu vẫn không có model thì `procad check` báo lỗi.

### 7.3 Phác thảo CLI

```bash
procad check   project.kicad_sch                          # liệt kê linh kiện chưa có model
procad run     project.kicad_sch --fw sketch.hex --until 5s --vcd out.vcd --serial stdout
procad run     project.kicad_sch --fw sketch.hex --realtime --gui      # mở cửa sổ mô phỏng
procad ctl     press SW1 | set RV1 0.7 | probe D13 | pause | resume    # điều khiển phiên đang chạy
procad test    scenario.yaml                              # kiểm thử tự động (UART, mức chân)
procad spice   project.kicad_sch --tran 1u 10m --out result.csv        # phân tích bằng ngspice
procad models  list
procad serve   --port 7777                                # JSON-RPC cho GUI và plugin KiCad
```

### 7.4 Công nghệ

| Lựa chọn | Ưu | Nhược |
|---|---|---|
| **TypeScript/Node (khuyến nghị cho MVP)** | Node đã có sẵn trên máy; avr8js (MIT) đã được Wokwi kiểm chứng; giao diện web dễ vẽ SVG và hoạt ảnh; gọi ngspice.dll qua FFI (koffi) hoặc WASM | Solver analog lớn sẽ chậm hơn C++ |
| C++/Qt | Nhanh; link trực tiếp simavr, ngspice; gần kiến trúc SimulIDE | Phải cài toolchain; viết GUI chậm hơn; simavr trên Windows phải qua MSYS2 |

Lõi nên tách thành các module rõ ràng (scheduler, solver, MCU, parts) để về sau có thể thay phần nặng bằng Rust/C++ mà không phải viết lại CLI và GUI.

**License:** ProCAD nên phát hành **GPL-3.0**. License này tương thích với KiCad, simavr, avr8js (MIT) và ngspice (BSD). Không chép code SimulIDE (AGPL). **Tuyệt đối không dùng** DLL, thư viện hay model của Proteus.

---

## 8. Rủi ro và cách giảm

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Không có mã nguồn hay SDK của Proteus | Chắc chắn | Tự định nghĩa interface model; hành vi linh kiện viết theo datasheet |
| Đồng bộ analog và digital theo thời gian thực | Cao | Mặc định dùng digital theo sự kiện + MNA tựa tĩnh (cách SimulIDE làm); ngspice chỉ dùng cho chế độ phân tích chính xác |
| Ánh xạ symbol sang model chưa phủ hết | Trung bình | Bảng ánh xạ + `procad check` + field `ProCAD.Model` để người dùng tự gán |
| ESP32-S3 với WiFi/BLE | Cao | Để ngoài MVP. Hướng sau: QEMU (fork của Espressif), cần kiểm chứng mức hỗ trợ S3 và mạng; mock MQTT/HTTP ở tầng firmware |
| API của KiCad master chưa ổn định | Trung bình | Bản đầu chỉ đọc file và gọi kicad-cli của KiCad bản ổn định; IPC API là tính năng tuỳ chọn, kiểm tra phiên bản trước khi dùng |
| Máy chưa cài KiCad, toolchain | Thấp | Cài KiCad bản ổn định (có kèm `kicad-cli`); nếu chọn TypeScript thì không cần trình biên dịch C++ |
| Độ chính xác so với Proteus | Trung bình | Bộ test nghiệm thu: vẽ lại B2, B3, KT1 trong KiCad và so hành vi với bản Proteus |

---

## 9. Lộ trình gợi ý (khi bắt đầu build)

Số tuần chỉ là ước lượng thô, tính cho 1 người làm bán thời gian.

| Mốc | Nội dung | Tiêu chí xong |
|---|---|---|
| M0 – Spike (~2 tuần toàn thời gian, xem [m0-ke-hoach.md](m0-ke-hoach.md)) | Netlist KiCad (XML) → mạch; chạy HEX thật trên avr8js qua CLI; LED, nút, UART, VCD | Blink đúng 1 Hz; bài B2 1.2 cho hành vi giống Proteus |
| M1 – Tương tác (3–4 tuần) | Scheduler real-time, cửa sổ SVG; LED, nút, VTerm, LCD1602 + PCF8574, DS1307 | Chạy lại bài KT1/B3 cho kết quả giống Proteus |
| M2 – Analog (3–4 tuần) | MNA: R, C, LED, diode, biến trở, ADC; logic analyzer; `procad spice` | Chia áp/biến trở → `analogRead` đúng ±1 LSB |
| M3 – Tích hợp KiCad (2 tuần) | Nút plugin, `HighlightNets`, `procad test` với scenario | Bấm Simulate trong Eeschema là mạch chạy |
| M4 – Mở rộng | ATmega2560, DHT, servo, keypad, 74HC595, COMPIM; nghiên cứu ESP32 qua QEMU | Tuỳ nhu cầu đồ án |

---

## 10. Cần chốt trước khi build

1. ~~**Stack:** TypeScript (nhanh có MVP) hay C++/Qt (hiệu năng, gần SimulIDE)?~~ → **Đã chốt 2026-10-28: TypeScript/Node + avr8js.** Kế hoạch chi tiết: [m0-ke-hoach.md](m0-ke-hoach.md)
2. **"Mô phỏng ngay trong app"** nghĩa là cửa sổ ProCAD riêng + nút trong KiCad (khả thi), hay phải vẽ hoạt ảnh **trên chính canvas của KiCad** (bắt buộc fork KiCad, phương án A)?
3. **MCU ưu tiên:** chỉ Arduino Uno trước, hay cần ESP32 sớm cho đồ án?
4. **License GPL-3** cho ProCAD có được không?

---

### Phụ lục: vị trí mã nguồn đã lấy

```
ProCAD/vendor/kicad      ← gitlab.com/kicad/code/kicad      (depth 1)
ProCAD/vendor/ngspice    ← git.code.sf.net/p/ngspice/ngspice (depth 1)
ProCAD/vendor/simavr     ← github.com/buserror/simavr
ProCAD/vendor/avr8js     ← github.com/wokwi/avr8js
ProCAD/vendor/simulide   ← github.com/eeTools/SimulIDE-dev
```

Các file đáng đọc nhất:
- `kicad/eeschema/sim/ngspice.cpp`, `spice_simulator.h`, `sim_model.h`
- `kicad/eeschema/netlist_exporters/netlist_exporter_spice.cpp`
- `kicad/api/proto/schematic/schematic_commands.proto`, `common/commands/cross_probe_commands.proto`
- `kicad/kicad/cli/command_api_server.cpp`
- `ngspice/src/include/ngspice/sharedspice.h`, `cosim.h`, `examples/xspice/verilator/`
- `simulide/src/simulator/simulator.cpp`, `e-element.h`, `circmatrix.cpp`
- `avr8js/src/cpu/`, `avr8js/src/peripherals/`
- `simavr/examples/parts/hd44780.c`, `ds1338_virt.c`
