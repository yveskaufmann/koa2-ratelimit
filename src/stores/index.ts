export { MemoryStore } from "./MemoryStore";
export { Store } from "./Store";

import { MemoryStore } from "./MemoryStore";
import { Store } from "./Store";

export const Stores = {
  Memory: MemoryStore,
  get Sequelize() {
    // eslint-disable-next-line global-require
    return require("./SequelizeStore");
  },
  get Mongodb() {
    // eslint-disable-next-line global-require
    return require("./MongodbStore");
  },
  get Redis() {
    // eslint-disable-next-line global-require
    return require("./RedisStore");
  },
  Store,
};
