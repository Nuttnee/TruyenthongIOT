import { type DriverHandle, type NetState, NetSolver, Strength } from './net-solver.js';

export type NetListener = (state: NetState, t: number) => void;

/** A net solver plus change notification: parts drive nets and listen to them. */
export class Circuit {
  readonly solver: NetSolver;
  private readonly listeners: NetListener[][];
  private settling = false;

  constructor(readonly netNames: readonly string[]) {
    this.solver = new NetSolver(netNames.length);
    this.listeners = netNames.map(() => []);
  }

  onNet(net: number, listener: NetListener): void {
    this.listeners[net]!.push(listener);
  }

  state(net: number): NetState {
    return this.solver.state(net);
  }

  addDriver(net: number, level: 0 | 1 = 0, strength: Strength = Strength.Z): DriverHandle {
    return this.solver.addDriver(net, level, strength);
  }

  drive(handle: DriverHandle, level: 0 | 1, strength: Strength, t: number): void {
    this.solver.setDriver(handle, level, strength);
    this.settle(t);
  }

  setSwitch(id: number, closed: boolean, t: number): void {
    this.solver.setSwitch(id, closed);
    this.settle(t);
  }

  /**
   * Solves and notifies listeners until nothing changes.  Listeners may drive
   * nets again; those changes are picked up by the same loop rather than by a
   * nested call.
   */
  settle(t: number): void {
    if (this.settling) return;
    this.settling = true;
    try {
      for (let changed = this.solver.solve(); changed.length > 0; changed = this.solver.solve()) {
        for (const net of changed) {
          const state = this.solver.state(net);
          for (const listener of this.listeners[net]!) listener(state, t);
        }
      }
    } finally {
      this.settling = false;
    }
  }
}
