/**
 * JSON parsing that tolerates bare control characters inside string literals.
 *
 * Make's HTTP modules build callback bodies by interpolating LLM-generated copy
 * into a raw JSON template. Multiline text (YouTube descriptions, show notes)
 * arrives as literal newlines inside string values, which strict JSON rejects
 * with "Bad control character in string literal". Outside string literals,
 * control characters are legal whitespace and must be left untouched.
 */
export function parseJsonLenient(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(escapeControlCharsInStrings(raw));
  }
}

const ESCAPES: Record<string, string> = {
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

/**
 * Walk the document tracking whether we're inside a string literal; escape any
 * bare control character found there. Already-escaped sequences (\\n, \\", …)
 * pass through unchanged.
 */
export function escapeControlCharsInStrings(raw: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of raw) {
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inString = false;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      out += ESCAPES[ch] ?? '\\u' + code.toString(16).padStart(4, '0');
      continue;
    }
    out += ch;
  }
  return out;
}
