import { closeSync, openSync, writeSync } from 'node:fs';
import type { EventSink, SimEvent } from '../sim/events.js';
import type { Level } from '../sim/net-solver.js';

export interface VcdSignals {
  nets: readonly string[];
  leds: readonly string[];
}

const FLUSH_BYTES = 64 * 1024;

/** VCD identifier codes use printable ASCII 33..126, in base 94. */
function idCode(index: number): string {
  let code = '';
  let n = index;
  do {
    code += String.fromCharCode(33 + (n % 94));
    n = Math.floor(n / 94) - 1;
  } while (n >= 0);
  return code;
}

/** VCD names cannot contain spaces; KiCad's leading "/" for local labels is dropped. */
function vcdName(name: string): string {
  return name.replace(/^\//, '').replace(/[^A-Za-z0-9_+\-()[\].]/g, '_') || '_';
}

function vcdValue(level: Level | boolean): string {
  if (level === true || level === 1) return '1';
  if (level === false || level === 0) return '0';
  return level === 'Z' ? 'z' : 'x';
}

/**
 * Writes net levels and LED states as a Value Change Dump (IEEE 1364), with a
 * 1 ns timescale.  Opens in GTKWave, PulseView and most waveform viewers.
 */
export class VcdWriter implements EventSink {
  private readonly fd: number;
  private readonly netIds = new Map<string, string>();
  private readonly ledIds = new Map<string, string>();
  private buffer = '';
  private lastTimeNs = -1;

  constructor(path: string, signals: VcdSignals, designName = 'procad') {
    this.fd = openSync(path, 'w');
    let next = 0;
    for (const net of signals.nets) this.netIds.set(net, idCode(next++));
    for (const led of signals.leds) this.ledIds.set(led, idCode(next++));

    const lines = [
      `$date ${new Date().toISOString()} $end`,
      '$version ProCAD $end',
      '$timescale 1ns $end',
      `$scope module ${vcdName(designName)} $end`,
      '$scope module nets $end',
      ...[...this.netIds].map(([net, id]) => `$var wire 1 ${id} ${vcdName(net)} $end`),
      '$upscope $end',
      '$scope module leds $end',
      ...[...this.ledIds].map(([led, id]) => `$var wire 1 ${id} ${vcdName(led)} $end`),
      '$upscope $end',
      '$upscope $end',
      '$enddefinitions $end',
      // Nets start floating and LEDs dark; anything driven at t=0 follows below.
      '#0',
      '$dumpvars',
      ...[...this.netIds.values()].map((id) => `z${id}`),
      ...[...this.ledIds.values()].map((id) => `0${id}`),
      '$end',
    ];
    this.buffer = `${lines.join('\n')}\n`;
    this.lastTimeNs = 0;
  }

  handle(event: SimEvent): void {
    if (event.kind === 'net') {
      const id = this.netIds.get(event.net);
      if (id) this.change(event.t, `${vcdValue(event.level)}${id}`);
    } else if (event.kind === 'led') {
      const id = this.ledIds.get(event.ref);
      if (id) this.change(event.t, `${vcdValue(event.on)}${id}`);
    }
  }

  close(endPs: number): void {
    const endNs = Math.round(endPs / 1000);
    if (endNs > this.lastTimeNs) this.buffer += `#${endNs}\n`;
    writeSync(this.fd, this.buffer);
    closeSync(this.fd);
  }

  private change(t: number, line: string): void {
    const timeNs = Math.round(t / 1000);
    if (timeNs > this.lastTimeNs) {
      this.buffer += `#${timeNs}\n`;
      this.lastTimeNs = timeNs;
    }
    this.buffer += `${line}\n`;
    if (this.buffer.length > FLUSH_BYTES) {
      writeSync(this.fd, this.buffer);
      this.buffer = '';
    }
  }
}
