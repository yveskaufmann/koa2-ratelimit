/* global describe, it, beforeEach, afterEach */

import { RateLimitOptions } from "../src/Options";

import assert from "assert";
import expect from "expect";
import { MemoryStore, Store } from "../src/stores";
import RateLimit from "../src/RateLimit";

class InvalidStore {}

class MockStore extends Store {
  public nb = 0;
  public incr_was_called = false;
  public decrement_was_called = false;
  public saveAbuse_was_called = false;

  async incr(key: string, options: RateLimitOptions, weight: number) {
    this.nb += weight;
    this.incr_was_called = true;
    return {
      counter: this.nb,
      dateEnd: new Date().setHours(new Date().getHours() + 1),
    };
  }

  async decrement(key: string, options: RateLimitOptions, weight: number) {
    this.decrement_was_called = true;
    this.nb -= weight;
  }

  async saveAbuse() {
    this.saveAbuse_was_called = true;
  }
}

function getCtx(): import("koa").Context {
  return {
    request: { ip: "192.168.1.0" },
    res: { on: () => {} },
    state: { user: { id: 1 } },
    set: () => {},
  } as unknown as import("koa").Context;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RateLimit node module", () => {
  let start: number;
  let nbCall: number;
  let ctx: import("koa").Context;
  let store: Store;
  let memoryStore: MemoryStore;

  beforeEach(() => {
    start = Date.now();
    store = new MockStore();
    MemoryStore.cleanAll();
    memoryStore = new MemoryStore();
    nbCall = 0;
    ctx = getCtx();
  });

  afterEach(() => {
    nbCall = 0;
  });

  const nextNb: any = () => {
    nbCall += 1;
    return;
  };

  it("Times should return the correct time in ms", () => {
    expect(RateLimit.RateLimit.timeToMs(123)).toBe(123);
    expect(RateLimit.RateLimit.timeToMs({ hour: 2 })).toBe(2 * 3600000);
    expect(RateLimit.RateLimit.timeToMs({ hour: 2, min: 3 })).toBe(
      2 * 3600000 + 3 * 60000
    );
  });

  it("Times should throw error if key does not exist", (done) => {
    try {
      // @ts-expect-error
      RateLimit.timeToMs({ hours: 3 });
    } catch (e) {
      return done();
    }
    return done(new Error("Times should throw error if key does not exist"));
  });

  it("should not allow to use of a store that is not valid", (done) => {
    try {
      // @ts-expect-error
      middleware({ store: new InvalidStore() });
    } catch (e) {
      return done();
    }

    return done(new Error("It allowed an invalid store"));
  });

  it("should call incr on the store", async () => {
    const middleware = RateLimit.middleware({ store });

    await middleware(getCtx(), nextNb);
    expect((store as any).incr_was_called).toBe(true);
  });

  it("should apply a small delay to the second request", async () => {
    const middleware = RateLimit.middleware({
      delayAfter: 1,
      timeWait: 500,
      store,
    });
    await middleware(getCtx(), nextNb);

    start = Date.now();
    await middleware(getCtx(), nextNb);
    expect(Date.now() - start).toBeGreaterThan(500);
  });
  it("should apply a larger delay to the subsequent request", async () => {
    const middleware = RateLimit.middleware({
      delayAfter: 1,
      timeWait: 100,
      store,
    });
    await middleware(getCtx(), nextNb);
    await middleware(getCtx(), nextNb);
    await middleware(getCtx(), nextNb);
    await middleware(getCtx(), nextNb);
    expect(Date.now() - start).toBeGreaterThan(400);
  });
  it("should allow delayAfter requests before delaying responses", async () => {
    const middleware = RateLimit.middleware({
      delayAfter: 2,
      timeWait: 100,
      store,
    });

    await middleware(getCtx(), nextNb);
    expect(Date.now() - start).toBeLessThan(50);

    await middleware(getCtx(), nextNb);
    expect(Date.now() - start).toBeLessThan(100);

    await middleware(getCtx(), nextNb);
    expect(Date.now() - start).toBeGreaterThan(100);
    expect(Date.now() - start).toBeLessThan(150);
  });

  it("should allow delayAfter to be disabled entirely", async () => {
    const middleware = RateLimit.middleware({
      delayAfter: 0,
      timeWait: 1000,
      store,
    });

    await middleware(getCtx(), nextNb);
    await middleware(getCtx(), nextNb);
    await middleware(getCtx(), nextNb);

    expect(Date.now() - start).toBeLessThan(100);
  });

  it("should refuse additional connections once IP has reached the max", async () => {
    const middleware = RateLimit.middleware({ max: 1, store });

    await middleware(getCtx(), nextNb);
    await middleware(getCtx(), nextNb);
    await middleware(getCtx(), nextNb);

    expect(nbCall).toBe(1);
  });

  it("should allow max to be disabled entirely", async () => {
    const middleware = RateLimit.middleware({ max: 0, store });

    await middleware(getCtx(), nextNb);
    await middleware(getCtx(), nextNb);
    await middleware(getCtx(), nextNb);

    expect(nbCall).toBe(3);
  });

  it("should show the provided message instead of the default message when max connections are reached", async () => {
    const message = "my msg";
    const middleware = RateLimit.middleware({ max: 2, message, store });
    await middleware(getCtx(), nextNb);
    await middleware(getCtx(), nextNb);

    const ctxDefault = getCtx();
    await middleware(ctxDefault, nextNb);

    expect((ctxDefault.body as any).message).toBe(message);
  });

  it("should (eventually) accept new connections from a blocked IP", async () => {
    const middleware = RateLimit.middleware({
      max: 10,
      interval: 50,
      prefixKey: start as any,
      store: memoryStore,
    });
    await middleware(ctx, nextNb);
    await middleware(ctx, nextNb);
    await sleep(60);
    await middleware(ctx, nextNb);
    expect(nbCall).toBe(3);
  });

  it("should work repeatedly (issues #2 & #3)", async () => {
    const middleware = RateLimit.middleware({
      max: 2,
      interval: 50,
      prefixKey: start as any,
      store: memoryStore,
    });
    await middleware(ctx, nextNb);
    await middleware(ctx, nextNb);
    await sleep(60);
    await middleware(ctx, nextNb);
    expect(nbCall).toBe(3);
  });

  it("should allow the error statusCode to be customized", async () => {
    const middleware = RateLimit.middleware({ max: 1, statusCode: 123, store });
    await middleware(ctx, nextNb);
    await middleware(ctx, nextNb);
    expect(ctx.status).toBe(123);
  });

  it("should use the custom handler when specified", async () => {
    const middleware = RateLimit.middleware({
      max: 1,
      // @ts-ignore
      handler: (c) => {
        c.status = 231;
      },
      store,
    });
    await middleware(ctx, nextNb);
    await middleware(ctx, nextNb);
    expect(ctx.status).toBe(231);
  });

  it("should allow custom skip function", async () => {
    const middleware = RateLimit.middleware({
      max: 1,
      // @ts-ignore
      skip: (c) => {
        assert.ok(c);
        return true;
      },
      store,
    });
    await middleware(ctx, nextNb);
    await middleware(ctx, nextNb);
    await middleware(ctx, nextNb);
    expect(nbCall).toBe(3);
  });

  it("should allow custom weight function", async () => {
    const middleware = RateLimit.middleware({
      max: 3,
      weight: () => 2,
      store,
    });
    await middleware(ctx, nextNb);
    await middleware(ctx, nextNb);
    expect(nbCall).toBe(1);
  });

  it("should allow custom key generators", async () => {
    let key = null;
    const middleware = RateLimit.middleware({
      // @ts-ignore
      keyGenerator: (c) => {
        assert.ok(c);
        key = "TITI";
        return key;
      },
      store,
    });
    await middleware(ctx, nextNb);
    expect(key).toBe("TITI");
  });

  it("should set X-RateLimit-Reset with the correct value", async () => {
    const middleware = RateLimit.middleware({ store });
    const dateEnd = new Date(1528824545000);
    const dateEndSec = (dateEnd as unknown as number) / 1000;
    let dateEndReset = null;

    // @ts-ignore
    store.incr = async () => {
      return { counter: 10, dateEnd };
    };

    // @ts-ignore
    ctx.set = (key, value) => {
      if (key === "X-RateLimit-Reset") {
        dateEndReset = value;
      }
    };
    await middleware(ctx, nextNb);

    expect(dateEndReset).toBe(dateEndSec);
    expect(ctx.state.rateLimit.reset).toBe(dateEndSec);
  });

  describe("Whitelist users", () => {
    beforeEach(() => {
      store.incr = async () => {
        assert.fail("Ratelimit wasn't skipped");
      };
    });

    async function runtWhitelistTest(options: any) {
      const middleware = RateLimit.middleware({ store, ...options });
      await middleware(ctx, nextNb);
      expect(nbCall).toBe(1);
    }

    it("should skip ratelimit if userId is whitelisted", async () => {
      await runtWhitelistTest({
        whitelist: ["userId"],
        getUserId: () => Promise.resolve("prefix::userId"),
      });
    });

    it("should allow to overwrite the prefix key separator", async () => {
      ctx.state.user.id = "userId";

      await runtWhitelistTest({
        whitelist: ["userId"],
        prefixKeySeparator: "|",
      });
    });

    it("should allow to customize the key parsing logic", async () => {
      ctx.state.user.id = "userId";
      await runtWhitelistTest({
        store,
        whitelist: ["userId"],
        getUserIdFromKey: (key: string) => key.split("|")[1],
      });
    });
  });
});
