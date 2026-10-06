// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MilestonePrompt from './MilestonePrompt';
import { pendingMilestone } from '../../lib/communityMilestones';

describe('pendingMilestone', () => {
  it('picks the biggest reached milestone not yet done', () => {
    expect(pendingMilestone(3, () => false)).toBeNull();
    expect(pendingMilestone(7, () => false)).toBe(7);
    expect(pendingMilestone(45, () => false)).toBe(30);
    expect(pendingMilestone(45, (n) => n === 30)).toBe(7);
    expect(pendingMilestone(200, () => false)).toBe(100);
    expect(pendingMilestone(200, () => true)).toBeNull();
  });
});

describe('<MilestonePrompt />', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);
  it('offers a share, calls back once, and stays away afterwards', () => {
    const onShare = vi.fn();
    const { rerender } = render(<MilestonePrompt streak={8} onShare={onShare} />);
    expect(screen.getByText('7 days in a row')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(onShare).toHaveBeenCalledWith(7);
    rerender(<MilestonePrompt streak={8} onShare={onShare} />);
    expect(screen.queryByText('7 days in a row')).toBeNull();
  });
  it('can be dismissed without sharing, and shows nothing under 7 days', () => {
    const onShare = vi.fn();
    const { container } = render(<MilestonePrompt streak={7} onShare={onShare} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onShare).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
    const small = render(<MilestonePrompt streak={3} onShare={onShare} />);
    expect(small.container.textContent).toBe('');
  });
});
