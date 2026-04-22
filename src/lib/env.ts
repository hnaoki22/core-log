/**
 * Environment variable validation and helpers
 */

const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
];

const OPTIONAL_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "ADMIN_TOKENS",
];

/**
 * Validate all required and optional environment variables
 * Logs errors for missing required vars, warnings for missing optional vars
 */
export function validateEnv(): void {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missingRequired.push(varName);
    }
  }

  for (const varName of OPTIONAL_ENV_VARS) {
    if (!process.env[varName]) {
      missingOptional.push(varName);
    }
  }

  if (missingRequired.length > 0) {
    console.error(
      `[ENV ERROR] Missing required environment variables: ${missingRequired.join(", ")}`
    );
  }

  if (missingOptional.length > 0) {
    console.warn(
      `[ENV WARNING] Missing optional environment variables: ${missingOptional.join(", ")}`
    );
  }
}

/**
 * Get a required environment variable
 * Throws an error if the variable is not set
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable not set: ${name}`);
  }
  return value;
}

/**
 * Whether this build is running as a real production deployment.
 * Used to gate mock-data fallbacks and hardcoded admin tokens — those are
 * development conveniences that must NEVER run against production traffic.
 *
 * We treat NEXT_PUBLIC_ENV_NAME=preview (Vercel preview deployments) as
 * non-production so test fixtures still work on preview URLs. Any other
 * NODE_ENV=production build is locked down.
 */
export function isProductionMode(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  // Explicit non-prod marker from Vercel env: preview, development
  const envName = process.env.NEXT_PUBLIC_ENV_NAME;
  if (envName === "preview" || envName === "development") return false;
  return true;
}

/**
 * Whether the mock-data backend fallback is permitted. Disabled in production
 * to prevent development fixtures from leaking into real tenants.
 */
export function isMockFallbackEnabled(): boolean {
  return !isProductionMode();
}
