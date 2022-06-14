import { RateLimitOptions } from "../Options";

const methods = ["incr", "decrement", "saveAbuse"];

export interface SaveAbuseOptions extends RateLimitOptions {
  key: string;
  ip: string;
  user_id: string;
}

export abstract class Store {
  constructor() {
    for (const elem of methods) {
      // @ts-ignore
      if ((this as any[elm]) === undefined) {
        throw new TypeError(`Must override method ${elem}`);
      }
    }
  }

  abstract incr(
    key: string,
    options: RateLimitOptions,
    weight: number
  ): Promise<HitState>;

  abstract decrement(
    key: string,
    options: RateLimitOptions,
    weight: number
  ): Promise<void>;

  abstract saveAbuse(abuse?: SaveAbuseOptions): Promise<void> | void;
}

export interface HitState {
  counter: number;
  dateEnd: number;
}
