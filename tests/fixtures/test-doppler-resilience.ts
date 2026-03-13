import { DopplerResilience } from '../../sidequest/utils/doppler-resilience.ts';

/**
 * Concrete subclass of abstract DopplerResilience for testing.
 * Default fetchFromDoppler throws; override via assignment in tests.
 */
export class TestDopplerResilience extends DopplerResilience {
  override async fetchFromDoppler(): Promise<Record<string, unknown>> {
    throw new Error('TestDopplerResilience: fetchFromDoppler not configured');
  }
}
