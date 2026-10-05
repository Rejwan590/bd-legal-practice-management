/**
 * Client-Side Cryptographic Engine for Chamber Backups
 * Implements SHA-256 Checksums, PBKDF2 Key Derivation, and AES-GCM 256-bit Encryption
 * Works natively in modern browsers and Node.js via globalThis.crypto.subtle
 */

import {
  ChamberBackupMetadata,
  ChamberBackupPayload,
  EncryptedBackupPayload,
} from './types';

// Deterministic JSON stringifier to guarantee identical SHA-256 checksums across systems
export function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalStringify(item)).join(',') + ']';
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return (
    '{' +
    keys
      .map(
        (key) =>
          JSON.stringify(key) +
          ':' +
          canonicalStringify(record[key])
      )
      .join(',') +
    '}'
  );
}

// Convert Uint8Array to Base64
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 to Uint8Array
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Compute SHA-256 Hex Hash
export async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const DEFAULT_PBKDF2_ITERATIONS = 600000;
export const LEGACY_PBKDF2_ITERATIONS = 100000;

// Derive AES-GCM 256-bit key from password using PBKDF2
async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt payload using AES-GCM
export async function encryptChamberBackup(
  plainPayload: ChamberBackupPayload,
  password: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<EncryptedBackupPayload> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(password, salt, iterations);
  const encoder = new TextEncoder();
  const plainText = JSON.stringify(plainPayload);
  const encodedData = encoder.encode(plainText);

  const cipherBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encodedData
  );

  const ciphertextBase64 = uint8ArrayToBase64(new Uint8Array(cipherBuffer));
  const checksum = await computeSha256(ciphertextBase64);

  const updatedMetadata: ChamberBackupMetadata = {
    ...plainPayload.metadata,
    encrypted: true,
  };

  return {
    magic: 'BD_LEGAL_PRACTICE_BACKUP_ENCRYPTED',
    version: '1.0',
    metadata: updatedMetadata,
    encryption: {
      algorithm: 'AES-GCM-256',
      kdf: 'PBKDF2',
      iterations,
      salt: uint8ArrayToBase64(salt),
      iv: uint8ArrayToBase64(iv),
    },
    ciphertext: ciphertextBase64,
    checksum,
  };
}

// Decrypt encrypted chamber backup
export async function decryptChamberBackup(
  encryptedPayload: EncryptedBackupPayload,
  password: string
): Promise<ChamberBackupPayload> {
  const salt = base64ToUint8Array(encryptedPayload.encryption.salt);
  const iv = base64ToUint8Array(encryptedPayload.encryption.iv);
  const cipherBytes = base64ToUint8Array(encryptedPayload.ciphertext);
  const iterations = encryptedPayload.encryption?.iterations || LEGACY_PBKDF2_ITERATIONS;

  const key = await deriveKey(password, salt, iterations);

  try {
    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      cipherBytes as BufferSource
    );

    const decoder = new TextDecoder();
    const decryptedJson = decoder.decode(decryptedBuffer);
    const parsed = JSON.parse(decryptedJson) as ChamberBackupPayload;

    if (parsed.magic !== 'BD_LEGAL_PRACTICE_BACKUP') {
      throw new Error('Invalid decrypted payload structure: magic header mismatch');
    }

    return parsed;
  } catch (err) {
    throw new Error(
      'Decryption failed: Incorrect password or corrupted encrypted backup payload'
    );
  }
}
