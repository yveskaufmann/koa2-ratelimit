export type TimeKey =
  | "ms"
  | "sec"
  | "min"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year";

const TimeKey: TimeKey[] = [
  "ms",
  "sec",
  "min",
  "hour",
  "day",
  "week",
  "month",
  "year",
];

const Times = {
  ms: 1,
  sec: 1000,
  min: 60000,
  hour: 3600000,
  day: 86400000,
  week: 604800000,
  month: 2628000000,
  year: 12 * 2628000000,
};

export type Time = { [k in TimeKey]?: number };

/**
 * Converts a given time object to timestamp in ms.
 */
export namespace Time {
  export function toMs(time: Time | number): number {
    if (typeof time === "number") {
      return time;
    }

    if (typeof time !== "object") {
      return 0;
    }

    let timeMs = 0;
    for (const key of Object.keys(time) as TimeKey[]) {
      if (key) {
        if (!TimeKey.includes(key)) {
          throw new Error(
            `Invalide key ${key}, allow keys: ${TimeKey.toString()}`
          );
        }
        if (time[key] > 0) {
          timeMs += time[key] * Times[key];
        }
      }
    }
    return timeMs;
  }
}
