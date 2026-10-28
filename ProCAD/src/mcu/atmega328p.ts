import {
  AVRADC,
  AVRClock,
  AVREEPROM,
  AVRIOPort,
  AVRSPI,
  AVRTimer,
  AVRTWI,
  AVRUSART,
  AVRWatchdog,
  CPU,
  EEPROMMemoryBackend,
  PinState,
  adcConfig,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  spiConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  twiConfig,
  usart0Config,
  watchdogConfig,
} from 'avr8js';
import type { PortName } from '../circuit/mapping.js';
import { EventQueue } from '../sim/event-queue.js';
import { Strength } from '../sim/net-solver.js';
import { PS_PER_SECOND } from '../sim/time.js';
import { loadIntelHex } from './intel-hex.js';

export const ATMEGA328P_FLASH_BYTES = 0x8000;
const EEPROM_BYTES = 1024;
const PORT_NAMES: readonly PortName[] = ['B', 'C', 'D'];

/** What the MCU itself puts on a pin; strength Z means it is not driving. */
export interface PinDrive {
  level: 0 | 1;
  strength: Strength;
}

export type PinDriveListener = (port: PortName, bit: number, drive: PinDrive) => void;

interface UartFormat {
  dataBits: number;
  parity: 'none' | 'even' | 'odd';
  stopBits: number;
  bitCycles: number;
}

// UCSR0A/B/C bits from the ATmega328P datasheet.
const U2X = 0x02;
const UCSZ2 = 0x04;

/** Reads an Intel HEX file into a program image sized for the ATmega328P. */
export function programFromHex(hex: string): Uint16Array {
  const program = new Uint16Array(ATMEGA328P_FLASH_BYTES / 2);
  loadIntelHex(hex, new Uint8Array(program.buffer));
  return program;
}

/**
 * An ATmega328P built from avr8js peripherals, with the glue avr8js leaves to
 * the host: per-pin drive changes, timed input delivery, and the USART TX/RX
 * pins as real waveforms so MCUs can talk to each other over wires.
 */
export class Atmega328p {
  readonly cpu: CPU;
  readonly psPerCycle: number;
  readonly usart: AVRUSART;
  readonly adc: AVRADC;
  readonly ports: Readonly<Record<PortName, AVRIOPort>>;

  private readonly drives: Record<PortName, PinDrive[]>;
  private readonly inputs: Record<PortName, boolean[]>;
  private readonly pinListeners: PinDriveListener[] = [];
  private readonly uartListeners: Array<(byte: number) => void> = [];

  /** Host callbacks that must run at an exact CPU cycle. */
  private readonly pending = new EventQueue();
  private armedAtPs = Infinity;

  private txLevel: 0 | 1 = 1;
  private txBusyUntilCycle = 0;
  private receiving = false;
  private readonly serialInput: number[] = [];
  private serialRetryArmed = false;

  constructor(
    readonly ref: string,
    program: Uint16Array,
    readonly clockHz = 16e6,
  ) {
    this.cpu = new CPU(program);
    this.psPerCycle = PS_PER_SECOND / clockHz;

    const clock = new AVRClock(this.cpu, clockHz);
    new AVRWatchdog(this.cpu, watchdogConfig, clock);
    new AVRTimer(this.cpu, timer0Config);
    new AVRTimer(this.cpu, timer1Config);
    new AVRTimer(this.cpu, timer2Config);
    new AVRSPI(this.cpu, spiConfig, clockHz);
    new AVRTWI(this.cpu, twiConfig, clockHz);
    new AVREEPROM(this.cpu, new EEPROMMemoryBackend(EEPROM_BYTES));
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.usart = new AVRUSART(this.cpu, usart0Config, clockHz);

    this.ports = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    const released = (): PinDrive[] => Array.from({ length: 8 }, () => ({ level: 0, strength: Strength.Z }));
    this.drives = { B: released(), C: released(), D: released() };
    this.inputs = { B: Array(8).fill(false), C: Array(8).fill(false), D: Array(8).fill(false) };

    for (const name of PORT_NAMES) this.ports[name].addListener(() => this.refreshPort(name));
    this.usart.onConfigurationChange = () => this.refreshPort('D');
    this.usart.onByteTransmit = (byte) => this.transmit(byte);
    this.usart.onRxComplete = () => this.pumpSerialInput();
  }

  /** Local simulation time of this MCU. */
  get timePs(): number {
    return this.cpu.cycles * this.psPerCycle;
  }

  /** Executes instructions until local time reaches `tPs` (it may overshoot by one instruction). */
  runUntil(tPs: number): void {
    const target = Math.ceil(tPs / this.psPerCycle);
    const { cpu } = this;
    while (cpu.cycles < target) {
      avrInstruction(cpu);
      cpu.tick();
    }
  }

  onPinDrive(listener: PinDriveListener): void {
    this.pinListeners.push(listener);
  }

  onUartByte(listener: (byte: number) => void): void {
    this.uartListeners.push(listener);
  }

  pinDrive(port: PortName, bit: number): PinDrive {
    return this.drives[port][bit]!;
  }

  /** Sets the level the outside world presents on a pin. */
  setInput(port: PortName, bit: number, high: boolean): void {
    const previous = this.inputs[port][bit];
    if (previous === high) return;
    this.inputs[port][bit] = high;
    this.ports[port].setPin(bit, high);
    if (port === 'C' && bit < 6) this.adc.channelValues[bit] = high ? this.adc.avcc : 0;
    if (port === 'D' && bit === 0 && previous && !high) this.startUartReceive();
  }

