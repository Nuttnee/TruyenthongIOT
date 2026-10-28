import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapNetlist, mcuPortPin, parseResistance, powerNetLevel } from '../src/circuit/mapping.js';
import type { Component } from '../src/circuit/netlist.js';
import { loadNetlist } from '../src/import/load.js';
import { FIXTURES } from './helpers/run-fixture.js';

function component(overrides: Partial<Component>): Component {
  return { ref: 'X1', value: '', lib: '', part: '', fields: {}, excludedFromSim: false, dnp: false, ...overrides };
}

describe('parseResistance', () => {
  it.each([
    ['220', 220],
    ['10k', 10_000],
    ['4k7', 4_700],
    ['2.2k', 2_200],
    ['1M', 1_000_000],
    ['1Meg', 1_000_000],
    ['220R', 220],
    ['1R5', 1.5],
    ['330 Ω', 330],
  ])('%s -> %d', (text, ohms) => expect(parseResistance(text)).toBe(ohms));

  it('returns null for text it cannot read', () => {
    expect(parseResistance('R')).toBeNull();
    expect(parseResistance('2.2k2')).toBeNull();
  });
});

describe('mcuPortPin', () => {
  it('maps Arduino UNO pin names', () => {
    expect(mcuPortPin('arduino-uno', 'D0/RX')).toEqual({ port: 'D', bit: 0 });
    expect(mcuPortPin('arduino-uno', 'D7')).toEqual({ port: 'D', bit: 7 });
    expect(mcuPortPin('arduino-uno', 'D8')).toEqual({ port: 'B', bit: 0 });
    expect(mcuPortPin('arduino-uno', 'D13')).toEqual({ port: 'B', bit: 5 });
    expect(mcuPortPin('arduino-uno', 'SDA/A4')).toEqual({ port: 'C', bit: 4 });
    expect(mcuPortPin('arduino-uno', 'AREF')).toBeNull();
    expect(mcuPortPin('arduino-uno', 'D14')).toBeNull();
  });

  it('maps ATmega328P pin names', () => {
    expect(mcuPortPin('atmega', 'PB5')).toEqual({ port: 'B', bit: 5 });
    expect(mcuPortPin('atmega', 'XTAL1/PB6')).toEqual({ port: 'B', bit: 6 });
    expect(mcuPortPin('atmega', '~{RESET}/PC6')).toEqual({ port: 'C', bit: 6 });
    expect(mcuPortPin('atmega', 'VCC')).toBeNull();
  });
});

describe('powerNetLevel', () => {
  it('recognises power symbols by net name', () => {
    expect(powerNetLevel('GND')).toBe(0);
    expect(powerNetLevel('GNDD')).toBe(0);
    expect(powerNetLevel('+5V')).toBe(1);
    expect(powerNetLevel('+3V3')).toBe(1);
    expect(powerNetLevel('VCC')).toBe(1);
    expect(powerNetLevel('/LED')).toBeNull();
    expect(powerNetLevel('Net-(D1-A)')).toBeNull();
  });
});

describe('mapNetlist', () => {
  const netlist = (components: Component[]) => ({ source: 'test', baseDir: '.', components, nets: [] });

  it('maps the blink fixture', () => {
    const mapping = mapNetlist(loadNetlist(join(FIXTURES, 'blink')));
    expect(mapping.issues).toEqual([]);
    expect(mapping.parts.map((p) => [p.component.ref, p.model.kind])).toEqual([
      ['A1', 'mcu'],
      ['R1', 'resistor'],
      ['D1', 'led'],
    ]);
    expect(mapping.parts[0]!.model).toMatchObject({ pinScheme: 'arduino-uno', clockHz: 16e6, firmware: 'blink.hex' });
  });

  it('reports parts without a model as errors', () => {
    const mapping = mapNetlist(netlist([component({ ref: 'U1', lib: 'Sensor', part: 'DHT11' })]));
    expect(mapping.parts).toEqual([]);
    expect(mapping.issues).toEqual([expect.objectContaining({ severity: 'error', ref: 'U1' })]);
  });

  it('honours ProCAD.Model, ProCAD.Clock and exclusion flags', () => {
    const mapping = mapNetlist(
      netlist([
        component({ ref: 'U1', lib: 'Custom', part: 'Uno', fields: { 'ProCAD.Model': 'arduino-uno', 'ProCAD.Clock': '8MHz' } }),
        component({ ref: 'J1', lib: 'Connector', part: 'Conn_01x02', fields: { 'ProCAD.Model': 'none' } }),
        component({ ref: 'U2', lib: 'Sensor', part: 'DHT11', excludedFromSim: true }),
        component({ ref: 'U3', lib: 'Sensor', part: 'DHT11', fields: { 'ProCAD.Model': 'flux-capacitor' } }),
      ]),
    );
    expect(mapping.parts.map((p) => p.model)).toEqual([
      { kind: 'mcu', mcu: 'atmega328p', pinScheme: 'arduino-uno', clockHz: 8e6 },
      { kind: 'ignore', reason: 'ProCAD.Model=none' },
      { kind: 'ignore', reason: 'excluded from simulation' },
    ]);
    expect(mapping.issues.map((i) => i.ref)).toEqual(['U3']);
  });
});
