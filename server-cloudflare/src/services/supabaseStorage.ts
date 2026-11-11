export interface SupabaseStorageEnv {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_PHOTOS_BUCKET?: string;
  SUPABASE_BACKUPS_BUCKET?: string;
}

export const DEFAULT_PHOTOS_BUCKET = 'bdlegal-photos';
export const DEFAULT_BACKUPS_BUCKET = 'bdlegal-backups';
const SUPABASE_REF_PREFIX = 'supabase:';

export function getSupabaseSecretKey(env: SupabaseStorageEnv): string {
  return (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export function getSupabaseUrl(env: SupabaseStorageEnv): string {
  return (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
}

export function isSupabaseStorageConfigured(env: SupabaseStorageEnv): boolean {
  return Boolean(getSupabaseUrl(env) && getSupabaseSecretKey(env));
}

export function getPhotosBucketName(env: SupabaseStorageEnv): string {
  return (env.SUPABASE_PHOTOS_BUCKET || DEFAULT_PHOTOS_BUCKET).trim();
}

export function getBackupsBucketName(env: SupabaseStorageEnv): string {
  return (env.SUPABASE_BACKUPS_BUCKET || DEFAULT_BACKUPS_BUCKET).trim();
}

export function buildSupabaseAuthHeaders(secretKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: secretKey,
  };
  // Modern opaque sb_secret_ keys must travel on apikey (not Bearer JWT);
  // legacy JWT service_role keys still use Authorization: Bearer.
  if (!secretKey.startsWith('sb_secret_')) {
    headers['Authorization'] = `Bearer ${secretKey}`;
  }
  return headers;
}

function encodeStoragePath(objectPath: string): string {
  return objectPath
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function formatSupabaseStorageRef(bucket: string, objectPath: string): string {
  return `${SUPABASE_REF_PREFIX}${bucket}:${objectPath}`;
}

export function parseSupabaseStorageRef(
  ref: string | null | undefined
): { bucket: string; objectPath: string } | null {
  if (!ref || !ref.startsWith(SUPABASE_REF_PREFIX)) {
    return null;
  }
  const rest = ref.slice(SUPABASE_REF_PREFIX.length);
  const sepIdx = rest.indexOf(':');
  if (sepIdx <= 0 || sepIdx === rest.length - 1) {
    return null;
  }
  return {
    bucket: rest.slice(0, sepIdx),
    objectPath: rest.slice(sepIdx + 1),
  };
}

export async function uploadToSupabaseStorage(params: {
  env: SupabaseStorageEnv;
  bucket: string;
  objectPath: string;
  data: Uint8Array | ArrayBuffer;
  contentType: string;
  cacheControl?: string;
}): Promise<void> {
  const baseUrl = getSupabaseUrl(params.env);
  const secretKey = getSupabaseSecretKey(params.env);
  if (!baseUrl || !secretKey) {
    throw new Error('Supabase Storage is not configured');
  }

  const encodedBucket = encodeURIComponent(params.bucket);
  const encodedPath = encodeStoragePath(params.objectPath);
  const url = `${baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`;

  const bodyBytes = params.data instanceof Uint8Array ? params.data : new Uint8Array(params.data);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...buildSupabaseAuthHeaders(secretKey),
      'Content-Type': params.contentType,
      'x-upsert': 'true',
      'Cache-Control': params.cacheControl || 'private, max-age=86400',
    },
    body: bodyBytes,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Supabase Storage upload failed (${res.status}): ${errText}`);
  }
}

export async function downloadFromSupabaseStorage(params: {
  env: SupabaseStorageEnv;
  bucket: string;
  objectPath: string;
}): Promise<{ data: ArrayBuffer; contentType: string | null } | null> {
  const baseUrl = getSupabaseUrl(params.env);
  const secretKey = getSupabaseSecretKey(params.env);
  if (!baseUrl || !secretKey) {
    throw new Error('Supabase Storage is not configured');
  }

  const encodedBucket = encodeURIComponent(params.bucket);
  const encodedPath = encodeStoragePath(params.objectPath);
  const url = `${baseUrl}/storage/v1/object/authenticated/${encodedBucket}/${encodedPath}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: buildSupabaseAuthHeaders(secretKey),
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    // Supabase Storage returns HTTP 400 with {"statusCode":"404","error":"not_found",...} for missing objects
    if (res.status === 400 && (errText.includes('not_found') || errText.includes('Object not found'))) {
      return null;
    }
    throw new Error(`Supabase Storage download failed (${res.status}): ${errText}`);
  }

  return {
    data: await res.arrayBuffer(),
    contentType: res.headers.get('content-type'),
  };
}

export async function deleteFromSupabaseStorage(params: {
  env: SupabaseStorageEnv;
  bucket: string;
  objectPath: string;
}): Promise<void> {
  const baseUrl = getSupabaseUrl(params.env);
  const secretKey = getSupabaseSecretKey(params.env);
  if (!baseUrl || !secretKey) {
    throw new Error('Supabase Storage is not configured');
  }

  const encodedBucket = encodeURIComponent(params.bucket);
  const encodedPath = encodeStoragePath(params.objectPath);
  const url = `${baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: buildSupabaseAuthHeaders(secretKey),
  });

  if (res.status === 404) {
    return;
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 400 && (errText.includes('not_found') || errText.includes('Object not found'))) {
      return;
    }
    throw new Error(`Supabase Storage delete failed (${res.status}): ${errText}`);
  }
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8Array(input: string): Uint8Array {
  const raw = input.includes(',') ? input.split(',')[1] : input;
  const cleaned = raw.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function detectImageMimeFromMagic(
  bytes: Uint8Array
): { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}
