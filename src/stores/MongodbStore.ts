import mongoose from "mongoose";
import { RateLimitOptions } from "../Options";
import { Time } from "../Time";
import { HitState, SaveAbuseOptions, Store } from "./Store";

async function findOrCreate(this: any, { where, defaults }: any) {
  return this.collection.findOneAndUpdate(
    where,
    { $setOnInsert: defaults },
    { upsert: true, returnDocument: "after" } // return new doc if one is upserted
  );
}

const abuseSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    index: { unique: true },
  },
  counter: {
    type: Number,
    required: true,
    default: 0,
  },
  dateEnd: {
    type: Date,
    required: true,
  },
});

abuseSchema.statics.findOrCreate = findOrCreate;

const abuseHistorySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
  },
  prefix: {
    type: String,
    required: false,
  },
  interval: {
    type: Number,
    required: true,
  },
  nbMax: {
    type: Number,
    required: true,
  },
  nbHit: {
    type: Number,
    required: true,
    default: 0,
  },
  userId: {
    type: Number,
    required: false,
  },
  ip: {
    type: String,
    required: false,
  },
  dateEnd: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});
abuseHistorySchema.index({ key: 1, dateEnd: 1 }, { unique: true });

function beforSave(this: any, next: () => void) {
  this.updatedAt = Date.now();
  next();
}
abuseHistorySchema.pre("save", beforSave);
abuseHistorySchema.pre("update", beforSave);
abuseHistorySchema.pre("findOneAndUpdate", beforSave);
abuseHistorySchema.statics.findOrCreate = findOrCreate;

export interface MongodbStoreOptions {
  collectionName?: string;
  collectionAbuseName?: string;
}

export class MongodbStore extends Store {
  private collectionName: string;
  private collectionAbuseName: string;

  private Ratelimits: any;
  private Abuse: any;

  constructor(private mongodb: any, options: MongodbStoreOptions = {}) {
    super();
    this.collectionName = options.collectionName || "Ratelimits";
    this.collectionAbuseName =
      options.collectionAbuseName || `${this.collectionName}Abuses`;
    this.Ratelimits = mongodb.model(this.collectionName, abuseSchema);
    this.Abuse = mongodb.model(this.collectionAbuseName, abuseHistorySchema);
  }

  private async _increment(model: any, where: any, nb = 1, field: any) {
    return model.findOneAndUpdate(where, { $inc: { [field]: nb } });
  }

  // remove all if time is passed
  private async _removeAll() {
    await this.Ratelimits.deleteMany({ dateEnd: { $lte: Date.now() } });
  }

  async incr(
    key: string,
    options: RateLimitOptions,
    weight: number
  ): Promise<HitState> {
    await this._removeAll();

    const data = await this.Ratelimits.findOrCreate({
      where: { key },
      defaults: {
        key,
        dateEnd: Date.now() + Time.toMs(options.interval),
        counter: 0,
      },
    });
    await this._increment(this.Ratelimits, { key }, weight, "counter");
    return {
      counter: data.value.counter + weight,
      dateEnd: data.value.dateEnd,
    };
  }

  async decrement(
    key: string,
    options: RateLimitOptions,
    weight: number
  ): Promise<void> {
    await this._increment(this.Ratelimits, { key }, -weight, "counter");
  }

  async saveAbuse(options?: SaveAbuseOptions) {
    const ratelimit = await this.Ratelimits.findOne({
      key: options.key,
    }).exec();

    if (ratelimit) {
      // eslint-disable-next-line
      const dateEnd = ratelimit.dateEnd;
      // create if not exist
      await this.Abuse.findOrCreate({
        where: { key: options.key, dateEnd },
        defaults: {
          key: options.key,
          prefix: options.prefixKey,
          interval: options.interval,
          nbMax: options.max,
          nbHit: options.max,
          userId: options.user_id,
          ip: options.ip,
          dateEnd,
        },
      }).catch(() => {});

      await this._increment(
        this.Abuse,
        { key: options.key, dateEnd },
        1,
        "nbHit"
      );
    }
  }
}
