// Cryptographic utilities using standard Web Crypto API (SubtleCrypto)

const ITERATIONS = 100000;
const KEY_LEN_BYTES = 64; // 512 bits
const HASH_IDENTIFIER = '$pbkdf2-sha512$v=1';

// Pre-computed dummy hash for timing-attack mitigation (non-existent users)
export const DUMMY_HASH = `${HASH_IDENTIFIER}$i=${ITERATIONS}$00112233445566778899aabbccddeeff$${'00'.repeat(KEY_LEN_BYTES)}`;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Constant-time byte array equality check to eliminate timing side-channels
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let c = 0;
  for (let i = 0; i < a.byteLength; i++) {
    c |= a[i] ^ b[i];
  }
  return c === 0;
}

/**
 * Hash a password using PBKDF2-HMAC-SHA-512
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-512',
    },
    passwordKey,
    KEY_LEN_BYTES * 8
  );

  const saltHex = bytesToHex(salt);
  const hashHex = bytesToHex(new Uint8Array(derivedBits));

  return `${HASH_IDENTIFIER}$i=${ITERATIONS}$${saltHex}$${hashHex}`;
}

/**
 * Verify a plaintext password against a stored hash (PBKDF2 or legacy format)
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  // Handle standard PBKDF2-SHA-512 format
  if (storedHash.startsWith('$pbkdf2-sha512$')) {
    const parts = storedHash.split('$');
    // Format: ["", "pbkdf2-sha512", "v=1", "i=100000", "<saltHex>", "<hashHex>"]
    if (parts.length < 6) return false;

    const iterPart = parts[3]; // "i=100000"
    const iterations = parseInt(iterPart.replace('i=', ''), 10) || ITERATIONS;
    const saltHex = parts[4];
    const expectedHashHex = parts[5];

    const salt = hexToBytes(saltHex);
    const expectedBytes = hexToBytes(expectedHashHex);

    const enc = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-512',
      },
      passwordKey,
      expectedBytes.byteLength * 8
    );

    return timingSafeEqual(new Uint8Array(derivedBits), expectedBytes);
  }

  // Unknown or legacy unsupported hash format
  return false;
}
