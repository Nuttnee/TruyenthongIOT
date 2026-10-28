import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mapNetlist } from '../../src/circuit/mapping.js';
import { loadNetlist } from '../../src/import/load.js';
import { programFromHex } from '../../src/mcu/atmega328p.js';
import { buildSimulation } from '../../src/sim/build.js';
import type { SimEvent } from '../../src/sim/events.js';
import type { Simulation } from '../../src/sim/simulation.js';
import { parseDuration } from '../../src/sim/time.js';

export const FIXTURES = resolve(import.meta.dirname, '..', 'fixtures');

export interface FixtureRun {
  sim: Simulation;
  events: SimEvent[];
  /** Completed serial lines per MCU, CR/LF stripped. */
  lines: Array<{ ref: string; t: number; text: string }>;
  ledChanges(ref: string): Array<{ t: number; on: boolean }>;
}

export interface FixtureStimuli {
  presses?: Array<{ ref: string; at: string; hold: string }>;
  serial?: Array<{ ref: string; at: string; text: string }>;
}

/** Loads a fixture through the same path as the CLI and runs it headless. */
export async function runFixture(name: string, until: string, stimuli: FixtureStimuli = {}): Promise<FixtureRun> {
  const netlist = loadNetlist(join(FIXTURES, name));
  const mapping = mapNetlist(netlist);
  const programs = new Map<string, Uint16Array>();
  for (const { component, model } of mapping.parts) {
    if (model.kind !== 'mcu' || !model.firmware) continue;
    programs.set(component.ref, programFromHex(readFileSync(join(netlist.baseDir, model.firmware), 'utf8')));
  }
  const sim = buildSimulation(netlist, mapping, programs);

  const events: SimEvent[] = [];
  sim.addSink({ handle: (event) => events.push(event) });

  for (const press of stimuli.presses ?? []) {
    const at = parseDuration(press.at);
    const release = at + parseDuration(press.hold);
    const button = sim.buttons.get(press.ref)!;
    sim.schedule(at, () => button.set(true, at));
    sim.schedule(release, () => button.set(false, release));
  }
  for (const input of stimuli.serial ?? []) {
    const mcu = sim.mcus.find((m) => m.ref === input.ref)!;
    sim.schedule(parseDuration(input.at), () => mcu.queueSerialInput(Buffer.from(input.text, 'latin1')));
  }

  await sim.run(parseDuration(until));
  sim.finish();

  const lines: FixtureRun['lines'] = [];
  const partial = new Map<string, string>();
  for (const event of events) {
    if (event.kind !== 'uart' || event.byte === 0x0d) continue;
    if (event.byte === 0x0a) {
      lines.push({ ref: event.ref, t: event.t, text: partial.get(event.ref) ?? '' });
      partial.delete(event.ref);
    } else {
      partial.set(event.ref, (partial.get(event.ref) ?? '') + String.fromCharCode(event.byte));
    }
  }

  return {
    sim,
    events,
    lines,
    ledChanges: (ref) =>
      events.flatMap((e) => (e.kind === 'led' && e.ref === ref ? [{ t: e.t, on: e.on }] : [])),
  };
}
