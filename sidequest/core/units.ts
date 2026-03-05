// units.ts

// ---------- TIME (milliseconds) ----------
export const TIME_MS = {
  MS: 1,
  SECOND: 1_000,
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
  WEEK: 604_800_000,
} as const;
// ---------- Time (seconds) ----------
export enum SECONDS {
  SECOND = TIME_MS.MS,
  MINUTE = TIME_MS.MINUTE / TIME_MS.SECOND,
  HOUR = TIME_MS.HOUR / TIME_MS.SECOND,
  DAY = TIME_MS.DAY / TIME_MS.SECOND,
  WEEK = TIME_MS.WEEK / TIME_MS.SECOND,
}
// ------- Time (constants) --------------
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const DAYS_PER_WEEK = 7;
export const MAX_DAY_OF_MONTH = 31;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = 365;
export const MIN_VALID_YEAR = 2000;
export const MAX_VALID_YEAR = 2100;

// ---------- Time (nanosecond conversion) ----------
export const NANOSECONDS_PER_SECOND = 1_000_000_000;
export const NANOSECONDS_PER_SECOND_BIGINT = 1_000_000_000n;
export const MAX_NANOSECOND_FRACTION = NANOSECONDS_PER_SECOND - 1;
// ---------- Time (rounding utilities) ----------
export const ONE_MILLION = 1e6;
export const ROUND_1DP_FACTOR = 10;
export const COST_DECIMAL_PLACES = 4;
export const ROUND_4DP_FACTOR = 10_000;
export const PERCENT_MULTIPLIER = 100;
export const DEFAULT_EXPORT_BATCH_SIZE = 100;
export const EXPORT_MIN_BATCH_SIZE_LIMIT = 1;
export const EXPORT_MAX_BATCH_SIZE_LIMIT = 1_000;
export const EXPORT_MIN_TIMEOUT_MS_LIMIT = 1_000;
export const EXPORT_MAX_TIMEOUT_MS_LIMIT = 120_000;
export const DEFAULT_EXPORT_TIMEOUT_MS = 30_000;
export const MS = TIME_MS;
export const ONE_MINUTE_MS = TIME_MS.MINUTE;

// ---------- Bits / Bytes ----------
const BIT_VALUE = 1 << 0; // 1 bit
const KB = 1 << 10; // 1024 Bits per KB

export enum BITS {
  BIT = BIT_VALUE,
  B2 = 1 << 1, // 2
  B4 = 1 << 2, // 4
  BYTE = 1 << 3, // 8 bits per Byte
  B16 = 1 << 4, // 16
  B32 = 1 << 5, // 32
  B64 = 1 << 6, // 64
  B128 = 1 << 7, // 128
  B256 = 1 << 8, // 256
  B512 = 1 << 9, // 512
  QUARTER_KB = 1 << 8, // 256
  HALF_KB = 1 << 9, // 512
}

// ---------- Canonical percentile values -----------
export enum PERCENTILE {
  P88 = 0.88,
  P50 = 50,
  P95 = 95,
  P99 = 99,
}

export const BYTES = {
  B: 1,
  KB,
  MB: KB ** 2,  // 1,048,576
  GB: KB ** 3, // 1,048,576
  TB: KB ** 4, // 1,099,511,627,776
  PB: KB ** 5,
} as const;

const DECIMAL_KB = EXPORT_MAX_BATCH_SIZE_LIMIT;

export const BYTES_DECIMAL = {
  B: 1,
  KB: DECIMAL_KB,
  MB: DECIMAL_KB ** 2,
  GB: DECIMAL_KB ** 3,
  TB: DECIMAL_KB ** 4,
  PB: DECIMAL_KB ** 5,
} as const;