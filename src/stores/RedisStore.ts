/**
 * RedisStore
 *
 * RedisStore for koa2-ratelimit
 *
 * @author Ashok Vishwakarma <akvlko@gmail.com>
 *
 */

import { RateLimitOptions } from "../Options";
import { Time } from "../Time";

import { HitState, Store } from "./Store";

/**
 * redis
 *
 * node-redis module
 */
import redis from "redis";

/**
 * RedisStore
 *
 * Class RedisStore
 */
export class RedisStore extends Store {
  private client: any;

  /**
   * constructor
   * @param {*} config
   *
   * config is redis config
   */
  constructor(config: any) {
    super();
    this.client = redis.createClient(config);
    this.client.on("error", (err: Error) =>
      console.log("Redis Client Error", err)
    );
    this.client.connect();
  }

  /**
   * _hit
   * @access private
   * @param {*} key
   * @param {*} options
   * @param {*} weight
   */
  private async _hit(key: string, options?: RateLimitOptions, weight?: number) {
    let [counter, dateEnd] = await this.client.multi().get(key).ttl(key).exec();

    const interval = Time.toMs(options.interval);

    if (counter === null) {
      counter = weight;
      dateEnd = Date.now() + interval;

      const seconds = Math.ceil(interval / 1000);
      await this.client.setEx(key, seconds.toString(), counter.toString());
    } else if (dateEnd === -2 || dateEnd === -1) {
      counter = counter + weight;
      dateEnd = Date.now() + interval;

      const seconds = Math.ceil(interval / 1000);
      await this.client.setEx(key, seconds.toString(), counter.toString());
    } else {
      counter = await this.client.incrBy(key, weight);
    }

    return {
      counter,
      dateEnd,
    };
  }

  /**
   * incr
   *
   * Override incr method from Store class
   * @param {*} key
   * @param {*} options
   * @param {*} weight
   */

  async incr(
    key: string,
    options: RateLimitOptions,
    weight: number
  ): Promise<HitState> {
    return await this._hit(key, options, weight);
  }

  /**
   * decrement
   *
   * Override decrement method from Store class
   * @param {*} key
   * @param {*} options
   * @param {*} weight
   */
  async decrement(
    key: string,
    options: RateLimitOptions,
    weight: number
  ): Promise<void> {
    await this.client.decrBy(key, weight);
  }

  /**
   * saveAbuse
   *
   * Override saveAbuse method from Store class
   */
  saveAbuse() {}
}
