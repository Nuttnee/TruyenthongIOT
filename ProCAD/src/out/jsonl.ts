import { closeSync, openSync, writeSync } from 'node:fs';
import type { EventSink, SimEvent } from '../sim/events.js';
import { PS_PER_SECOND } from '../sim/time.js';

const FLUSH_BYTES = 64 * 1024;

/** Writes one JSON object per event: {"t": seconds, "ps": picoseconds, "kind": ..., ...}. */
export class JsonlTrace implements EventSink {
  private readonly fd: number;
  private buffer = '';

  constructor(path: string) {
    this.fd = openSync(path, 'w');
  }

  handle(event: SimEvent): void {
    const { t, ...rest } = event;
    const record: Record<string, unknown> = { t: t / PS_PER_SECOND, ps: t, ...rest };
    if (event.kind === 'uart') record['char'] = String.fromCharCode(event.byte);
    this.buffer += `${JSON.stringify(record)}\n`;
    if (this.buffer.length > FLUSH_BYTES) {
      writeSync(this.fd, this.buffer);
      this.buffer = '';
    }
  }

  close(): void {
    writeSync(this.fd, this.buffer);
    closeSync(this.fd);
  }
}
