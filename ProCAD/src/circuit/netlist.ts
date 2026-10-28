/** One symbol pin attached to a net. */
export interface NetNode {
  ref: string;
  /** Pin number as printed on the symbol, e.g. "28". */
  pin: string;
  /** Pin name, e.g. "D13" or "SDA/A4"; empty for unnamed passive pins. */
  pinFunction: string;
  /** KiCad electrical type, e.g. "bidirectional", "power_out", "passive". */
  pinType: string;
}

export interface Net {
  code: number;
  name: string;
  nodes: NetNode[];
}

export interface Component {
  ref: string;
  value: string;
  /** Library nickname, e.g. "MCU_Module". */
  lib: string;
  /** Symbol name inside the library, e.g. "Arduino_UNO_R3". */
  part: string;
  /** User fields and properties, e.g. "ProCAD.Firmware" or "Sim.Device". */
  fields: Record<string, string>;
  excludedFromSim: boolean;
  dnp: boolean;
}

/** A schematic flattened to components and nets, independent of the file it came from. */
export interface Netlist {
  /** Path of the file the netlist was read or exported from. */
  source: string;
  /** Directory that relative paths in fields (firmware, models) resolve against. */
  baseDir: string;
  components: Component[];
  nets: Net[];
}
