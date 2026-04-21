/**
 * Input sanitization utilities.
 *
 * Strips HTML-like patterns and control characters from user-supplied text.
 * Does NOT decode HTML entities — entity decoding belongs in the rendering
 * layer (React auto-escapes ${value} in JSX; email templates must use
 * escapeHtml when interpolating into raw HTML).
 *
 * Defense-in-depth layering:
 *   1. sanitizeInput  — strip at API entry; prevents tag/control-char storage.
 *   2. React ${value} — auto-escapes on JSX render.
 *   3. escapeHtml     — required when embedding into raw HTML (email bodies).
 */

const TAG_RE = /<[^>]*>/g;
const PARTIAL_TAG_RE = /<[a-zA-Z][^>]*/g;
// Keep \n (\x0A), \r (\x0D), \t (\x09); strip other C0 and DEL.
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const ZERO_WIDTH_RE = /[\u200B-\u200F\uFEFF]/g;

/**
 * Strip HTML-like patterns and control characters from a user-supplied string.
 * Entity-preserving: a literal "&lt;" stays "&lt;" — it is the render layer's
 * job to escape or interpret entities appropriately.
 */
export function sanitizeInput(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .replace(TAG_RE, "")
    .replace(PARTIAL_TAG_RE, "")
    .replace(CONTROL_CHAR_RE, "")
    .replace(ZERO_WIDTH_RE, "")
    .trim();
}

/**
 * Escape the five HTML-significant characters. Use ONLY when embedding a
 * string into a raw HTML context (e.g., email bodies). Do NOT use on values
 * rendered by React — React escapes them automatically, and double-escaping
 * would display "&amp;lt;" instead of "<".
 */
export function escapeHtml(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
