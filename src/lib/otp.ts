/**
 * OTP (One-Time Password) Service
 * - In-memory store with TTL-based expiration
 * - Auto-cleanup every 5 minutes
 * - Rate limiting: max 3 OTPs per token per hour
 * - Verification: max 5 attempts per OTP
 */

interface OTPEntry {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

interface OTPStore {
  [tokenKey: string]: OTPEntry;
}

const otpStore: OTPStore = {};
let cleanupInterval: NodeJS.Timeout | null = null;

const OTP_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const MAX_OTPS_PER_HOUR = 3;
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a 6-digit OTP code
 */
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Get OTP key for storage
 */
function getOTPKey(token: string, code?: string): string {
  if (code) {
    return `${token}:${code}`;
  }
  return token;
}

/**
 * Count OTPs created for a token in the last hour
 */
function countOTPsInLastHour(token: string): number {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const prefix = token + ":";

  return Object.entries(otpStore)
    .filter(([key]) => key.startsWith(prefix))
    .filter(([, entry]) => entry.createdAt > oneHourAgo)
    .length;
}

/**
 * Initialize auto-cleanup
 */
function initCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    cleanupExpiredOTPs();
  }, CLEANUP_INTERVAL);

  // Clear on process exit
  if (typeof process !== "undefined") {
    process.on("exit", () => {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
      }
    });
  }
}

/**
 * Generate OTP for a token and email
 * Returns the 6-digit code
 * Throws error if rate limit exceeded
 */
export function generateOTP(token: string, email: string): string {
  initCleanup();

  // Check rate limit: max 3 OTPs per token per hour
  const otpsInLastHour = countOTPsInLastHour(token);
  if (otpsInLastHour >= MAX_OTPS_PER_HOUR) {
    throw new Error("OTP request rate limit exceeded. Please try again in 1 hour.");
  }

  // Generate code
  const code = generateCode();
  const key = getOTPKey(token, code);
  const now = Date.now();

  // Store OTP entry
  otpStore[key] = {
    code,
    email,
    expiresAt: now + OTP_TTL,
    attempts: 0,
    createdAt: now,
  };

  return code;
}

/**
 * Verify OTP code
 * Returns { valid: true, email: string } on success
 * Returns { valid: false } on failure
 */
export function verifyOTP(token: string, code: string): { valid: boolean; email?: string } {
  const key = getOTPKey(token, code);
  const entry = otpStore[key];

  if (!entry) {
    return { valid: false };
  }

  // Check expiration
  if (Date.now() > entry.expiresAt) {
    delete otpStore[key];
    return { valid: false };
  }

  // Check attempts
  entry.attempts++;
  if (entry.attempts > MAX_ATTEMPTS) {
    delete otpStore[key];
    return { valid: false };
  }

  // Valid OTP - delete and return email
  const email = entry.email;
  delete otpStore[key];

  return { valid: true, email };
}

/**
 * Get remaining attempts for a token/code combination
 * Returns null if OTP doesn't exist
 */
export function getRemainingAttempts(token: string, code: string): number | null {
  const key = getOTPKey(token, code);
  const entry = otpStore[key];

  if (!entry) {
    return null;
  }

  // Check expiration
  if (Date.now() > entry.expiresAt) {
    delete otpStore[key];
    return null;
  }

  return Math.max(0, MAX_ATTEMPTS - entry.attempts);
}

/**
 * Clean up expired OTPs
 */
export function cleanupExpiredOTPs(): void {
  const now = Date.now();
  const expiredKeys: string[] = [];

  for (const [key, entry] of Object.entries(otpStore)) {
    if (now > entry.expiresAt) {
      expiredKeys.push(key);
    }
  }

  expiredKeys.forEach((key) => {
    delete otpStore[key];
  });
}

/**
 * Clear all OTPs (for testing)
 */
export function clearAllOTPs(): void {
  Object.keys(otpStore).forEach((key) => {
    delete otpStore[key];
  });
}
