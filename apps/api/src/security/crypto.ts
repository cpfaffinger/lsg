import crypto from 'node:crypto';

/**
 * Cryptographic helpers built only on node:crypto (no native add-ons).
 *
 * - Secrets at rest (Google client secret, TOTP secrets) use AES-256-GCM with a key derived
 *   from LSG_SECRET_KEY via HKDF.
 * - Session tokens are random; only their SHA-256 hash is stored.
 * - Admin passwords use scrypt, a memory-hard KDF.
 */

export interface Keys {
  encryption: Buffer;
}

export function deriveKeys(secret: string): Keys {
  const ikm = Buffer.from(secret, 'utf8');
  const salt = Buffer.from('lsg-v1', 'utf8');
  const encryption = Buffer.from(
    crypto.hkdfSync('sha256', ikm, salt, Buffer.from('lsg-encryption', 'utf8'), 32),
  );
  return { encryption };
}

/** Encrypts a UTF-8 string; output format: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(keys: Keys, plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.encryption, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(
    '.',
  );
}

export function decrypt(keys: Keys, payload: string): string {
  const [version, ivText, tagText, dataText] = payload.split('.');
  if (version !== 'v1' || !ivText || !tagText || dataText === undefined)
    throw new Error('Unsupported ciphertext');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keys.encryption, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]).toString(
    'utf8',
  );
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

const SCRYPT = { N: 1 << 15, r: 8, p: 1, keyLength: 64, maxmem: 96 * 1024 * 1024 };

function scryptAsync(password: string, salt: Buffer, params = SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      params.keyLength,
      { N: params.N, r: params.r, p: params.p, maxmem: params.maxmem },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/** Returns "scrypt$N$r$p$salt$hash". */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join(
    '$',
  );
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltText, hashText] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const key = await scryptAsync(password, Buffer.from(saltText, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    keyLength: expected.length,
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** Readable random password for generated first-run admin accounts. */
export function generatePassword(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (const byte of bytes) result += alphabet[byte % alphabet.length];
  return result;
}
