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
  
  // If content doesn't contain actual HTML tags, return as-is
  // This preserves legacy plain text like "Replace <filter> monthly" or "L1 < L2"
  if (!containsHtmlTags(html)) {
    return html;
  }
  
  let text = html;
  
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
