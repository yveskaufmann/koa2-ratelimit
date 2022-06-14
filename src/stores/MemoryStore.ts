import { Store, HitState } from "./Store";
import { RateLimitOptions } from "../Options";
import { Time } from "../Time";

export class MemoryStore extends Store {
  private static Hits: Record<string, HitState> = {};

  static cleanAll() {
    MemoryStore.Hits = {};
  }

  _getHit(key: string, options?: RateLimitOptions) {
    if (!MemoryStore.Hits[key]) {
      MemoryStore.Hits[key] = {
        counter: 0,
        dateEnd: Date.now() + Time.toMs(options!.interval),
      };
    }
    return MemoryStore.Hits[key];
  }

  _resetAll() {
    const now = Date.now();
    for (const key in MemoryStore.Hits) {
      // eslint-disable-line
      this._resetKey(key, now);
    }
  }

  _resetKey(key: string, now: number) {
    now = now || Date.now();
    if (MemoryStore.Hits[key] && MemoryStore.Hits[key].dateEnd <= now) {
      delete MemoryStore.Hits[key];
    }
  }

  async incr(
    key: string,
    options: RateLimitOptions,
    weight: number
  ): Promise<HitState> {
    this._resetAll();
    const hits = this._getHit(key, options);
    hits.counter += weight;

    return {
      counter: hits.counter,
      dateEnd: hits.dateEnd,
    };
  }

  async decrement(
    key: string,
    options: RateLimitOptions,
    weight: number
  ): Promise<void> {
    const hits = this._getHit(key);
    hits.counter -= weight;
  }

  saveAbuse() {}
}
