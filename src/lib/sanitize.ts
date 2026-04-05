/**
 * Input sanitization utilities
 * Strips HTML tags and cleans user input to prevent XSS attacks
 */

/**
 * Sanitize a single string by removing HTML tags and trimming whitespace
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, "");

  // Decode HTML entities that might be used to bypass tag removal
  sanitized = sanitized
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

  // Remove any remaining HTML tags after entity decoding
  sanitized = sanitized.replace(/<[^>]*>/g, "");

  // Trim whitespace
  return sanitized.trim();
}

/**
 * Recursively sanitize all string values in an object
 */
export function sanitizeObject(
  obj: Record<string, unknown>
): Record<string, unknown> {
  if (!obj || typeof obj !== "object") {
    return obj as Record<string, unknown>;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizeInput(value);
    } else if (value !== null && typeof value === "object") {
      if (Array.isArray(value)) {
        sanitized[key] = value.map((item) =>
          typeof item === "string" ? sanitizeInput(item) : item
        );
      } else {
        sanitized[key] = sanitizeObject(value as Record<string, unknown>);
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
