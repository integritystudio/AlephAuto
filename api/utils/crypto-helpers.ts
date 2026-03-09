import crypto from 'crypto';

/**
 * Constant-time string comparison that does not leak length information.
 */
export function timingSafeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const maxLen = Math.max(bufA.length, bufB.length);
  const paddedA = Buffer.alloc(maxLen, 0);
  const paddedB = Buffer.alloc(maxLen, 0);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  const equal = crypto.timingSafeEqual(paddedA, paddedB);
  const sameLength = bufA.length === bufB.length;
  // Bitwise AND prevents short-circuit evaluation that could leak length info
  return (equal && sameLength);
}
