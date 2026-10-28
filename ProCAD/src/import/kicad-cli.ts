import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

const KICAD_VERSIONS = ['10.0', '9.0'];

/**
 * Locates kicad-cli: $PROCAD_KICAD_CLI first, then the default KiCad install
 * folders, then PATH.  Returns null when KiCad is not installed.
 */
export function findKicadCli(): string | null {
  const fromEnv = process.env['PROCAD_KICAD_CLI'];
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;

  const exe = process.platform === 'win32' ? 'kicad-cli.exe' : 'kicad-cli';
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles'], join(process.env['LOCALAPPDATA'] ?? '', 'Programs')];
    for (const root of roots) {
      if (!root) continue;
      for (const version of KICAD_VERSIONS) candidates.push(join(root, 'KiCad', version, 'bin', exe));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli');
  }
  for (const dir of (process.env['PATH'] ?? '').split(delimiter)) {
    if (dir) candidates.push(join(dir, exe));
  }
  return candidates.find((path) => existsSync(path)) ?? null;
}

/** Runs `kicad-cli sch export netlist --format kicadxml` and returns the XML text. */
export function exportXmlNetlist(kicadCli: string, schematic: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'procad-'));
  const output = join(dir, 'netlist.xml');
  try {
    execFileSync(kicadCli, ['sch', 'export', 'netlist', '--format', 'kicadxml', '--output', output, schematic], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return readFileSync(output, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
