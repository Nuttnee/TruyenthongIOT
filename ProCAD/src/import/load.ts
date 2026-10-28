import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { Netlist } from '../circuit/netlist.js';
import { exportXmlNetlist, findKicadCli } from './kicad-cli.js';
import { parseKicadXmlNetlist } from './kicad-xml.js';

export class ImportError extends Error {
  override name = 'ImportError';
}

/** File name looked up in a project directory when kicad-cli is unavailable. */
export const EXPORTED_NETLIST_NAME = 'netlist.xml';

/**
 * Loads a netlist from a KiCad project directory, a .kicad_pro/.kicad_sch file
 * (exported through kicad-cli), or an XML netlist exported earlier.
 */
export function loadNetlist(input: string): Netlist {
  const path = resolve(input);
  if (!existsSync(path)) throw new ImportError(`${input}: no such file or directory`);

  if (statSync(path).isDirectory()) return loadFromDirectory(path);

  switch (extname(path).toLowerCase()) {
    case '.xml':
      return parseKicadXmlNetlist(readFileSync(path, 'utf8'), path, dirname(path));
    case '.kicad_pro':
      return loadFromSchematic(join(dirname(path), `${basename(path, '.kicad_pro')}.kicad_sch`));
    case '.kicad_sch':
      return loadFromSchematic(path);
    default:
      throw new ImportError(`${input}: expected a project directory, .kicad_pro, .kicad_sch or XML netlist`);
  }
}

function loadFromDirectory(dir: string): Netlist {
  const entries = readdirSync(dir);
  const project = entries.find((name) => name.endsWith('.kicad_pro'));
  const schematicName = project
    ? `${basename(project, '.kicad_pro')}.kicad_sch`
    : entries.find((name) => name.endsWith('.kicad_sch'));
  const schematic = schematicName ? join(dir, schematicName) : undefined;
  const exported = join(dir, EXPORTED_NETLIST_NAME);

  if (schematic && existsSync(schematic) && (findKicadCli() || !existsSync(exported))) {
    return loadFromSchematic(schematic);
  }
  if (existsSync(exported)) {
    return parseKicadXmlNetlist(readFileSync(exported, 'utf8'), exported, dir);
  }
  throw new ImportError(`${dir}: no .kicad_sch or ${EXPORTED_NETLIST_NAME} found`);
}

function loadFromSchematic(schematic: string): Netlist {
  if (!existsSync(schematic)) throw new ImportError(`${schematic}: no such file`);
  const kicadCli = findKicadCli();
  if (!kicadCli) {
    throw new ImportError(
      `${schematic}: kicad-cli not found. Install KiCad 9 or newer, set PROCAD_KICAD_CLI, ` +
        `or pass a netlist exported with "kicad-cli sch export netlist --format kicadxml".`,
    );
  }
  let xml: string;
  try {
    xml = exportXmlNetlist(kicadCli, schematic);
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim();
    throw new ImportError(`${schematic}: kicad-cli failed${stderr ? `: ${stderr}` : ''}`);
  }
  return parseKicadXmlNetlist(xml, schematic, dirname(schematic));
}
