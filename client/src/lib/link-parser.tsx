/**
 * Parses text containing URLs and markdown-style links into React elements
 * Supports:
 * - Plain URLs: https://example.com
 * - Markdown links: [keyword](https://example.com)
 * 
 * Security: Only allows http:// and https:// protocols to prevent XSS attacks
 */

export type LinkPart = {
  type: 'text' | 'url' | 'markdown-link';
  content: string;
  url?: string;
  displayText?: string;
};

/**
 * Sanitizes a URL to prevent XSS attacks
 * Only allows http:// and https:// protocols
 * Returns sanitized URL or null if unsafe
 */
function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  // Trim whitespace
  url = url.trim();
  
  // Check if URL starts with allowed protocols (case-insensitive)
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://')) {
    return url;
  }
  
  // Block all other protocols including javascript:, data:, file:, etc.
  return null;
}

/**
 * Parses text and returns an array of parts (text, urls, markdown links)
 */
export function parseLinks(text: string): LinkPart[] {
  if (!text) return [];

  const parts: LinkPart[] = [];
  let currentIndex = 0;

  // Combined regex to match both markdown links and plain URLs
  // Markdown: [text](url) - matches first
  // Plain URL: http(s)://...
  const combinedRegex = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s<>(){}[\]]+)/g;

  let match;
  while ((match = combinedRegex.exec(text)) !== null) {
    const matchStart = match.index;
    
    // Add any text before this match
    if (matchStart > currentIndex) {
      const textBefore = text.slice(currentIndex, matchStart);
      if (textBefore) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    // Check if it's a markdown link [text](url)
    if (match[1] && match[2]) {
      const sanitizedUrl = sanitizeUrl(match[2]);
      if (sanitizedUrl) {
        parts.push({
          type: 'markdown-link',
          content: match[0],
          displayText: match[1],
          url: sanitizedUrl,
        });
      } else {
        // If URL is unsafe, render as plain text
        parts.push({ type: 'text', content: match[0] });
      }
    } 
    // Otherwise it's a plain URL
    else if (match[3]) {
      const sanitizedUrl = sanitizeUrl(match[3]);
      if (sanitizedUrl) {
        parts.push({
          type: 'url',
          content: match[3],
          url: sanitizedUrl,
        });
      } else {
        // If URL is unsafe, render as plain text
        parts.push({ type: 'text', content: match[3] });
      }
    }

    currentIndex = match.index + match[0].length;
  }

  // Add any remaining text after the last match
  if (currentIndex < text.length) {
    const textAfter = text.slice(currentIndex);
    if (textAfter) {
      parts.push({ type: 'text', content: textAfter });
    }
  }

  // If no matches found, return the whole text as a single part
  if (parts.length === 0) {
    parts.push({ type: 'text', content: text });
  }

  return parts;
}

/**
 * Renders parsed text with clickable links
 */
export function renderParsedLinks(parts: LinkPart[]): JSX.Element {
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'markdown-link') {
          return (
            <a
              key={index}
              href={part.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline hover:underline-offset-2 break-words"
              onClick={(e) => e.stopPropagation()}
              data-testid={`link-markdown-${index}`}
            >
              {part.displayText}
            </a>
          );
        } else if (part.type === 'url') {
          return (
            <a
              key={index}
              href={part.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline hover:underline-offset-2 break-all"
              onClick={(e) => e.stopPropagation()}
              data-testid={`link-plain-${index}`}
            >
              {part.content}
            </a>
          );
        } else {
          return <span key={index} className="break-words">{part.content}</span>;
        }
      })}
    </>
  );
}

/**
 * Main function to parse and render text with links
 */
export function renderTextWithLinks(text: string): JSX.Element {
  const parts = parseLinks(text);
  return renderParsedLinks(parts);
}
