import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parsePress, parseSerialIn, unescapeBytes } from '../src/cli/stimulus.js';
import { FIXTURES } from './helpers/run-fixture.js';

const ROOT = resolve(import.meta.dirname, '..');
const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI = join(ROOT, 'src', 'cli', 'index.ts');
const work = mkdtempSync(join(tmpdir(), 'procad-cli-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function procad(...args: string[]) {
  const result = spawnSync(process.execPath, [TSX, CLI, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('stimulus parsing', () => {
  it('parses --press', () => {
    expect(parsePress('SW1@1s:3.2s')).toEqual({ ref: 'SW1', atPs: 1e12, durationPs: 3.2e12 });
    expect(parsePress('SW1@250ms')).toEqual({ ref: 'SW1', atPs: 250e9, durationPs: 100e9 });
    expect(() => parsePress('SW1')).toThrow(/REF@TIME/);
  });

  it('parses --serial-in with escapes', () => {
    expect(parseSerialIn('ARD1@1s=a=b\\n')).toEqual({ ref: 'ARD1', atPs: 1e12, bytes: [0x61, 0x3d, 0x62, 0x0a] });
    expect(unescapeBytes('\\x41\\t\\\\')).toEqual([0x41, 0x09, 0x5c]);
  });
});

describe('procad CLI', () => {
  it('runs a fixture and writes a VCD', () => {
    const vcd = join(work, 'blink.vcd');
    const result = procad('run', join(FIXTURES, 'blink'), '--until', '2.5s', '--vcd', vcd, '--quiet');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/A1> blink ready/);
    expect(result.stdout).not.toMatch(/D1 ON/);

    const text = readFileSync(vcd, 'utf8');
    expect(text).toMatch(/\$var wire 1 # Net-\(A1-D13\) \$end/);
    expect(text).toMatch(/\$enddefinitions \$end/);
    expect(text.trimEnd().endsWith('#2500000000')).toBe(true);
  });

  it('stops early with --until-serial', () => {
    const result = procad('run', join(FIXTURES, 'b2-bai1.2'), '--until-serial', 'VAN HANH', '--quiet');
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/stopped at 0\.0\d+ s: A1 printed "VAN HANH"/);
  });

  it('uses exit codes 2, 3 and 4 for import, model and firmware errors', () => {
    expect(procad('check', join(work, 'missing')).status).toBe(2);

    const unmapped = join(work, 'unmapped.xml');
    writeFileSync(
      unmapped,
      '<export version="E"><components><comp ref="U1"><value>DHT11</value>' +
        '<libsource lib="Sensor" part="DHT11"/></comp></components><nets/></export>',
    );
    const check = procad('check', unmapped);
    expect(check.status).toBe(3);
    expect(check.stderr).toMatch(/U1: no simulation model for Sensor:DHT11/);

    const noFirmware = join(work, 'nofw.xml');
    writeFileSync(
      noFirmware,
      readFileSync(join(FIXTURES, 'blink', 'netlist.xml'), 'utf8').replaceAll(/ProCAD\.Firmware/g, 'Note'),
    );
    expect(procad('run', noFirmware, '--until', '1ms').status).toBe(4);
  });

  it('prints the version', () => {
    const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
    expect(execFileSync(process.execPath, [TSX, CLI, 'version'], { encoding: 'utf8' }).trim()).toBe(version);
  });
});
