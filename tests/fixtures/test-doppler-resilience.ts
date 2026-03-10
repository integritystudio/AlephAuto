import { DopplerResilience } from '../../sidequest/utils/doppler-resilience.ts';

/**
 * Concrete subclass for testing. Override fetchFromDoppler via assignment:
 *   instance.fetchFromDoppler = async () => ({ ... });
 */
export class TestDopplerResilience extends DopplerResilience {
  async fetchFromDoppler(): Promise<Record<string, unknown>> {
    throw new Error('TestDopplerResilience: fetchFromDoppler not configured');
  }
}
