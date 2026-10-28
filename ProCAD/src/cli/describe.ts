import { type MappingResult, type PartModel, mcuPortPin } from '../circuit/mapping.js';
import type { Netlist, NetNode } from '../circuit/netlist.js';

function describeModel(model: PartModel): string {
  switch (model.kind) {
    case 'mcu': {
      const firmware = model.firmware ? `firmware ${model.firmware}` : 'no firmware field';
      return `${model.mcu} (${model.pinScheme} pins, ${model.clockHz / 1e6} MHz, ${firmware})`;
    }
    case 'resistor':
      return model.ohms === null ? 'resistor (value unknown)' : `resistor ${model.ohms} Ω`;
    case 'ignore':
      return `ignored: ${model.reason}`;
    default:
      return model.kind;
  }
}

/** Human-readable dump of what ProCAD understood from a netlist. */
export function describeNetlist(netlist: Netlist, mapping: MappingResult): string {
  const models = new Map(mapping.parts.map((p) => [p.component.ref, p.model]));
  const lines = [`Source: ${netlist.source}`, '', `Components (${netlist.components.length}):`];

  const refWidth = Math.max(4, ...netlist.components.map((c) => c.ref.length));
  for (const c of netlist.components) {
    const model = models.get(c.ref);
    const symbol = `${c.lib}:${c.part}`;
    lines.push(`  ${c.ref.padEnd(refWidth)}  ${symbol.padEnd(32)} -> ${model ? describeModel(model) : 'NO MODEL'}`);
  }

  const pinLabel = (node: NetNode): string => {
    const model = models.get(node.ref);
    let label = `${node.ref}.${node.pin}`;
    if (node.pinFunction && node.pinFunction !== node.pin) label += `(${node.pinFunction})`;
    if (model?.kind === 'mcu') {
      const port = mcuPortPin(model.pinScheme, node.pinFunction);
      if (port) label += `=P${port.port}${port.bit}`;
    }
    return label;
  };

  lines.push('', `Nets (${netlist.nets.length}):`);
  const nameWidth = Math.max(4, ...netlist.nets.map((n) => n.name.length));
  for (const net of netlist.nets) {
    lines.push(`  ${net.name.padEnd(nameWidth)}  ${net.nodes.map(pinLabel).join('  ')}`);
  }

  if (mapping.issues.length > 0) {
    lines.push('', 'Issues:');
    for (const issue of mapping.issues) lines.push(`  ${issue.severity}: ${issue.ref}: ${issue.message}`);
  }
  return lines.join('\n');
}
