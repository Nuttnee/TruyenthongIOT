import type { Level } from './net-solver.js';

/** Everything observable that happens during a run, in picoseconds. */
export type SimEvent =
  | { kind: 'net'; t: number; net: string; level: Level }
  | { kind: 'led'; t: number; ref: string; on: boolean }
  | { kind: 'button'; t: number; ref: string; pressed: boolean }
  | { kind: 'uart'; t: number; ref: string; byte: number }
  | { kind: 'warning'; t: number; message: string };

/** Receives events in time order once every MCU has simulated past them. */
export interface EventSink {
  handle(event: SimEvent): void;
  /** Called once when the run ends, with the final simulation time. */
  close?(endPs: number): void;
}
