#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { mapNetlist } from '../circuit/mapping.js';
import { describeNetlist } from './describe.js';
import { CliError, ExitCode } from './exit-codes.js';
import { loadInput, reportIssues } from './input.js';
import { type RunCommandOptions, runCommand } from './run.js';

// Same relative path from src/cli (tsx) and dist/cli (built).
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const collect = (value: string, previous: string[]) => [...previous, value];

/** Runs a command body and turns its result or error into the process exit code. */
async function guarded(body: () => number | Promise<number>): Promise<void> {
  try {
    process.exitCode = await body();
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`procad: ${error.message}\n`);
      process.exitCode = error.exitCode;
    } else {
      process.stderr.write(`procad: internal error: ${(error as Error).stack ?? String(error)}\n`);
      process.exitCode = ExitCode.Runtime;
    }
  }
}

const program = new Command()
  .name('procad')
  .description('Simulate KiCad schematics with microcontrollers running real firmware.')
  .version(version, '-v, --version');

program
  .command('netlist')
  .description('show the components, models and nets ProCAD reads from a design')
  .argument('<input>', 'project directory, .kicad_pro, .kicad_sch, or XML netlist')
  .option('--json', 'print JSON instead of text')
  .action((input: string, options: { json?: boolean }) =>
    guarded(() => {
      const netlist = loadInput(input);
      const mapping = mapNetlist(netlist);
      if (options.json) {
        const models = new Map(mapping.parts.map((p) => [p.component.ref, p.model]));
        const components = netlist.components.map((c) => ({ ...c, model: models.get(c.ref) ?? null }));
        process.stdout.write(`${JSON.stringify({ ...netlist, components, issues: mapping.issues }, null, 2)}\n`);
      } else {
        process.stdout.write(`${describeNetlist(netlist, mapping)}\n`);
      }
      return ExitCode.Ok;
    }),
  );

program
  .command('check')
  .description('exit 0 if every component has a simulation model, 3 otherwise')
  .argument('<input>', 'project directory, .kicad_pro, .kicad_sch, or XML netlist')
  .action((input: string) =>
    guarded(() => {
      const mapping = mapNetlist(loadInput(input));
      reportIssues(mapping);
      const errors = mapping.issues.filter((issue) => issue.severity === 'error').length;
      const mcus = mapping.parts.filter((p) => p.model.kind === 'mcu').length;
      process.stdout.write(
        `${mapping.parts.length} components mapped (${mcus} MCU), ${errors} without a model, ` +
          `${mapping.issues.length - errors} warnings\n`,
      );
      return errors > 0 ? ExitCode.Unmapped : ExitCode.Ok;
    }),
  );

program
  .command('run')
  .description('simulate a design')
  .argument('<input>', 'project directory, .kicad_pro, .kicad_sch, or XML netlist')
  .option('--fw <REF=file.hex>', 'firmware for an MCU (repeatable; overrides ProCAD.Firmware)', collect, [])
  .option('--until <time>', 'simulated time to stop at', '10s')
  .option('--until-serial <text>', 'stop as soon as any MCU prints this text')
  .option('--press <REF@time[:duration]>', 'press a button, e.g. SW1@1s:3.2s (repeatable)', collect, [])
  .option('--serial-in <REF@time=text>', 'send text to an MCU USART, e.g. ARD1@1s=1 (repeatable)', collect, [])
  .option('--stdin <REF>', 'forward keystrokes to the USART of this MCU')
  .option('--realtime', 'pace the simulation against the wall clock', false)
  .option('--speed <factor>', 'real-time speed factor', '1')
  .option('--vcd <file>', 'write net and LED waveforms as VCD')
  .option('--trace <file>', 'write every event as JSON lines')
  .option('--probe <names>', 'comma-separated nets/LEDs to record (default: all connected nets)')
  .option('--quantum <time>', 'max time one MCU may run ahead of another', '1us')
  .option('--stats', 'print speed and timing statistics', false)
  .option('--quiet', 'print only serial output and warnings', false)
  .option('--allow-unmapped', 'skip components without a simulation model', false)
  .action((input: string, options: RunCommandOptions) => guarded(() => runCommand(input, options)));

program
  .command('version')
  .description('print the ProCAD version')
  .action(() => {
    process.stdout.write(`${version}\n`);
  });

await program.parseAsync();
