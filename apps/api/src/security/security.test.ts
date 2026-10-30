import { describe, expect, it } from 'vitest';
import { decrypt, deriveKeys, encrypt, hashPassword, safeEqual, sha256, verifyPassword } from './crypto.ts';
import { base32Decode, base32Encode, generateTotpSecret, totpCode, verifyTotp } from './totp.ts';

describe('crypto', () => {
  const keys = deriveKeys('a'.repeat(64));

  it('round-trips encrypted secrets and rejects tampering', () => {
    const sealed = encrypt(keys, 'client-secret-123');
    expect(sealed).not.toContain('client-secret');
    expect(decrypt(keys, sealed)).toBe('client-secret-123');
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA');
    expect(() => decrypt(keys, tampered)).toThrow();
    expect(() => decrypt(deriveKeys('b'.repeat(64)), sealed)).toThrow();
  });

  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('compares safely', () => {
    expect(safeEqual(sha256('x'), sha256('x'))).toBe(true);
    expect(safeEqual('a', 'ab')).toBe(false);
  });
});

describe('totp', () => {
  it('matches the RFC 6238 test vector', () => {
    // Secret "12345678901234567890" (ASCII), T = 59 s -> 94287082 (8 digits) / 287082 (6 digits).
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpCode(secret, 59_000, 30, 8)).toBe('94287082');
    expect(totpCode(secret, 59_000)).toBe('287082');
  });

  it('round-trips base32 and tolerates one step of drift', () => {
    const secret = generateTotpSecret();
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    const now = 1_800_000_000_000;
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 120_000), now)).toBe(false);
    expect(verifyTotp(secret, 'abc', now)).toBe(false);
  });
});
