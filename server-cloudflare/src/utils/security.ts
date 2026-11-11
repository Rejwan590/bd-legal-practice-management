export function generateRandomHex(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function summarizeUserAgent(ua?: string): string {
  if (!ua) return 'Unknown Browser';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return `${browser} on ${os}`;
}

export function validatePasswordStrength(password: string): { isValid: boolean; message?: string } {
  if (!password || password.length < 8) {
    return { isValid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one number.' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one special character.' };
  }
  return { isValid: true };
}

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / max) * max;
  let val = 0;
  do {
    crypto.getRandomValues(buf);
    val = buf[0];
  } while (val >= limit);
  return val % max;
}

export function generateSecureTemporaryPassword(): string {
  const lettersUpper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lettersLower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*';
  const allChars = lettersUpper + lettersLower + numbers + symbols;

  const picked = [
    lettersUpper[randomInt(lettersUpper.length)],
    lettersLower[randomInt(lettersLower.length)],
    numbers[randomInt(numbers.length)],
    symbols[randomInt(symbols.length)],
  ];
  for (let i = 0; i < 12; i++) {
    picked.push(allChars[randomInt(allChars.length)]);
  }
  for (let i = picked.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked.join('');
}
