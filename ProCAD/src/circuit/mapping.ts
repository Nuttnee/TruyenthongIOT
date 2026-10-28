import { parseFrequency } from '../sim/time.js';
import type { Component, Netlist } from './netlist.js';

export type PortName = 'B' | 'C' | 'D';

export interface PortPin {
  port: PortName;
  bit: number;
}

/** How a symbol's pin names translate to ATmega328P port pins. */
export type McuPinScheme = 'arduino-uno' | 'atmega';

export type PartModel =
  | { kind: 'mcu'; mcu: 'atmega328p'; pinScheme: McuPinScheme; clockHz: number; firmware?: string }
  | { kind: 'resistor'; ohms: number | null }
  | { kind: 'led' }
  | { kind: 'button' }
  | { kind: 'ignore'; reason: string };

export interface MappedComponent {
  component: Component;
  model: PartModel;
}

export interface MappingIssue {
  severity: 'error' | 'warning';
  ref: string;
  message: string;
}

export interface MappingResult {
  parts: MappedComponent[];
  issues: MappingIssue[];
}

/** Field that overrides the automatic choice of model. */
export const MODEL_FIELD = 'ProCAD.Model';
export const FIRMWARE_FIELD = 'ProCAD.Firmware';
export const CLOCK_FIELD = 'ProCAD.Clock';

const DEFAULT_CLOCK_HZ = 16e6;

const ARDUINO_UNO_PARTS = /^Arduino_UNO_R[23]$/;
const ATMEGA328_PARTS = /^ATmega328P?-/;
const RESISTOR_PARTS = /^R(_Small)?(_US)?$/;
const LED_PARTS = /^LED(_Small)?(_Filled)?(_ALT)?$/;
const BUTTON_PARTS = /^SW_(Push|SPST)(_Small)?$/;

const MODEL_NAMES = ['atmega328p', 'arduino-uno', 'resistor', 'led', 'button', 'none'] as const;

export function mapNetlist(netlist: Netlist): MappingResult {
  const parts: MappedComponent[] = [];
  const issues: MappingIssue[] = [];
  for (const component of netlist.components) {
    const model = mapComponent(component, issues);
    if (model) parts.push({ component, model });
  }
  return { parts, issues };
}

function mapComponent(component: Component, issues: MappingIssue[]): PartModel | null {
  const { ref, lib, part, fields } = component;
  if (component.excludedFromSim) return { kind: 'ignore', reason: 'excluded from simulation' };
  if (component.dnp) return { kind: 'ignore', reason: 'do not populate' };

  const explicit = fields[MODEL_FIELD]?.trim().toLowerCase();
  if (explicit) {
    if (!(MODEL_NAMES as readonly string[]).includes(explicit)) {
      issues.push({
        severity: 'error',
        ref,
        message: `${MODEL_FIELD}="${fields[MODEL_FIELD]}" is not one of ${MODEL_NAMES.join(', ')}`,
      });
      return null;
    }
    switch (explicit) {
      case 'atmega328p':
        return mcuModel(component, 'atmega', issues);
      case 'arduino-uno':
        return mcuModel(component, 'arduino-uno', issues);
      case 'resistor':
        return resistorModel(component, issues);
      case 'led':
        return { kind: 'led' };
      case 'button':
        return { kind: 'button' };
      default:
        return { kind: 'ignore', reason: `${MODEL_FIELD}=none` };
    }
  }

  if (lib === 'MCU_Module' && ARDUINO_UNO_PARTS.test(part)) return mcuModel(component, 'arduino-uno', issues);
  if (lib === 'MCU_Microchip_ATmega' && ATMEGA328_PARTS.test(part)) return mcuModel(component, 'atmega', issues);
  if (lib === 'Device' && RESISTOR_PARTS.test(part)) return resistorModel(component, issues);
  if (lib === 'Device' && LED_PARTS.test(part)) return { kind: 'led' };
  if (lib === 'Switch' && BUTTON_PARTS.test(part)) return { kind: 'button' };

  issues.push({
    severity: 'error',
    ref,
    message: `no simulation model for ${lib}:${part}; set ${MODEL_FIELD} (${MODEL_NAMES.join(', ')})`,
  });
  return null;
}

