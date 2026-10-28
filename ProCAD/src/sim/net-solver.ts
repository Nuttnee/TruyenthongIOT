/**
 * Switch-level net resolution: no voltages, only logic levels with drive
 * strengths.  This is enough for MCUs, LEDs, buttons and pull resistors; real
 * analog behaviour (dividers, ADC inputs, LED current) comes with the MNA
 * solver in a later milestone.
 */
export enum Strength {
  Z = 0,
  /** MCU internal pull-up. */
  Weak = 1,
  /** Anything that reaches the net through a resistor. */
  Pull = 2,
  /** Push-pull output. */
  Strong = 3,
  /** Power rail. */
  Supply = 4,
}

export type Level = 0 | 1 | 'X' | 'Z';

export interface NetState {
  level: Level;
  strength: Strength;
}

export interface DriverHandle {
  readonly net: number;
  readonly slot: number;
}

const FLOATING: NetState = { level: 'Z', strength: Strength.Z };

function combine(a: NetState, level: Level, strength: Strength): NetState {
  if (strength === Strength.Z) return a;
  if (strength > a.strength) return { level, strength };
  if (strength === a.strength && level !== a.level) return { level: 'X', strength };
  return a;
}

function sameState(a: NetState, b: NetState): boolean {
  return a.level === b.level && a.strength === b.strength;
}

class UnionFind {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root]!;
    while (this.parent[x] !== root) {
      const next = this.parent[x]!;
      this.parent[x] = root;
      x = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

interface Switch {
  a: number;
  b: number;
  closed: boolean;
}

/**
 * Resolves every net to a level and strength from the drivers on it.
 *
 * - Closed switches merge nets into one group.
 * - Resistors pass the level of the group on the other side, capped at Pull.
 * - The strongest drive wins; equal strengths with different levels give X.
 *
 * Nets are partitioned into clusters (connected through any resistor or
 * switch), and solve() only recomputes clusters touched since the last call.
 */
export class NetSolver {
  private readonly drivers: NetState[][];
  private readonly resistors: Array<[number, number]> = [];
  private readonly switches: Switch[] = [];
  private readonly states: NetState[];
  private clusterOf: number[] = [];
  private clusterNets: number[][] = [];
  private clusterResistors: Array<Array<[number, number]>> = [];
  private clusterSwitches: number[][] = [];
  private readonly dirtyClusters = new Set<number>();
  private topologyDirty = true;

  constructor(readonly netCount: number) {
    this.drivers = Array.from({ length: netCount }, () => []);
    this.states = Array.from({ length: netCount }, () => FLOATING);
  }

  addDriver(net: number, level: 0 | 1 = 0, strength: Strength = Strength.Z): DriverHandle {
    const slots = this.drivers[net]!;
    slots.push({ level, strength });
    this.markDirty(net);
    return { net, slot: slots.length - 1 };
  }

  setDriver(handle: DriverHandle, level: 0 | 1, strength: Strength): void {
    const slots = this.drivers[handle.net]!;
    const current = slots[handle.slot]!;
    if (current.level === level && current.strength === strength) return;
    slots[handle.slot] = { level, strength };
    this.markDirty(handle.net);
  }

  addResistor(a: number, b: number): void {
    this.resistors.push([a, b]);
    this.topologyDirty = true;
  }

  addSwitch(a: number, b: number, closed = false): number {
    this.switches.push({ a, b, closed });
    this.topologyDirty = true;
    return this.switches.length - 1;
  }

  setSwitch(id: number, closed: boolean): void {
    const sw = this.switches[id]!;
    if (sw.closed === closed) return;
    sw.closed = closed;
    this.markDirty(sw.a);
  }

  state(net: number): NetState {
    return this.states[net]!;
  }

  /** Recomputes dirty clusters and returns the nets whose state changed. */
  solve(): number[] {
    if (this.topologyDirty) this.rebuildClusters();
    const changed: number[] = [];
    for (const cluster of this.dirtyClusters) this.solveCluster(cluster, changed);
    this.dirtyClusters.clear();
    return changed;
  }

  private markDirty(net: number): void {
    if (this.topologyDirty) return;
    this.dirtyClusters.add(this.clusterOf[net]!);
  }

  private rebuildClusters(): void {
    const uf = new UnionFind(this.netCount);
    for (const [a, b] of this.resistors) uf.union(a, b);
    for (const sw of this.switches) uf.union(sw.a, sw.b);

    const index = new Map<number, number>();
    this.clusterOf = [];
    this.clusterNets = [];
    for (let net = 0; net < this.netCount; net++) {
      const root = uf.find(net);
      let cluster = index.get(root);
      if (cluster === undefined) {
        cluster = this.clusterNets.length;
        index.set(root, cluster);
        this.clusterNets.push([]);
      }
      this.clusterOf[net] = cluster;
      this.clusterNets[cluster]!.push(net);
    }
    this.clusterResistors = this.clusterNets.map(() => []);
    this.clusterSwitches = this.clusterNets.map(() => []);
    for (const resistor of this.resistors) this.clusterResistors[this.clusterOf[resistor[0]]!]!.push(resistor);
    this.switches.forEach((sw, id) => this.clusterSwitches[this.clusterOf[sw.a]!]!.push(id));

    this.topologyDirty = false;
    for (let cluster = 0; cluster < this.clusterNets.length; cluster++) this.dirtyClusters.add(cluster);
  }

  private solveCluster(cluster: number, changed: number[]): void {
    const nets = this.clusterNets[cluster]!;

    // Group nets joined by closed switches.
    const groupOf = new Map<number, number>();
    const groups: number[][] = [];
    const uf = new UnionFind(this.netCount);
    for (const id of this.clusterSwitches[cluster]!) {
      const sw = this.switches[id]!;
      if (sw.closed) uf.union(sw.a, sw.b);
    }
    const rootToGroup = new Map<number, number>();
    for (const net of nets) {
      const root = uf.find(net);
      let group = rootToGroup.get(root);
      if (group === undefined) {
        group = groups.length;
        rootToGroup.set(root, group);
        groups.push([]);
      }
      groups[group]!.push(net);
      groupOf.set(net, group);
    }

    const direct: NetState[] = groups.map((members) => {
      let state = FLOATING;
      for (const net of members) {
        for (const drive of this.drivers[net]!) state = combine(state, drive.level, drive.strength);
      }
      return state;
    });

    const neighbours: number[][] = groups.map(() => []);
    for (const [a, b] of this.clusterResistors[cluster]!) {
      const ga = groupOf.get(a)!;
      const gb = groupOf.get(b)!;
      if (ga === gb) continue;
      neighbours[ga]!.push(gb);
      neighbours[gb]!.push(ga);
    }

    // Relax from the direct drives each time, so stale values cannot sustain
    // themselves around a loop of resistors.
    const value = direct.slice();
    for (let pass = 0; pass <= groups.length + 1; pass++) {
      let moved = false;
      for (let g = 0; g < groups.length; g++) {
        let next = direct[g]!;
        for (const n of neighbours[g]!) {
          const other = value[n]!;
          if (other.strength === Strength.Z) continue;
          next = combine(next, other.level, Math.min(other.strength, Strength.Pull));
        }
        if (!sameState(next, value[g]!)) {
          value[g] = next;
          moved = true;
        }
      }
      if (!moved) break;
    }

    for (const net of nets) {
      const next = value[groupOf.get(net)!]!;
      if (!sameState(next, this.states[net]!)) {
        this.states[net] = next;
        changed.push(net);
      }
    }
  }
}
