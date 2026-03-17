import * as Sentry from '@sentry/node';
import { config } from './sidequest/core/config.ts';

Sentry.init({
  dsn: config.sentryDsn,
  environment: config.nodeEnv,
  tracesSampleRate: config.sentryTracesSampleRate,
  sendDefaultPii: true,
  includeLocalVariables: true,
  enableLogs: true,
});
