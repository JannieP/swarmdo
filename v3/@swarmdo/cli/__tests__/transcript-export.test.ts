import { describe, it, expect } from 'vitest';
import {
  cleanUserText,
  contentToText,
  renderTranscriptMarkdown,
  sessionIdFromFile,
  type RawTranscriptLine,
} from '../src/transcript/export.ts';

const userStr = (text: string): RawTranscriptLine => ({ type: 'user', message: { role: 'user', content: text } });
const asst = (content: unknown): RawTranscriptLine => ({ type: 'assistant', message: { role: 'assistant', content } });
const userBlocks = (content: unknown): RawTranscriptLine => ({ type: 'user', message: { role: 'user', content } });

describe('transcript-export: cleanUserText', () => {
  it('strips system-reminder blocks but keeps the rest', () => {
    expect(cleanUserText('hello <system-reminder>noise\nmore</system-reminder> world')).toBe('hello  world');
  });
  it('keeps slash-command wrappers (useful context)', () => {
    expect(cleanUserText('<command-name>/loop</command-name>')).toBe('<command-name>/loop</command-name>');
  });
});

describe('transcript-export: contentToText', () => {
  it('handles strings and text-block arrays', () => {
    expect(contentToText('hi')).toBe('hi');
    expect(contentToText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a b');
    expect(contentToText(null)).toBe('');
  });
});

describe('transcript-export: sessionIdFromFile', () => {
  it('strips dir and .jsonl', () => {
    expect(sessionIdFromFile('/x/y/abc-123.jsonl')).toBe('abc-123');
  });
});

describe('transcript-export: renderTranscriptMarkdown', () => {
  it('renders user and assistant turns with headings', () => {
    const md = renderTranscriptMarkdown([userStr('Do the thing'), asst('Done.')]);
    expect(md).toContain('### 👤 User');
    expect(md).toContain('Do the thing');
    expect(md).toContain('### 🤖 Assistant');
    expect(md).toContain('Done.');
  });

  it('skips non-conversational line types', () => {
    const md = renderTranscriptMarkdown([
      { type: 'mode', message: { role: 'user', content: 'x' } },
      { type: 'attachment', message: { role: 'user', content: 'y' } },
      userStr('real'),
    ]);
    expect(md).not.toContain('x');
    expect(md).not.toContain('y');
    expect(md).toContain('real');
  });

  it('renders tool_use with name and input when tools enabled', () => {
    const md = renderTranscriptMarkdown([asst([{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }])]);
    expect(md).toContain('🔧 **Bash**');
    expect(md).toContain('"command": "ls"');
  });

  it('renders tool_result with success/error icons', () => {
    const ok = renderTranscriptMarkdown([userBlocks([{ type: 'tool_result', is_error: false, content: 'output here' }])]);
    expect(ok).toContain('✅');
    expect(ok).toContain('output here');
    const bad = renderTranscriptMarkdown([userBlocks([{ type: 'tool_result', is_error: true, content: 'boom' }])]);
    expect(bad).toContain('❌');
  });

  it('a pure tool_result user line gets no User heading', () => {
    const md = renderTranscriptMarkdown([userBlocks([{ type: 'tool_result', is_error: false, content: 'x' }])]);
    expect(md).not.toContain('### 👤 User');
    expect(md).toContain('✅');
  });

  it('omits tool blocks when tools:false', () => {
    const md = renderTranscriptMarkdown([asst([{ type: 'text', text: 'hi' }, { type: 'tool_use', name: 'Bash', input: {} }])], { tools: false });
    expect(md).toContain('hi');
    expect(md).not.toContain('Bash');
  });

  it('includes thinking only when thinking:true', () => {
    const line = asst([{ type: 'thinking', thinking: 'secret reasoning' }, { type: 'text', text: 'answer' }]);
    expect(renderTranscriptMarkdown([line])).not.toContain('secret reasoning');
    expect(renderTranscriptMarkdown([line], { thinking: true })).toContain('secret reasoning');
  });

  it('truncates long tool output to maxToolChars', () => {
    const big = 'y'.repeat(2000);
    const md = renderTranscriptMarkdown([userBlocks([{ type: 'tool_result', content: big }])], { maxToolChars: 50 });
    expect(md).toContain('+1950 chars');
    expect(md).not.toContain('y'.repeat(60));
  });

  it('strips system-reminders from user turns', () => {
    const md = renderTranscriptMarkdown([userStr('ask <system-reminder>huge injected noise</system-reminder> end')]);
    expect(md).toContain('ask');
    expect(md).toContain('end');
    expect(md).not.toContain('injected noise');
  });

  it('returns empty string for a transcript with no conversational lines', () => {
    expect(renderTranscriptMarkdown([{ type: 'system' }, { type: 'ai-title' }])).toBe('');
  });
});
