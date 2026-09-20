// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ProvenanceBadge from './ProvenanceBadge';

afterEach(cleanup);
describe('ProvenanceBadge', () => {
  it.each([
    ['ausnut', 'Verified'], ['fatsecret', 'Database'], ['off', 'Community'], ['photo', 'AI estimate'],
    ['custom', 'Custom'], ['recipe', 'Recipe'], [null, 'Unspecified'], ['something-new', 'Unspecified'],
  ])('labels %s as %s', (source, label) => {
    render(<ProvenanceBadge source={source} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
  it('explains itself on hover', () => {
    render(<ProvenanceBadge source="photo" />);
    expect(screen.getByText('AI estimate')).toHaveAttribute('title', expect.stringContaining('approximate'));
  });
});
