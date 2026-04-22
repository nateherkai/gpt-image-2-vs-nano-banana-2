import type { RunState } from '../types.js';
import { writeState } from '../state/store.js';

/**
 * Serializes writes to state.json so concurrent unit work never produces
 * an interleaved write (atomic rename already prevents partial files).
 *
 * The in-memory state object is shared across all units, so each write
 * captures every mutation up to that point.
 */
export class StateMutator {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly state: RunState) {}

  get current(): RunState {
    return this.state;
  }

  /** Apply a synchronous mutation, then schedule a serialized write. */
  async update(mutator: (s: RunState) => void): Promise<void> {
    mutator(this.state);
    const p = this.chain.then(() => writeState(this.state.runId, this.state));
    this.chain = p.catch(() => {
      // Swallow so the chain doesn't break for subsequent updates.
    });
    return p;
  }

  /** Wait for any pending writes to complete. */
  flush(): Promise<void> {
    return this.chain;
  }
}
