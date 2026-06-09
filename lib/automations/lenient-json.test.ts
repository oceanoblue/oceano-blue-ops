import { describe, it, expect } from 'vitest';
import { parseJsonLenient, escapeControlCharsInStrings } from './lenient-json';

describe('parseJsonLenient', () => {
  it('parses clean JSON unchanged', () => {
    expect(parseJsonLenient('{"a": 1, "b": "two"}')).toEqual({ a: 1, b: 'two' });
  });

  it('recovers a value with a bare newline (the Make copy.generated case)', () => {
    const raw = '{"event": "copy.generated", "output": {"youtube_description": "Line one\nLine two\n\nLine four"}}';
    expect(() => JSON.parse(raw)).toThrow();
    expect(parseJsonLenient(raw)).toEqual({
      event: 'copy.generated',
      output: { youtube_description: 'Line one\nLine two\n\nLine four' },
    });
  });

  it('preserves structural whitespace in pretty-printed JSON', () => {
    const raw = '{\n  "title": "Hi there",\n  "n": 3\n}';
    expect(parseJsonLenient(raw)).toEqual({ title: 'Hi there', n: 3 });
  });

  it('handles pretty-printed JSON whose values ALSO contain bare newlines', () => {
    const raw = '{\n  "notes": "first\nsecond",\n  "tags": ["a", "b"]\n}';
    expect(parseJsonLenient(raw)).toEqual({ notes: 'first\nsecond', tags: ['a', 'b'] });
  });

  it('handles tabs and carriage returns inside values', () => {
    const raw = '{"v": "col1\tcol2\r\nrow2"}';
    expect(parseJsonLenient(raw)).toEqual({ v: 'col1\tcol2\r\nrow2' });
  });

  it('leaves already-escaped sequences and escaped quotes intact', () => {
    const raw = '{"v": "say \\"hi\\"\\nnewline stays escaped"}';
    expect(parseJsonLenient(raw)).toEqual({ v: 'say "hi"\nnewline stays escaped' });
  });

  it('mixed: escaped backslash right before a bare newline', () => {
    const raw = '{"v": "path C:\\\\dir\nnext"}';
    expect(parseJsonLenient(raw)).toEqual({ v: 'path C:\\dir\nnext' });
  });

  it('escapes other control characters as \\uXXXX', () => {
    const ctrl = String.fromCharCode(1);
    const raw = `{"v": "a${ctrl}b"}`;
    expect(parseJsonLenient(raw)).toEqual({ v: `a${ctrl}b` });
  });

  it('still throws on structurally invalid JSON', () => {
    expect(() => parseJsonLenient('{"unclosed": ')).toThrow();
    expect(() => parseJsonLenient('not json at all')).toThrow();
  });
});

describe('escapeControlCharsInStrings', () => {
  it('only touches characters inside string literals', () => {
    const raw = '{\n"a": "x\ny"\n}';
    expect(escapeControlCharsInStrings(raw)).toBe('{\n"a": "x\\ny"\n}');
  });
});