  /** Runs `fn` when local time reaches `tPs`; immediately if it already has. */
  scheduleAt(tPs: number, fn: () => void): void {
    if (tPs <= this.timePs) {
      fn();
      return;
    }
    this.pending.push(tPs, fn);
    this.arm();
  }

  /** Queues bytes for the USART receiver, paced at the configured baud rate. */
  queueSerialInput(bytes: Iterable<number>): void {
    this.serialInput.push(...bytes);
    this.pumpSerialInput();
  }

  private readonly firePending = (): void => {
    this.armedAtPs = Infinity;
    const now = this.timePs;
    while (this.pending.peekTime() <= now) this.pending.pop()!.run();
    this.arm();
  };

  private arm(): void {
    const next = this.pending.peekTime();
    if (next === Infinity || next >= this.armedAtPs) return;
    if (this.armedAtPs !== Infinity) this.cpu.clearClockEvent(this.firePending);
    this.armedAtPs = next;
    this.cpu.addClockEvent(this.firePending, Math.ceil(next / this.psPerCycle) - this.cpu.cycles);
  }

  private refreshPort(name: PortName): void {
    const drives = this.drives[name];
    for (let bit = 0; bit < 8; bit++) {
      const next = this.computeDrive(name, bit);
      const current = drives[bit]!;
      if (next.level === current.level && next.strength === current.strength) continue;
      drives[bit] = next;
      for (const listener of this.pinListeners) listener(name, bit, next);
    }
  }

  private computeDrive(name: PortName, bit: number): PinDrive {
    // With TXEN set the USART owns PD1, whatever DDRD says.
    if (name === 'D' && bit === 1 && this.usart.txEnable) return { level: this.txLevel, strength: Strength.Strong };
    switch (this.ports[name].pinState(bit)) {
      case PinState.Low:
        return { level: 0, strength: Strength.Strong };
      case PinState.High:
        return { level: 1, strength: Strength.Strong };
      case PinState.InputPullUp:
        return { level: 1, strength: Strength.Weak };
      default:
        return { level: 0, strength: Strength.Z };
    }
  }

  private uartFormat(): UartFormat {
    const { data } = this.cpu;
    const ucsra = data[usart0Config.UCSRA]!;
    const ucsrb = data[usart0Config.UCSRB]!;
    const ucsrc = data[usart0Config.UCSRC]!;
    const ubrr = (data[usart0Config.UBRRH]! << 8) | data[usart0Config.UBRRL]!;
    const size = (ucsrb & UCSZ2) | ((ucsrc >> 1) & 0x3);
    const parityBits = (ucsrc >> 4) & 0x3;
    return {
      dataBits: size >= 4 ? 9 : 5 + size,
      parity: parityBits === 2 ? 'even' : parityBits === 3 ? 'odd' : 'none',
      stopBits: ucsrc & 0x08 ? 2 : 1,
      bitCycles: (ubrr + 1) * (ucsra & U2X ? 8 : 16),
    };
  }

  /** Plays one USART frame out on PD1, after any frame still being shifted out. */
  private transmit(byte: number): void {
    for (const listener of this.uartListeners) listener(byte);

    const format = this.uartFormat();
    const bits: Array<0 | 1> = [0];
    let ones = 0;
    for (let i = 0; i < format.dataBits; i++) {
      const bit = ((byte >> i) & 1) as 0 | 1;
      ones += bit;
      bits.push(bit);
    }
    if (format.parity !== 'none') bits.push(((ones + (format.parity === 'odd' ? 1 : 0)) & 1) as 0 | 1);
    for (let i = 0; i < format.stopBits; i++) bits.push(1);

    const start = Math.max(this.cpu.cycles, this.txBusyUntilCycle);
    bits.forEach((level, i) => {
      this.scheduleAt((start + i * format.bitCycles) * this.psPerCycle, () => {
        this.txLevel = level;
        this.refreshPort('D');
      });
    });
    this.txBusyUntilCycle = start + bits.length * format.bitCycles;
  }

  /** Samples PD0 at mid-bit after a falling edge and hands the byte to the USART. */
  private startUartReceive(): void {
    if (this.receiving || !this.usart.rxEnable) return;
    this.receiving = true;
    const format = this.uartFormat();
    const startCycle = this.cpu.cycles;
    const sampleAt = (bitIndex: number) => (startCycle + (bitIndex + 0.5) * format.bitCycles) * this.psPerCycle;
    const level = () => this.inputs.D[0]!;

    this.scheduleAt(sampleAt(0), () => {
      if (level()) {
        this.receiving = false; // glitch, not a start bit
        return;
      }
      let byte = 0;
      for (let i = 0; i < format.dataBits; i++) {
        this.scheduleAt(sampleAt(1 + i), () => {
          if (level()) byte |= 1 << i;
        });
      }
      const stopIndex = 1 + format.dataBits + (format.parity === 'none' ? 0 : 1);
      this.scheduleAt(sampleAt(stopIndex), () => {
        this.receiving = false;
        if (level()) this.usart.writeByte(byte & 0xff, true);
      });
    });
  }

  private readonly pumpSerialInput = (): void => {
    while (this.serialInput.length > 0) {
      if (!this.usart.rxEnable) {
        // Serial.begin() has not run yet; try again in a millisecond.
        if (!this.serialRetryArmed) {
          this.serialRetryArmed = true;
          this.scheduleAt(this.timePs + PS_PER_SECOND / 1000, () => {
            this.serialRetryArmed = false;
            this.pumpSerialInput();
          });
        }
        return;
      }
      if (this.usart.rxBusy) return;
      if (this.usart.writeByte(this.serialInput[0]!)) this.serialInput.shift();
      return;
    }
  };
}
