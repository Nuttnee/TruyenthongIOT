// Rebuilds the firmware HEX files under test/fixtures with arduino-cli.
// The HEX files are committed, so tests do not need this script; run it only
// after changing a fixture sketch.  Set ARDUINO_CLI to override the binary.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bundledCli = join(
  process.env.LOCALAPPDATA ?? '',
  'Programs/arduino-ide/resources/app/lib/backend/resources/arduino-cli.exe',
);
const cli = process.env.ARDUINO_CLI ?? (existsSync(bundledCli) ? bundledCli : 'arduino-cli');
const fixturesDir = join(import.meta.dirname, '..', 'test', 'fixtures');

for (const fixture of readdirSync(fixturesDir)) {
  const firmwareDir = join(fixturesDir, fixture, 'firmware');
  if (!existsSync(firmwareDir)) continue;

  for (const sketch of readdirSync(firmwareDir)) {
    const outDir = mkdtempSync(join(tmpdir(), 'procad-fw-'));
    try {
      console.log(`compiling ${fixture}/${sketch}`);
      execFileSync(
        cli,
        ['compile', '--fqbn', 'arduino:avr:uno', '--output-dir', outDir, join(firmwareDir, sketch)],
        { stdio: 'inherit' },
      );
      copyFileSync(join(outDir, `${sketch}.ino.hex`), join(fixturesDir, fixture, `${sketch}.hex`));
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }
}
