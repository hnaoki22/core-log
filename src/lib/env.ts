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
