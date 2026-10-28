import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { type MappingResult, mapNetlist } from '../circuit/mapping.js';
import type { Netlist } from '../circuit/netlist.js';
import { IntelHexError } from '../mcu/intel-hex.js';
import { programFromHex } from '../mcu/atmega328p.js';
import { ConsoleSink } from '../out/console.js';
import { JsonlTrace } from '../out/jsonl.js';
import { VcdWriter } from '../out/vcd.js';
import { buildSimulation } from '../sim/build.js';
import type { Simulation } from '../sim/simulation.js';
import { formatSeconds, parseDuration } from '../sim/time.js';
import { CliError, ExitCode } from './exit-codes.js';
import { loadInput, reportIssues } from './input.js';
import { parsePress, parseSerialIn } from './stimulus.js';

export interface RunCommandOptions {
  fw: string[];
  until: string;
  untilSerial?: string;
  press: string[];
  serialIn: string[];
  stdin?: string;
  realtime: boolean;
  speed: string;
  vcd?: string;
  trace?: string;
  probe?: string;
  quantum: string;
  stats: boolean;
  quiet: boolean;
  allowUnmapped: boolean;
}

function usage(message: string): CliError {
  return new CliError(message, ExitCode.Usage);
}

function parseOrUsage<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw usage((error as Error).message);
  }
}

export async function runCommand(input: string, options: RunCommandOptions): Promise<number> {
  const untilPs = parseOrUsage(() => parseDuration(options.until));
  const quantumPs = parseOrUsage(() => parseDuration(options.quantum));
  const speed = Number(options.speed);
  if (!(speed > 0)) throw usage(`--speed "${options.speed}" must be a positive number`);
  const presses = options.press.map((spec) => parseOrUsage(() => parsePress(spec)));
  const serialInputs = options.serialIn.map((spec) => parseOrUsage(() => parseSerialIn(spec)));

  const netlist = loadInput(input);
  const mapping = mapNetlist(netlist);
  reportIssues(mapping);
  if (!options.allowUnmapped && mapping.issues.some((issue) => issue.severity === 'error')) {
    throw new CliError('some components have no simulation model (use --allow-unmapped to skip them)', ExitCode.Unmapped);
  }

  const programs = loadFirmware(netlist, mapping, options.fw);
  const sim = buildSimulation(netlist, mapping, programs);
  sim.quantumPs = quantumPs;

  for (const press of presses) {
    const button = sim.buttons.get(press.ref);
    if (!button) throw usage(`--press: no button ${press.ref} (buttons: ${[...sim.buttons.keys()].join(', ') || 'none'})`);
    sim.schedule(press.atPs, () => button.set(true, press.atPs));
    sim.schedule(press.atPs + press.durationPs, () => button.set(false, press.atPs + press.durationPs));
  }
  for (const input of serialInputs) {
    const mcu = findMcu(sim, input.ref, '--serial-in');
    sim.schedule(input.atPs, () => mcu.queueSerialInput(input.bytes));
  }

  attachSinks(sim, netlist, options);

  let stopReason = '';
  if (options.untilSerial) {
    const wanted = options.untilSerial;
    for (const mcu of sim.mcus) {
      let recent = '';
      mcu.onUartByte((byte) => {
        recent = (recent + String.fromCharCode(byte)).slice(-Math.max(256, wanted.length * 2));
        if (!stopReason && recent.includes(wanted)) {
          stopReason = `${mcu.ref} printed "${wanted}"`;
          sim.requestStop();
        }
      });
    }
  }

  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.once('SIGINT', onSigint);
  const detachStdin = options.stdin ? forwardStdin(sim, findMcu(sim, options.stdin, '--stdin'), controller) : null;

  let outcome;
  try {
    outcome = await sim.run(untilPs, { realtime: options.realtime, speed, signal: controller.signal });
  } finally {
    process.off('SIGINT', onSigint);
    detachStdin?.();
    sim.finish();
  }

  if (outcome === 'stopped') {
    process.stderr.write(`procad: stopped at ${formatSeconds(sim.timePs)} s: ${stopReason}\n`);
  } else if (outcome === 'aborted') {
    process.stderr.write(`procad: interrupted at ${formatSeconds(sim.timePs)} s\n`);
  } else if (options.untilSerial) {
    process.stderr.write(`procad: "${options.untilSerial}" never appeared before ${options.until}\n`);
  }
  if (options.stats) printStats(sim);

  if (outcome === 'aborted') return 130;
  return options.untilSerial && outcome !== 'stopped' ? ExitCode.Runtime : ExitCode.Ok;
}

function findMcu(sim: Simulation, ref: string, option: string) {
  const mcu = sim.mcus.find((m) => m.ref === ref);
  if (!mcu) throw usage(`${option}: no MCU ${ref} (MCUs: ${sim.mcus.map((m) => m.ref).join(', ') || 'none'})`);
  return mcu;
}