function mcuModel(component: Component, pinScheme: McuPinScheme, issues: MappingIssue[]): PartModel {
  let clockHz = DEFAULT_CLOCK_HZ;
  const clockField = component.fields[CLOCK_FIELD];
  if (clockField) {
    try {
      clockHz = parseFrequency(clockField);
    } catch (error) {
      issues.push({ severity: 'error', ref: component.ref, message: (error as Error).message });
    }
  }
  const firmware = component.fields[FIRMWARE_FIELD]?.trim() || undefined;
  return { kind: 'mcu', mcu: 'atmega328p', pinScheme, clockHz, ...(firmware ? { firmware } : {}) };
}

function resistorModel(component: Component, issues: MappingIssue[]): PartModel {
  const ohms = parseResistance(component.value);
  if (ohms === null) {
    issues.push({
      severity: 'warning',
      ref: component.ref,
      message: `cannot read resistance "${component.value}"; logic simulation does not need it yet`,
    });
  }
  return { kind: 'resistor', ohms };
}

/** Reads values such as "220", "10k", "4k7", "1M", "2.2k", "220R", "1R5" or "330 Ω". */
export function parseResistance(value: string): number | null {
  const cleaned = value.replace(/\s+/g, '').replace(/(Ω|ohms?)$/i, '');
  const match = /^(\d+(?:\.\d+)?)(?:(R|r|k|K|M|Meg|meg|m)(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const scale: Record<string, number> = { R: 1, r: 1, k: 1e3, K: 1e3, M: 1e6, Meg: 1e6, meg: 1e6, m: 1e-3 };
  const unit = match[2];
  const digits = match[3] ?? '';
  if (!unit) return Number(match[1]);
  if (digits && match[1]!.includes('.')) return null;
  return Number(digits ? `${match[1]}.${digits}` : match[1]) * (scale[unit] ?? 1);
}

/**
 * Maps a symbol pin name to an ATmega328P port pin.  Names may hold several
 * functions separated by "/", e.g. "D0/RX", "SDA/A4", "XTAL1/PB6".
 */
export function mcuPortPin(scheme: McuPinScheme, pinFunction: string): PortPin | null {
  for (const token of pinFunction.split('/')) {
    if (scheme === 'arduino-uno') {
      const digital = /^D(\d+)$/.exec(token);
      if (digital) {
        const n = Number(digital[1]);
        if (n <= 7) return { port: 'D', bit: n };
        if (n <= 13) return { port: 'B', bit: n - 8 };
      }
      const analog = /^A([0-5])$/.exec(token);
      if (analog) return { port: 'C', bit: Number(analog[1]) };
    } else {
      const port = /^P([BCD])([0-7])$/.exec(token);
      if (port) return { port: port[1] as PortName, bit: Number(port[2]) };
    }
  }
  return null;
}

/** Logic level an MCU module puts on its own power pins (Arduino +5V/3V3 outputs, GND). */
export function mcuPowerPinLevel(pinFunction: string, pinType: string): 0 | 1 | null {
  const name = pinFunction.toUpperCase();
  if (name === 'GND' || name === 'VSS') return 0;
  if (pinType === 'power_out' && /^(\+?5V|3V3|\+3V3)$/.test(name)) return 1;
  return null;
}

/** Logic level of a power net recognised by its name (power symbols name their nets). */
export function powerNetLevel(netName: string): 0 | 1 | null {
  const name = netName.replace(/^\//, '').toUpperCase();
  if (/^(GND[A-Z]*|VSS|0)$/.test(name)) return 0;
  if (/^(\+?5V|\+?3V3|\+?3\.3V|VCC|VDD|VBUS|\+?12V|\+?9V)$/.test(name)) return 1;
  return null;
}
