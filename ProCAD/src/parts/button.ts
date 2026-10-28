import type { Circuit } from '../sim/circuit.js';

/** A momentary push button: an ideal switch between two nets, open at rest, no bounce. */
export class Button {
  private readonly switchId: number;
  private down = false;

  constructor(
    readonly ref: string,
    private readonly circuit: Circuit,
    a: number,
    b: number,
    private readonly onChange: (pressed: boolean, t: number) => void,
  ) {
    this.switchId = circuit.solver.addSwitch(a, b);
  }

  get pressed(): boolean {
    return this.down;
  }

  set(pressed: boolean, t: number): void {
    if (pressed === this.down) return;
    this.down = pressed;
    this.onChange(pressed, t);
    this.circuit.setSwitch(this.switchId, pressed, t);
  }
}
