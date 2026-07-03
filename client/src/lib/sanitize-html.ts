import DOMPurify from "dompurify";

/**
 * Sanitize an untrusted HTML string before rendering it with
 * dangerouslySetInnerHTML. Strips <script>, event handlers, javascript: URLs,
 * and other XSS vectors while preserving basic rich-text/email markup.
 *
 * Use this for ANY HTML that originates outside our own code: rich-text
 * descriptions authored by staff, and especially inbound email HTML
 * (log.htmlContent), which is fully attacker-controlled.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    // Drop unknown/dangerous tags entirely rather than escaping them.
    USE_PROFILES: { html: true },
    // Forbid script-bearing and framing tags outright.
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });
}
