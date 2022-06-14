import { transformTimestampArgument } from "@redis/time-series/dist/commands";
import { Store } from "./stores/Store";
import { Time } from "./Time";

export interface RateLimitOptions {
  /**
   *  milliseconds - how long to keep records of requests in memory
   */
  interval?: number | Time;

  /**
   *  how many requests to allow through before starting to delay responses
   */
  delayAfter?: number;

  /**
   *  milliseconds - base delay applied to the response - multiplied by number of recent hits for the same key.
   */
  timeWait?: number | Time;

  /**
   * max number of recent connections during `window` milliseconds before sending a 429 response
   */
  max?: number;

  /**
   * Message that should be used for too man requets
   */
  message?: string;

  /**
   * status code for that signal Too Many Requests (RFC 6585) by default 429.
   */
  statusCode?: number;

  /**
   * Send custom rate limit header with limit and remaining by default false.
   */
  headers?: boolean;

  /**
   *  Do not count failed requests (status >= 400)
   */
  skipFailedRequests?: boolean;

  /**
   * the prefixKey to get to remove all key
   */
  prefixKey?: string;

  /**
   * the seperator between the prefixKey and the userId
   */
  prefixKeySeparator?: string;

  /**
   * The store that should be used to store current requests counts. By default this is the MemoryStore implementation.
   */
  store?: Store;

  keyGenerator?(ctx: import("koa").Context): Promise<string>;
  skip?(ctx: import("koa").Context): Promise<boolean>;
  getUserId?(ctx: import("koa").Context): Promise<any>;
  getUserId?(ctx: import("koa").Context): Promise<any>;
  getUserIdFromKey?(key: string): string;
  handler?(ctx: import("koa").Context): Promise<void>;
  onLimitReached?(ctx: import("koa").Context): Promise<void>;
  weight?(ctx: import("koa").Context): Promise<number> | number;
  whitelist?: string[];
}
