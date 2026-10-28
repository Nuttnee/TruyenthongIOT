import { XMLParser } from 'fast-xml-parser';
import type { Component, Net, NetNode, Netlist } from '../circuit/netlist.js';

export class NetlistFormatError extends Error {
  override name = 'NetlistFormatError';
}

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ['comp', 'field', 'property', 'net', 'node'].includes(name),
});

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return String((value as XmlNode)['#text'] ?? '');
  return String(value);
}

function attr(node: XmlNode | undefined, name: string): string {
  return text(node?.[`@_${name}`]);
}

function list(value: unknown): XmlNode[] {
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

/**
 * Parses the XML netlist written by `kicad-cli sch export netlist --format kicadxml`
 * (schema version "E", see eeschema/netlist_exporters/netlist_exporter_xml.cpp).
 */
export function parseKicadXmlNetlist(xml: string, source: string, baseDir: string): Netlist {
  let document: XmlNode;
  try {
    document = parser.parse(xml) as XmlNode;
  } catch (error) {
    throw new NetlistFormatError(`${source}: not valid XML (${(error as Error).message})`);
  }

  const root = document['export'] as XmlNode | undefined;
  if (!root || typeof root !== 'object') {
    throw new NetlistFormatError(`${source}: missing <export> root; is this a KiCad XML netlist?`);
  }

  const components = list((root['components'] as XmlNode | undefined)?.['comp']).map(parseComponent);
  const nets = list((root['nets'] as XmlNode | undefined)?.['net']).map(parseNet);
  return { source, baseDir, components, nets };
}

function parseComponent(comp: XmlNode): Component {
  const fields: Record<string, string> = {};
  for (const field of list((comp['fields'] as XmlNode | undefined)?.['field'])) {
    fields[attr(field, 'name')] = text(field);
  }

  // Custom fields are written both as <field> and as <property>; flags such as
  // exclude_from_sim only appear as <property> with no value.
  let excludedFromSim = false;
  let dnp = false;
  for (const property of list(comp['property'])) {
    const name = attr(property, 'name');
    if (name === 'exclude_from_sim') excludedFromSim = true;
    else if (name === 'dnp') dnp = true;
    else if (!(name in fields)) fields[name] = attr(property, 'value');
  }

  const libsource = comp['libsource'] as XmlNode | undefined;
  return {
    ref: attr(comp, 'ref'),
    value: text(comp['value']),
    lib: attr(libsource, 'lib'),
    part: attr(libsource, 'part'),
    fields,
    excludedFromSim,
    dnp,
  };
}

function parseNet(net: XmlNode): Net {
  const nodes: NetNode[] = list(net['node']).map((node) => ({
    ref: attr(node, 'ref'),
    pin: attr(node, 'pin'),
    pinFunction: attr(node, 'pinfunction'),
    pinType: attr(node, 'pintype'),
  }));
  return { code: Number(attr(net, 'code')), name: attr(net, 'name'), nodes };
}
