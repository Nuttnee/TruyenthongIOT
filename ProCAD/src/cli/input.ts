import type { MappingResult } from '../circuit/mapping.js';
import type { Netlist } from '../circuit/netlist.js';
import { NetlistFormatError } from '../import/kicad-xml.js';
import { ImportError, loadNetlist } from '../import/load.js';
import { CliError, ExitCode } from './exit-codes.js';

/** loadNetlist() with import failures turned into exit code 2. */
export function loadInput(input: string): Netlist {
  try {
    return loadNetlist(input);
  } catch (error) {
    if (error instanceof ImportError || error instanceof NetlistFormatError) {
      throw new CliError(error.message, ExitCode.Import);
    }
    throw error;
  }
}

export function reportIssues(mapping: MappingResult, write = (line: string) => process.stderr.write(`${line}\n`)): void {
  for (const issue of mapping.issues) write(`procad: ${issue.severity}: ${issue.ref}: ${issue.message}`);
}
