import type { EventSink, SimEvent } from '../sim/events.js';
import { formatSeconds } from '../sim/time.js';

export interface ConsoleSinkOptions {
  /** Only print serial output and warnings. */
  quiet?: boolean;
  write?: (line: string) => void;
}

/** Serial output is stamped with the time its line ended, so the log stays in time order. */
type PartialLine = string;

function stamp(t: number): string {
  return `[${formatSeconds(t).padStart(11)}s]`;
}

function printable(byte: number): string {
  if (byte >= 0x20 && byte < 0x7f) return String.fromCharCode(byte);
  if (byte === 0x09) return '\t';
  return `\\x${byte.toString(16).padStart(2, '0')}`;
}

/** Prints serial output line by line, plus LED, button and warning events. */
export class ConsoleSink implements EventSink {
  private readonly quiet: boolean;
  private readonly write: (line: string) => void;
  private readonly lines = new Map<string, PartialLine>();

  constructor(options: ConsoleSinkOptions = {}) {
    this.quiet = options.quiet ?? false;
    this.write = options.write ?? ((line) => process.stdout.write(`${line}\n`));
  }

  handle(event: SimEvent): void {
    switch (event.kind) {
      case 'uart':
        this.uart(event.ref, event.byte, event.t);
        break;
      case 'led':
        if (!this.quiet) this.write(`${stamp(event.t)} ${event.ref} ${event.on ? 'ON' : 'off'}`);
        break;
      case 'button':
        if (!this.quiet) this.write(`${stamp(event.t)} ${event.ref} ${event.pressed ? 'pressed' : 'released'}`);
        break;
      case 'warning':
        this.write(`${stamp(event.t)} warning: ${event.message}`);
        break;
      case 'net':
        break;
    }
  }

  close(endPs: number): void {
    for (const ref of [...this.lines.keys()]) this.flushLine(ref, endPs);
  }

  private uart(ref: string, byte: number, t: number): void {
    if (byte === 0x0d) return; // println sends CR LF; the LF ends the line
    if (byte === 0x0a) {
      this.flushLine(ref, t);
      return;
    }
    this.lines.set(ref, (this.lines.get(ref) ?? '') + printable(byte));
  }

  private flushLine(ref: string, t: number): void {
    const line = this.lines.get(ref);
    if (line === undefined) return;
    this.lines.delete(ref);
    this.write(`${stamp(t)} ${ref}> ${line}`);
  }
}
