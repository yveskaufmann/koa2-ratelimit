"use strict";
/* global describe, it, beforeEach, afterEach */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const expect_1 = __importDefault(require("expect"));
const stores_1 = require("../src/stores");
const RateLimit_1 = __importDefault(require("../src/RateLimit"));
class InvalidStore {
}
class MockStore extends stores_1.Store {
    constructor() {
        super(...arguments);
        this.nb = 0;
        this.incr_was_called = false;
        this.decrement_was_called = false;
        this.saveAbuse_was_called = false;
    }
    incr(key, options, weight) {
        return __awaiter(this, void 0, void 0, function* () {
            this.nb += weight;
            this.incr_was_called = true;
            return {
                counter: this.nb,
                dateEnd: new Date().setHours(new Date().getHours() + 1),
            };
        });
    }
    decrement(key, options, weight) {
        return __awaiter(this, void 0, void 0, function* () {
            this.decrement_was_called = true;
            this.nb -= weight;
        });
    }
    saveAbuse() {
        return __awaiter(this, void 0, void 0, function* () {
            this.saveAbuse_was_called = true;
        });
    }
}
function getCtx() {
    return {
        request: { ip: "192.168.1.0" },
        res: { on: () => { } },
        state: { user: { id: 1 } },
        set: () => { },
    };
}
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => setTimeout(resolve, ms));
    });
}
describe("RateLimit node module", () => {
    let start;
    let nbCall;
    let ctx;
    let store;
    let memoryStore;
    beforeEach(() => {
        start = Date.now();
        store = new MockStore();
        stores_1.MemoryStore.cleanAll();
        memoryStore = new stores_1.MemoryStore();
        nbCall = 0;
        ctx = getCtx();
    });
    afterEach(() => {
        nbCall = 0;
    });
    const nextNb = () => {
        nbCall += 1;
        return;
    };
    it("Times should return the correct time in ms", () => {
        (0, expect_1.default)(RateLimit_1.default.RateLimit.timeToMs(123)).toBe(123);
        (0, expect_1.default)(RateLimit_1.default.RateLimit.timeToMs({ hour: 2 })).toBe(2 * 3600000);
        (0, expect_1.default)(RateLimit_1.default.RateLimit.timeToMs({ hour: 2, min: 3 })).toBe(2 * 3600000 + 3 * 60000);
    });
    it("Times should throw error if key does not exist", (done) => {
        try {
            // @ts-expect-error
            RateLimit_1.default.timeToMs({ hours: 3 });
        }
        catch (e) {
            return done();
        }
        return done(new Error("Times should throw error if key does not exist"));
    });
    it("should not allow to use of a store that is not valid", (done) => {
        try {
            // @ts-expect-error
            middleware({ store: new InvalidStore() });
        }
        catch (e) {
            return done();
        }
        return done(new Error("It allowed an invalid store"));
    });
    it("should call incr on the store", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({ store });
        yield middleware(getCtx(), nextNb);
        (0, expect_1.default)(store.incr_was_called).toBe(true);
    }));
    it("should apply a small delay to the second request", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({
            delayAfter: 1,
            timeWait: 500,
            store,
        });
        yield middleware(getCtx(), nextNb);
        start = Date.now();
        yield middleware(getCtx(), nextNb);
        (0, expect_1.default)(Date.now() - start).toBeGreaterThan(500);
    }));
    it("should apply a larger delay to the subsequent request", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({
            delayAfter: 1,
            timeWait: 100,
            store,
        });
        yield middleware(getCtx(), nextNb);
        yield middleware(getCtx(), nextNb);
        yield middleware(getCtx(), nextNb);
        yield middleware(getCtx(), nextNb);
        (0, expect_1.default)(Date.now() - start).toBeGreaterThan(400);
    }));
    it("should allow delayAfter requests before delaying responses", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({
            delayAfter: 2,
            timeWait: 100,
            store,
        });
        yield middleware(getCtx(), nextNb);
        (0, expect_1.default)(Date.now() - start).toBeLessThan(50);
        yield middleware(getCtx(), nextNb);
        (0, expect_1.default)(Date.now() - start).toBeLessThan(100);
        yield middleware(getCtx(), nextNb);
        (0, expect_1.default)(Date.now() - start).toBeGreaterThan(100);
        (0, expect_1.default)(Date.now() - start).toBeLessThan(150);
    }));
    it("should allow delayAfter to be disabled entirely", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({
            delayAfter: 0,
            timeWait: 1000,
            store,
        });
        yield middleware(getCtx(), nextNb);
        yield middleware(getCtx(), nextNb);
        yield middleware(getCtx(), nextNb);
        (0, expect_1.default)(Date.now() - start).toBeLessThan(100);
    }));
    it("should refuse additional connections once IP has reached the max", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({ max: 1, store });
        yield middleware(getCtx(), nextNb);
        yield middleware(getCtx(), nextNb);
        yield middleware(getCtx(), nextNb);
        (0, expect_1.default)(nbCall).toBe(1);
    }));
    it("should allow max to be disabled entirely", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({ max: 0, store });
        yield middleware(getCtx(), nextNb);
        yield middleware(getCtx(), nextNb);
        yield middleware(getCtx(), nextNb);
        (0, expect_1.default)(nbCall).toBe(3);
    }));
    it("should show the provided message instead of the default message when max connections are reached", () => __awaiter(void 0, void 0, void 0, function* () {
        const message = "my msg";
        const middleware = RateLimit_1.default.middleware({ max: 2, message, store });
        yield middleware(getCtx(), nextNb);
        yield middleware(getCtx(), nextNb);
        const ctxDefault = getCtx();
        yield middleware(ctxDefault, nextNb);
        (0, expect_1.default)(ctxDefault.body.message).toBe(message);
    }));
    it("should (eventually) accept new connections from a blocked IP", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({
            max: 10,
            interval: 50,
            prefixKey: start,
            store: memoryStore,
        });
        yield middleware(ctx, nextNb);
        yield middleware(ctx, nextNb);
        yield sleep(60);
        yield middleware(ctx, nextNb);
        (0, expect_1.default)(nbCall).toBe(3);
    }));
    it("should work repeatedly (issues #2 & #3)", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({
            max: 2,
            interval: 50,
            prefixKey: start,
            store: memoryStore,
        });
        yield middleware(ctx, nextNb);
        yield middleware(ctx, nextNb);
        yield sleep(60);
        yield middleware(ctx, nextNb);
        (0, expect_1.default)(nbCall).toBe(3);
    }));
    it("should allow the error statusCode to be customized", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({ max: 1, statusCode: 123, store });
        yield middleware(ctx, nextNb);
        yield middleware(ctx, nextNb);
        (0, expect_1.default)(ctx.status).toBe(123);
    }));
    it("should use the custom handler when specified", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({
            max: 1,
            // @ts-ignore
            handler: (c) => {
                c.status = 231;
            },
            store,
        });
        yield middleware(ctx, nextNb);
        yield middleware(ctx, nextNb);
        (0, expect_1.default)(ctx.status).toBe(231);
    }));
    it("should allow custom skip function", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({
            max: 1,
            // @ts-ignore
            skip: (c) => {
                assert_1.default.ok(c);
                return true;
            },
            store,
        });
        yield middleware(ctx, nextNb);
        yield middleware(ctx, nextNb);
        yield middleware(ctx, nextNb);
        (0, expect_1.default)(nbCall).toBe(3);
    }));
    it("should allow custom weight function", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({
            max: 3,
            weight: () => 2,
            store,
        });
        yield middleware(ctx, nextNb);
        yield middleware(ctx, nextNb);
        (0, expect_1.default)(nbCall).toBe(1);
    }));
    it("should allow custom key generators", () => __awaiter(void 0, void 0, void 0, function* () {
        let key = null;
        const middleware = RateLimit_1.default.middleware({
            // @ts-ignore
            keyGenerator: (c) => {
                assert_1.default.ok(c);
                key = "TITI";
                return key;
            },
            store,
        });
        yield middleware(ctx, nextNb);
        (0, expect_1.default)(key).toBe("TITI");
    }));
    it("should set X-RateLimit-Reset with the correct value", () => __awaiter(void 0, void 0, void 0, function* () {
        const middleware = RateLimit_1.default.middleware({ store });
        const dateEnd = new Date(1528824545000);
        const dateEndSec = dateEnd / 1000;
        let dateEndReset = null;
        // @ts-ignore
        store.incr = () => __awaiter(void 0, void 0, void 0, function* () {
            return { counter: 10, dateEnd };
        });
        // @ts-ignore
        ctx.set = (key, value) => {
            if (key === "X-RateLimit-Reset") {
                dateEndReset = value;
            }
        };
        yield middleware(ctx, nextNb);
        (0, expect_1.default)(dateEndReset).toBe(dateEndSec);
        (0, expect_1.default)(ctx.state.rateLimit.reset).toBe(dateEndSec);
    }));
    describe("Whitelist users", () => {
        beforeEach(() => {
            store.incr = () => __awaiter(void 0, void 0, void 0, function* () {
                assert_1.default.fail("Ratelimit wasn't skipped");
            });
        });
        function runtWhitelistTest(options) {
            return __awaiter(this, void 0, void 0, function* () {
                const middleware = RateLimit_1.default.middleware(Object.assign({ store }, options));
                yield middleware(ctx, nextNb);
                (0, expect_1.default)(nbCall).toBe(1);
            });
        }
        it("should skip ratelimit if userId is whitelisted", () => __awaiter(void 0, void 0, void 0, function* () {
            yield runtWhitelistTest({
                whitelist: ["userId"],
                getUserId: () => Promise.resolve("prefix::userId"),
            });
        }));
        it("should allow to overwrite the prefix key separator", () => __awaiter(void 0, void 0, void 0, function* () {
            ctx.state.user.id = "userId";
            yield runtWhitelistTest({
                whitelist: ["userId"],
                prefixKeySeparator: "|",
            });
        }));
        it("should allow to customize the key parsing logic", () => __awaiter(void 0, void 0, void 0, function* () {
            ctx.state.user.id = "userId";
            yield runtWhitelistTest({
                store,
                whitelist: ["userId"],
                getUserIdFromKey: (key) => key.split("|")[1],
            });
        }));
    });
});
//# sourceMappingURL=RateLimit.js.map