# ProCAD

Mô phỏng mạch vẽ bằng KiCad, kèm vi điều khiển chạy firmware thật, điều khiển hoàn toàn bằng dòng lệnh.
Đây là bản **M0**: chạy không giao diện, mô phỏng ở mức logic (chưa tính điện áp), và chỉ hỗ trợ ATmega328P / Arduino Uno.

- Nghiên cứu khả thi: [docs/nghien-cuu-kha-thi.md](docs/nghien-cuu-kha-thi.md)
- Kế hoạch và trạng thái M0: [docs/m0-ke-hoach.md](docs/m0-ke-hoach.md)

## Cài đặt

Cần Node.js 20 trở lên.

```bash
npm install
npm run build
```

Sau khi build có thể chạy `node dist/cli/index.js`. Khi đang phát triển thì dùng `npm run procad -- <lệnh>` (chạy thẳng file TypeScript qua tsx).

## Đầu vào

ProCAD nhận một trong các dạng sau:
- Thư mục project KiCad, file `.kicad_pro` hoặc `.kicad_sch`: ProCAD tự gọi `kicad-cli` (KiCad 9 trở lên). Nếu `kicad-cli` không nằm ở chỗ mặc định thì đặt biến môi trường `PROCAD_KICAD_CLI`.
- Netlist đã xuất sẵn bằng `kicad-cli sch export netlist --format kicadxml`. Nếu thư mục chỉ có `netlist.xml` thì ProCAD dùng file đó.

Gắn firmware cho MCU bằng field `ProCAD.Firmware` trên symbol (đường dẫn tính từ thư mục project), hoặc dùng `--fw REF=file.hex` khi chạy.

| Symbol KiCad | Model |
|---|---|
| `MCU_Module:Arduino_UNO_R3`, `MCU_Microchip_ATmega:ATmega328P-*` | ATmega328P (avr8js): GPIO, timer, USART (cả dạng sóng trên chân TX/RX), ADC theo mức logic |
| `Device:R*` | điện trở (truyền mức logic ở cường độ "pull") |
| `Device:LED*` | LED, sáng khi anode ở mức 1 và cathode ở mức 0 |
| `Switch:SW_Push*`, `Switch:SW_SPST*` | nút nhấn |
| Net tên `GND`, `+5V`, `VCC`, `+3V3`… | ray nguồn |

Field `ProCAD.Model` (`atmega328p`, `arduino-uno`, `resistor`, `led`, `button`, `none`) dùng để ép model cho symbol khác. `ProCAD.Clock` đặt tần số MCU, mặc định 16 MHz.

## Ví dụ

```bash
procad netlist test/fixtures/blink
procad check   test/fixtures/b2-bai1.1
procad run     test/fixtures/blink --until 5s --vcd out/blink.vcd --stats
procad run     test/fixtures/b2-bai1.2 --press SW1@1s:3.2s --press SW1@5s:150ms --until 7s
procad run     test/fixtures/b2-bai1.1 --serial-in ARD1@0.5s=1 --until 1s
procad run     test/fixtures/b2-bai1.1 --stdin ARD1 --realtime --until 60s   # gõ phím như Virtual Terminal
```

Các tuỳ chọn của `run`:
- `--until`, `--until-serial`: điều kiện dừng.
- `--press`, `--serial-in`, `--stdin`: tác động đầu vào.
- `--realtime`, `--speed`: chạy theo đồng hồ thật.
- `--vcd`, `--trace`, `--probe`: ghi kết quả ra file.
- `--quantum`: độ lệch thời gian tối đa giữa các MCU.
- `--stats`, `--quiet`, `--allow-unmapped`.

Xem chi tiết bằng `procad run --help`.

**Mã thoát:**
- 0: OK
- 1: sai cú pháp lệnh
- 2: không đọc được thiết kế
- 3: có linh kiện chưa có model
- 4: lỗi firmware
- 5: lỗi khi chạy, hoặc chuỗi chờ của `--until-serial` không xuất hiện
- 130: bị ngắt bằng Ctrl+C

## Phát triển

```bash
npm test            # unit test + nghiệm thu F1/F2/F3
npm run typecheck
npm run bench       # đo tốc độ; nên chạy khi máy đang rảnh
npm run fixtures    # build lại HEX của fixture bằng arduino-cli
```

## License

GPL-3.0-or-later. Xem [LICENSE](LICENSE). Lõi AVR là [avr8js](https://github.com/wokwi/avr8js), license MIT.
