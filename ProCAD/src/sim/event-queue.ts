export interface ScheduledEvent {
  t: number;
  seq: number;
  run: () => void;
}

/**
 * Min-heap of callbacks ordered by time, then by insertion order, so events
 * scheduled for the same instant always run in the order they were added.
 */
export class EventQueue {
  private readonly heap: ScheduledEvent[] = [];
  private seq = 0;

  get size(): number {
    return this.heap.length;
  }

  push(t: number, run: () => void): void {
    this.heap.push({ t, seq: this.seq++, run });
    this.siftUp(this.heap.length - 1);
  }

  /** Time of the earliest event, or Infinity when empty. */
  peekTime(): number {
    return this.heap[0]?.t ?? Infinity;
  }

  pop(): ScheduledEvent | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (top && last && top !== last) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private before(a: ScheduledEvent, b: ScheduledEvent): boolean {
    return a.t < b.t || (a.t === b.t && a.seq < b.seq);
  }

  private siftUp(index: number): void {
    const { heap } = this;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.before(heap[index]!, heap[parent]!)) break;
      [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
      index = parent;
    }
  }

  private siftDown(index: number): void {
    const { heap } = this;
    for (;;) {
      const left = 2 * index + 1;
      const right = left + 1;
      let smallest = index;
      if (left < heap.length && this.before(heap[left]!, heap[smallest]!)) smallest = left;
      if (right < heap.length && this.before(heap[right]!, heap[smallest]!)) smallest = right;
      if (smallest === index) return;
      [heap[index], heap[smallest]] = [heap[smallest]!, heap[index]!];
      index = smallest;
    }
  }
}
