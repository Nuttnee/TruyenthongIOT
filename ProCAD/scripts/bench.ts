// Measures simulation speed on the fixtures, against a bare avr8js loop as the
// ceiling.  Exits 1 if a fixture misses its M0 target.  Run it on an idle
// machine: `npm run bench`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AVRIOPort, AVRTimer, CPU, avrInstruction, portBConfig, timer0Config } from 'avr8js';
import { programFromHex } from '../src/mcu/atmega328p.js';
import { runFixture, FIXTURES } from '../test/helpers/run-fixture.js';

const S = 1e12;

function bareAvr8js(seconds: number): number {
  const cpu = new CPU(programFromHex(readFileSync(join(FIXTURES, 'blink', 'blink.hex'), 'utf8')));
  new AVRTimer(cpu, timer0Config);
  new AVRIOPort(cpu, portBConfig);
  const cycles = seconds * 16e6;
  const start = performance.now();
  while (cpu.cycles < cycles) {
    avrInstruction(cpu);
    cpu.tick();
  }
  return seconds / ((performance.now() - start) / 1000);
}

async function fixtureSpeed(name: string, until: string, serial?: Array<{ ref: string; at: string; text: string }>) {
  const run = await runFixture(name, until, serial ? { serial } : {});
  const { simulatedPs, wallMs } = run.sim.stats();
  return simulatedPs / S / (wallMs / 1000);
}

const results = [
  { name: 'bare avr8js loop (ceiling)', speed: bareAvr8js(5), target: 0 },
  { name: 'F1 blink, 1 MCU, 10 s', speed: await fixtureSpeed('blink', '10s'), target: 1 },
  {
    name: 'F3 b2-bai1.1, 2 MCUs, 2 s',
    speed: await fixtureSpeed('b2-bai1.1', '2s', [{ ref: 'ARD1', at: '0.5s', text: '1' }]),
    target: 0.5,
  },
];

let failed = false;
for (const { name, speed, target } of results) {
  const verdict = target === 0 ? '' : speed >= target ? `  ok (target >= ${target}x)` : `  BELOW target ${target}x`;
  if (target > 0 && speed < target) failed = true;
  console.log(`${name.padEnd(30)} ${speed.toFixed(2)}x real time${verdict}`);
}
process.exitCode = failed ? 1 : 0;
