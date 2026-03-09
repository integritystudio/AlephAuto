/**
 * Frontend timing constants.
 */
export const DASHBOARD_TIMING = {
  STATUS_POLL_INTERVAL_MS: 5000,
} as const;

/**
 * Frontend WebSocket connection constants.
 * Mirrors backend WEBSOCKET group in sidequest/core/constants.ts.
 */
export const DASHBOARD_WEBSOCKET = {
  MAX_RECONNECT_ATTEMPTS: 10,
  INITIAL_RECONNECT_DELAY_MS: 1000,
  MAX_RECONNECT_DELAY_MS: 10000,
  HEARTBEAT_INTERVAL_MS: 25000,
} as const;

