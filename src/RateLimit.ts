import { MemoryStore, Store } from "./stores";
import { RateLimitOptions } from "./Options";
import { Time } from "./Time";

export const DEFAULT_OPTIONS: RateLimitOptions = {
  // window, delay, and max apply per-key unless global is set to true
  interval: { min: 1 }, // milliseconds - how long to keep records of requests in memory
  delayAfter: 0, // how many requests to allow through before starting to delay responses
  timeWait: { sec: 1 }, // milliseconds - base delay applied to the response - multiplied by number of recent hits for the same key.
  max: 5, // max number of recent connections during `window` milliseconds before sending a 429 response

  message: "Too many requests, please try again later.",
  statusCode: 429, // 429 status = Too Many Requests (RFC 6585)
  headers: true, // Send custom rate limit header with limit and remaining
  skipFailedRequests: false, // Do not count failed requests (status >= 400)
  prefixKey: "global", // the prefixKey to get to remove all key
  prefixKeySeparator: "::", // the seperator between the prefixKey and the userId

  store: new MemoryStore(),

  // redefin fonction
  keyGenerator: undefined,
  getUserIdFromKey: undefined,
  skip: undefined,
  getUserId: undefined,
  handler: undefined,
  onLimitReached: undefined,
  weight: undefined,

  whitelist: [],
};

const toFinds = ["id", "userId", "user_id", "idUser", "id_user"];

export class RateLimit {
  private options: RateLimitOptions;
  private store: Store;

  constructor(options: RateLimitOptions) {
    this.options = Object.assign({}, DEFAULT_OPTIONS, options);
    this.options.interval = Time.toMs(this.options.interval);
    this.options.timeWait = Time.toMs(this.options.timeWait);
    // store to use for persisting rate limit data
    this.store = this.options.store;

    // ensure that the store extends Store class
    if (!(this.store instanceof Store)) {
      throw new Error("The store is not valid.");
    }
  }

  public static timeToMs(time: Time | number): number {
    return Time.toMs(time);
  }

  async keyGenerator(ctx: import("koa").Context) {
    if (this.options.keyGenerator) {
      return this.options.keyGenerator(ctx);
    }
    const userId = await this.getUserId(ctx);
    if (userId) {
      return `${this.options.prefixKey}|${userId}`;
    }
    return `${this.options.prefixKey}|${ctx.request.ip}`;
  }

  async weight(ctx: import("koa").Context) {
    if (this.options.weight) {
      return this.options.weight(ctx);
    }
    return 1;
  }

  async skip(ctx: import("koa").Context) {
    // eslint-disable-line
    if (this.options.skip) {
      return this.options.skip(ctx);
    }
    return false;
  }

  async getUserId(ctx: import("koa").Context) {
    if (this.options.getUserId) {
      return this.options.getUserId(ctx);
    }
    const whereFinds = [
      ctx.state.user,
      ctx.user,
      ctx.state.User,
      ctx.User,
      ctx.state,
      ctx,
    ];
    for (const whereFind of whereFinds) {
      if (whereFind) {
        for (const toFind of toFinds) {
          if (whereFind[toFind]) {
            return whereFind[toFind];
          }
        }
      }
    }
    return null;
  }

  async handler(ctx: import("koa").Context, next?: import("koa").Next) {
    if (this.options.handler) {
      this.options.handler(ctx);
    } else {
      ctx.status = this.options.statusCode;
      ctx.body = { message: this.options.message };
      if (this.options.headers) {
        ctx.set(
          "Retry-After",
          Math.ceil(Time.toMs(this.options.interval) / 1000).toString(10)
        );
      }
    }
  }

  async onLimitReached(ctx: import("koa").Context) {
    if (this.options.onLimitReached) {
      this.options.onLimitReached(ctx);
    } else {
      this.store.saveAbuse(
        Object.assign({}, this.options, {
          key: await this.keyGenerator(ctx),
          ip: ctx.request.ip,
          user_id: await this.getUserId(ctx),
        })
      );
    }
  }

  get middleware() {
    return this._rateLimit.bind(this);
  }

  private async _rateLimit(
    ctx: import("koa").Context,
    next: import("koa").Next
  ) {
    const skip = await this.skip(ctx);
    if (skip) {
      return next();
    }

    const key = await this.keyGenerator(ctx);
    if (this._isWhitelisted(key)) {
      return next();
    }
    const weight = await this.weight(ctx);

    const { counter, dateEnd } = await this.store.incr(
      key,
      this.options,
      weight
    );
    const reset = new Date(dateEnd).getTime();
    ctx.state.rateLimit = {
      limit: this.options.max,
      current: counter,
      remaining: Math.max(this.options.max - counter, 0),
      reset: Math.ceil(reset / 1000),
    };

    if (this.options.headers) {
      ctx.set("X-RateLimit-Limit", this.options.max?.toString(10));
      ctx.set("X-RateLimit-Remaining", ctx.state.rateLimit.remaining);
      ctx.set("X-RateLimit-Reset", ctx.state.rateLimit.reset);
    }

    if (this.options.max && counter > this.options.max) {
      await this.onLimitReached(ctx);
      return this.handler(ctx, next);
    }

    if (this.options.skipFailedRequests) {
      ctx.res.on("finish", () => {
        if (ctx.status >= 400) {
          this.store.decrement(key, this.options, weight);
        }
      });
    }

    if (
      this.options.delayAfter &&
      this.options.timeWait &&
      counter > this.options.delayAfter
    ) {
      const delay =
        (counter - this.options.delayAfter) * Time.toMs(this.options.timeWait);
      await this.wait(delay);
      return next();
    }
    return next();
  }

  private _isWhitelisted(key: string) {
    const { whitelist } = this.options;

    if (whitelist == null || whitelist.length === 0) {
      return false;
    }

    const userId = this.getUserIdFromKey(key);
    if (userId) {
      return whitelist.includes(userId);
    }
    return false;
  }

  getUserIdFromKey(key: string): string {
    if (this.options.getUserIdFromKey) {
      return this.options.getUserIdFromKey(key);
    }
    Time.toMs;

    const [, userId] = key.split(this.options.prefixKeySeparator);
    return userId;
  }

  async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function middleware(
  options: RateLimitOptions = {}
): import("koa").Middleware {
  return new RateLimit(options).middleware;
}

export function defaultOptions(options: RateLimitOptions = {}) {
  Object.assign(DEFAULT_OPTIONS, options);
}

export default {
  RateLimit,
  middleware,
  defaultOptions,
};
