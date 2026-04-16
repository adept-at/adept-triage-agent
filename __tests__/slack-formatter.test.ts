import { truncateForSlack, formatSummaryForSlack } from '../src/utils/slack-formatter';

describe('Slack Formatter', () => {
  describe('truncateForSlack', () => {
    it('should not truncate text under the limit', () => {
      const text = 'Short text';
      expect(truncateForSlack(text)).toBe(text);
    });

    it('should truncate long text and add notice', () => {
      const text = 'a'.repeat(3000);
      const result = truncateForSlack(text);
      expect(result.length).toBeLessThan(3000);
      expect(result).toContain('[Output truncated for Slack');
    });

    it('should break at paragraph boundaries when possible', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\n' + 'a'.repeat(2900);
      const result = truncateForSlack(text);
      expect(result).toContain('First paragraph');
      expect(result).toContain('Second paragraph');
      expect(result).toContain('[Output truncated for Slack');
    });

    it('should break at sentence boundaries when no paragraphs', () => {
      const text = 'First sentence. Second sentence. ' + 'a'.repeat(2900);
      const result = truncateForSlack(text);
      expect(result).toContain('First sentence. Second sentence.');
      expect(result).toContain('[Output truncated for Slack');
    });

    it('should respect custom max length', () => {
      const text = 'a'.repeat(1000);
      const result = truncateForSlack(text, 500);
      expect(result.length).toBeLessThan(600); // 500 + room for truncation message
    });
  });

  describe('formatSummaryForSlack', () => {
    it('should remove code blocks when includeCodeBlocks is false', () => {
      const summary = 'Text before\n```typescript\nconst code = true;\n```\nText after';
      const result = formatSummaryForSlack(summary, false);
      expect(result).not.toContain('```');
      expect(result).toContain('[Code block removed for brevity]');
      expect(result).toContain('Text before');
      expect(result).toContain('Text after');
    });

    it('should keep code blocks when includeCodeBlocks is true', () => {
      const summary = 'Text before\n```typescript\nconst code = true;\n```\nText after';
      const result = formatSummaryForSlack(summary, true);
      expect(result).toContain('```');
      expect(result).toContain('const code = true;');
    });

    it('should handle multiple code blocks', () => {
      const summary = '```js\ncode1\n```\nMiddle\n```js\ncode2\n```';
      const result = formatSummaryForSlack(summary, false);
      expect(result).not.toContain('```');
      expect(result).toContain('Middle');
      expect(result.match(/\[Code block removed for brevity\]/g)?.length).toBe(2);
    });

    it('should truncate even after removing code blocks', () => {
      const summary = 'Start\n```\n' + 'x'.repeat(1000) + '\n```\n' + 'y'.repeat(3000);
      const result = formatSummaryForSlack(summary, false);
      expect(result.length).toBeLessThan(3000);
      expect(result).toContain('[Output truncated for Slack');
    });
  });

});
