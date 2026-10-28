import type { Atmega328p } from '../mcu/atmega328p.js';
import type { Button } from '../parts/button.js';
import type { Led } from '../parts/led.js';
import type { Circuit } from './circuit.js';
import { EventQueue } from './event-queue.js';
import type { EventSink, SimEvent } from './events.js';
import { PS_PER_SECOND } from './time.js';

export interface RunOptions {
  /** Pace the run against the wall clock instead of running flat out. */
  realtime?: boolean;
  /** Real-time speed factor: 1 = real time, 0.5 = half speed. */
  speed?: number;
  /** Simulated time between stop checks and pacing decisions. */
  slicePs?: number;
  signal?: AbortSignal;
}

export type RunOutcome = 'completed' | 'stopped' | 'aborted';

export interface SimulationStats {
  simulatedPs: number;
  wallMs: number;
  cycles: Record<string, number>;
  /** Inputs that reached an MCU after it had already simulated past them. */
  lateDeliveries: number;
  maxLatenessPs: number;
}

const DEFAULT_SLICE_PS = PS_PER_SECOND / 1000;
const DEFAULT_QUANTUM_PS = PS_PER_SECOND / 1_000_000;
/** Lateness below this is just the last instruction overshooting its target. */
const LATE_TOLERANCE_CYCLES = 8;

/**
 * Owns simulated time.  Each MCU runs ahead on its own clock; the simulation
 * keeps them within one quantum of each other, runs scheduled stimuli once
 * every MCU has reached their time, and releases observable events to sinks
 * in time order.
 */
export class Simulation {
  /** Every MCU has simulated at least this far. */
  timePs = 0;
  quantumPs = DEFAULT_QUANTUM_PS;
  readonly mcus: Atmega328p[] = [];
  readonly leds = new Map<string, Led>();
  readonly buttons = new Map<string, Button>();

  private readonly queue = new EventQueue();
  private readonly sinks: EventSink[] = [];
  private buffered: Array<{ event: SimEvent; seq: number }> = [];
  private emitSeq = 0;
  private stopRequested = false;
  private lateDeliveries = 0;
  private maxLatenessPs = 0;
  private wallMs = 0;

  constructor(readonly circuit: Circuit) {}

  addSink(sink: EventSink): void {
    this.sinks.push(sink);
  }

  emit(event: SimEvent): void {
    this.buffered.push({ event, seq: this.emitSeq++ });
  }

  warn(message: string, t = this.timePs): void {
    this.emit({ kind: 'warning', t, message });
  }

  /** Runs `fn` once every MCU has reached `tPs`. */
  schedule(tPs: number, fn: () => void): void {
    this.queue.push(Math.max(tPs, this.timePs), fn);
  }

  requestStop(): void {
    this.stopRequested = true;
  }

  /** Delivers a net change seen at `t` to an MCU, exactly if it has not got there yet. */
  deliver(mcu: Atmega328p, t: number, fn: () => void): void {
    const lateness = mcu.timePs - t;
    if (lateness < 0) {
      mcu.scheduleAt(t, fn);
      return;
    }
    if (lateness > LATE_TOLERANCE_CYCLES * mcu.psPerCycle) {
      this.lateDeliveries++;
      this.maxLatenessPs = Math.max(this.maxLatenessPs, lateness);
    }
    fn();
  }

  async run(endPs: number, options: RunOptions = {}): Promise<RunOutcome> {
    const slicePs = options.slicePs ?? DEFAULT_SLICE_PS;
    const speed = options.realtime ? (options.speed ?? 1) : 0;
    const wallStart = performance.now();
    const simStart = this.timePs;
    let lastYield = wallStart;

    try {
      while (this.timePs < endPs && !this.stopRequested && !options.signal?.aborted) {
        this.advanceTo(Math.min(endPs, this.timePs + slicePs));

        if (speed > 0) {
          const dueMs = wallStart + (this.timePs - simStart) / 1e9 / speed;
          const waitMs = dueMs - performance.now();
          if (waitMs > 1) await new Promise((resolve) => setTimeout(resolve, waitMs));
        } else if (performance.now() - lastYield > 50) {
          // Let signal handlers and stdin run during long headless runs.
          await new Promise((resolve) => setImmediate(resolve));
          lastYield = performance.now();
        }
      }
    } finally {
      this.wallMs += performance.now() - wallStart;
    }

    if (this.stopRequested) return 'stopped';
    return options.signal?.aborted ? 'aborted' : 'completed';
  }

  /** Flushes buffered events and tells sinks the run is over. */
  finish(): void {
    this.flushEvents(Infinity);
    for (const sink of this.sinks) sink.close?.(this.timePs);
  }

  stats(): SimulationStats {
    return {
      simulatedPs: this.timePs,
      wallMs: this.wallMs,
      cycles: Object.fromEntries(this.mcus.map((mcu) => [mcu.ref, mcu.cpu.cycles])),
      lateDeliveries: this.lateDeliveries,
      maxLatenessPs: this.maxLatenessPs,
    };
  }

  private advanceTo(targetPs: number): void {
    for (;;) {
      const next = this.queue.peekTime();
      const stepTo = Math.min(targetPs, next);
      this.advanceMcus(stepTo);
      this.timePs = Math.max(this.timePs, stepTo);
      this.flushEvents(this.timePs);
      if (next > targetPs) return;
      while (this.queue.peekTime() === next) this.queue.pop()!.run();
    }
  }

  private advanceMcus(targetPs: number): void {
    const { mcus } = this;
    if (mcus.length === 1) {
      mcus[0]!.runUntil(targetPs);
      return;
    }
    for (;;) {
      let laggard: Atmega328p | undefined;
      for (const mcu of mcus) if (!laggard || mcu.timePs < laggard.timePs) laggard = mcu;
      if (!laggard || laggard.timePs >= targetPs) return;
      laggard.runUntil(Math.min(targetPs, laggard.timePs + this.quantumPs));
    }
  }

  /** Releases events no MCU can still precede: everything at or before `horizonPs`. */
  private flushEvents(horizonPs: number): void {
    if (this.buffered.length === 0) return;
    const ready: typeof this.buffered = [];
    const later: typeof this.buffered = [];
    for (const entry of this.buffered) (entry.event.t <= horizonPs ? ready : later).push(entry);
    this.buffered = later;
    ready.sort((a, b) => a.event.t - b.event.t || a.seq - b.seq);
    for (const { event } of ready) for (const sink of this.sinks) sink.handle(event);
  }
}
