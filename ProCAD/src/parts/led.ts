import type { Circuit } from '../sim/circuit.js';
import { type NetState, Strength } from '../sim/net-solver.js';

function isDriven(state: NetState, level: 0 | 1): boolean {
  return state.level === level && state.strength >= Strength.Pull;
}

/**
 * An LED is on when its anode sees a driven 1 and its cathode a driven 0
 * (directly or through resistors).  It carries no current in the logic model,
 * so it never changes the nets it sits on.
 */
export class Led {
  private lit = false;

  constructor(
    readonly ref: string,
    private readonly circuit: Circuit,
    private readonly anode: number,
    private readonly cathode: number,
    private readonly onChange: (on: boolean, t: number) => void,
  ) {
    circuit.onNet(anode, (_, t) => this.update(t));
    circuit.onNet(cathode, (_, t) => this.update(t));
  }

  get on(): boolean {
    return this.lit;
  }

  private update(t: number): void {
    const lit = isDriven(this.circuit.state(this.anode), 1) && isDriven(this.circuit.state(this.cathode), 0);
    if (lit === this.lit) return;
    this.lit = lit;
    this.onChange(lit, t);
  }
}