/** Resolves and loads the HEX file of every MCU: --fw overrides, then the ProCAD.Firmware field. */
function loadFirmware(netlist: Netlist, mapping: MappingResult, specs: string[]): Map<string, Uint16Array> {
  const mcus = mapping.parts.filter((part) => part.model.kind === 'mcu');
  const overrides = new Map<string, string>();
  for (const spec of specs) {
    const eq = spec.indexOf('=');
    if (eq > 0) overrides.set(spec.slice(0, eq), spec.slice(eq + 1));
    else if (mcus.length === 1) overrides.set(mcus[0]!.component.ref, spec);
    else throw usage(`--fw "${spec}": write REF=file.hex when the circuit has ${mcus.length} MCUs`);
  }
  for (const ref of overrides.keys()) {
    if (!mcus.some((part) => part.component.ref === ref)) throw usage(`--fw: no MCU ${ref}`);
  }

  const programs = new Map<string, Uint16Array>();
  for (const { component, model } of mcus) {
    if (model.kind !== 'mcu') continue;
    const override = overrides.get(component.ref);
    const path = override ? resolve(override) : model.firmware ? resolve(netlist.baseDir, model.firmware) : null;
    if (!path) {
      throw new CliError(
        `${component.ref}: no firmware; add a ProCAD.Firmware field or pass --fw ${component.ref}=file.hex`,
        ExitCode.Firmware,
      );
    }
    if (!existsSync(path)) throw new CliError(`${component.ref}: firmware ${path} not found`, ExitCode.Firmware);
    if (extname(path).toLowerCase() !== '.hex') {
      throw new CliError(`${component.ref}: ${path}: only Intel HEX firmware is supported`, ExitCode.Firmware);
    }
    try {
      programs.set(component.ref, programFromHex(readFileSync(path, 'utf8')));
    } catch (error) {
      if (error instanceof IntelHexError) throw new CliError(`${path}: ${error.message}`, ExitCode.Firmware);
      throw error;
    }
  }
  return programs;
}

function normalise(name: string): string {
  return name.replace(/^\//, '');
}

function attachSinks(sim: Simulation, netlist: Netlist, options: RunCommandOptions): void {
  sim.addSink(new ConsoleSink({ quiet: options.quiet }));

  const probes = options.probe
    ? new Set(options.probe.split(',').map((p) => normalise(p.trim())).filter(Boolean))
    : null;
  const nets = netlist.nets
    .map((net) => net.name)
    .filter((name) => (probes ? probes.has(normalise(name)) : !name.startsWith('unconnected-')));
  const leds = [...sim.leds.keys()].filter((ref) => !probes || probes.has(ref));
  if (probes) {
    const known = new Set([...nets.map(normalise), ...leds]);
    const unknown = [...probes].filter((p) => !known.has(p));
    if (unknown.length > 0) throw usage(`--probe: unknown net or LED: ${unknown.join(', ')}`);
  }

  if (options.vcd) sim.addSink(new VcdWriter(options.vcd, { nets, leds }));
  if (options.trace) sim.addSink(new JsonlTrace(options.trace));
}

/** Sends keystrokes to an MCU's USART; Ctrl+C still interrupts in raw mode. */
function forwardStdin(sim: Simulation, mcu: Simulation['mcus'][number], controller: AbortController): () => void {
  const { stdin } = process;
  if (stdin.isTTY) stdin.setRawMode(true);
  const onData = (chunk: Buffer) => {
    if (chunk.includes(0x03)) {
      controller.abort();
      return;
    }
    const bytes = [...chunk];
    sim.schedule(sim.timePs, () => mcu.queueSerialInput(bytes));
  };
  stdin.on('data', onData);
  return () => {
    stdin.off('data', onData);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  };
}

function printStats(sim: Simulation): void {
  const stats = sim.stats();
  const seconds = stats.simulatedPs / 1e12;
  const wall = stats.wallMs / 1000;
  const lines = [
    `procad: simulated ${formatSeconds(stats.simulatedPs)} s in ${wall.toFixed(2)} s wall ` +
      `(${(seconds / Math.max(wall, 1e-9)).toFixed(2)}x real time)`,
    ...Object.entries(stats.cycles).map(
      ([ref, cycles]) => `  ${ref}: ${cycles} cycles (${(cycles / Math.max(wall, 1e-9) / 1e6).toFixed(1)} MHz effective)`,
    ),
    `  late input deliveries: ${stats.lateDeliveries} (max ${(stats.maxLatenessPs / 1e3).toFixed(1)} ns)`,
  ];
  process.stderr.write(`${lines.join('\n')}\n`);
}
