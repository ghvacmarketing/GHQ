import DOMPurify from "dompurify";

/**
 * HTML-escape special characters to prevent corruption
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Detect if content contains actual HTML tags (not just angle brackets)
 * This distinguishes between "Inspect <strong>filter</strong>" (HTML)
 * and "Replace <filter> monthly" or "L1 < L2" (plain text with angle brackets)
 */
function containsHtmlTags(content: string): boolean {
  // Common HTML tags that would be in rich text content
  const htmlTagPattern = /<(p|div|span|strong|em|b|i|u|a|br|h[1-6]|ul|ol|li|blockquote|code|pre|img|table|tr|td|th)(\s|>|\/)/i;
  return htmlTagPattern.test(content);
}

/**
 * Convert markdown/plain text to HTML for backward compatibility with Tiptap
 * This handles legacy process descriptions that were stored as plain text or markdown
 */
export function convertToHtml(content: string): string {
  if (!content) return '';
  
  // If content contains actual HTML tags (not just angle brackets), return as-is
  // This preserves legacy content with inline HTML like "Inspect <strong>filter</strong> monthly"
  // while still escaping plain text like "Replace <filter> monthly" or "L1 < L2"
  if (containsHtmlTags(content)) {
    return content;
  }
  
  // Convert plain text/markdown to HTML
  let html = content;
  
  // Convert markdown links [text](url) to HTML <a> tags BEFORE escaping
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    return `<a href="${escapeHtml(url)}">${escapeHtml(linkText)}</a>`;
  });
  
  // Convert plain URLs to clickable links BEFORE escaping
  html = html.replace(
    /(?<![">])(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`
  );
  
  // Escape HTML characters in the remaining text (preserve <a> tags)
  const parts = html.split(/(<a[^>]*>.*?<\/a>)/g);
  html = parts.map((part, index) => {
    // Keep link tags as-is (odd indices)
    if (index % 2 === 1) return part;
    // Escape everything else (even indices)
    return escapeHtml(part);
  }).join('');
  
  // Convert newlines to <br> or wrap in <p> tags
  const paragraphs = html.split('\n\n').filter(p => p.trim());
  if (paragraphs.length > 1) {
    html = paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  } else {
    html = `<p>${html.replace(/\n/g, '<br>')}</p>`;
  }
  
  return html;
}

/**
 * Strip HTML tags from content for plain text export (e.g., PDF generation)
 * Preserves paragraph breaks, list structure, and link URLs
 * Handles both HTML content and legacy plain text with angle brackets
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  
  let text = html;
  
  // If content doesn't contain actual HTML tags, handle markdown links in plain text
  // This converts [text](url) to "text (url)" for legacy plain text content
  if (!containsHtmlTags(html)) {
    // Convert markdown links to readable format
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
      return `${linkText} (${url})`;
    });
    return text;
  }
  
  // Extract and preserve link URLs BEFORE removing tags
  // Convert <a href="url">text</a> to "text (url)"
  text = text.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis, (match, url, linkText) => {
    // Normalize whitespace in link text (collapse internal newlines/spaces)
    const normalizedText = linkText.replace(/\s+/g, ' ').trim();
    
    // If link text is the same as URL, just keep the text (avoid duplication)
    if (normalizedText === url.trim()) {
      return normalizedText;
    }
    // Otherwise append URL in parentheses
    return `${normalizedText} (${url})`;
  });
  
  // Replace structural tags with newlines BEFORE removing tags
  text = text.replace(/<\/p>/gi, '\n\n'); // Paragraph breaks
  text = text.replace(/<br\s*\/?>/gi, '\n'); // Line breaks
  text = text.replace(/<\/li>/gi, '\n'); // List items
  text = text.replace(/<\/h[1-6]>/gi, '\n\n'); // Headings
  text = text.replace(/<li>/gi, '• '); // List item bullets
  
  // Remove remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up excessive newlines (max 2 consecutive)
  text = text.replace(/\n{3,}/g, '\n\n');
  
  // Clean up extra spaces but preserve newlines
  text = text.split('\n').map(line => line.trim()).join('\n');
  
  return text.trim();
}

/**
 * Render sanitized HTML for preview contexts (e.g., card lists)
 * Keeps only safe formatting tags (p, strong, em, a) and removes images, headings, lists
 * Converts markdown links to HTML if needed for backward compatibility
 */
export function renderPreviewHtml(content: string): string {
  if (!content) return '';
  
  let html = content;
  
  // If content doesn't contain HTML tags, convert markdown to HTML first
  if (!containsHtmlTags(content)) {
    html = convertToHtml(content);
  }
  
  // Remove unsafe/complex tags but keep basic formatting
  // Remove images
  html = html.replace(/<img[^>]*>/gi, '');
  
  // Remove headings but keep content (convert to spans for inline display)
  html = html.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '<span class="font-semibold">$1</span>');
  
  // Remove lists but keep content (convert to inline with bullets)
  html = html.replace(/<ul[^>]*>(.*?)<\/ul>/gis, '$1');
  html = html.replace(/<ol[^>]*>(.*?)<\/ol>/gis, '$1');
  html = html.replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1 ');
  
  // Remove block elements that might cause layout issues
  html = html.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, '$1');
  html = html.replace(/<pre[^>]*>(.*?)<\/pre>/gis, '$1');
  html = html.replace(/<code[^>]*>(.*?)<\/code>/gi, '$1');
  
  // Remove divs but keep content
  html = html.replace(/<div[^>]*>/gi, '');
  html = html.replace(/<\/div>/gi, ' ');
  
  // Collapse multiple spaces and line breaks
  html = html.replace(/\s+/g, ' ');
  html = html.replace(/<br\s*\/?>/gi, ' ');
  
  // Clean up paragraph spacing for inline preview
  html = html.replace(/<\/p>\s*<p[^>]*>/gi, ' ');
  
  // Ensure links open in new tab and have proper styling
  html = html.replace(/<a\s+/gi, '<a target="_blank" rel="noopener noreferrer" class="text-primary hover:underline" ');

  // Final defense: regex tag-stripping above is not a real sanitizer (it leaves
  // event-handler attributes on allowed tags), so run the result through DOMPurify.
  return DOMPurify.sanitize(html.trim(), {
    ALLOWED_TAGS: ["p", "span", "strong", "em", "b", "i", "u", "a", "br"],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
  });
}
