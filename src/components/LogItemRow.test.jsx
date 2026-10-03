// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import LogItemRow from './LogItemRow';

afterEach(cleanup);

const item = (over) => ({
  id: 'i1', name: 'Chocolate', brand: null, meal: 'dinner', cal: 222, protein: 4, carbs: 33.4, fat: 7.2,
  servingGrams: 50, source: 'log', ...over,
});

function swipeLeft(el, distance = 60) {
  fireEvent.pointerDown(el, { clientX: 200 });
  fireEvent.pointerMove(el, { clientX: 200 - distance });
  fireEvent.pointerUp(el, { clientX: 200 - distance });
}

describe('LogItemRow swipe-to-delete', () => {
  it('swiping the collapsed row open then tapping Delete calls onDelete', () => {
    const onDelete = vi.fn();
    render(<LogItemRow item={item()} isExpanded={false} onToggle={vi.fn()} onDelete={onDelete} onSave={vi.fn()} />);
    swipeLeft(screen.getByText('Chocolate'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('a plain tap still opens the edit sheet (onToggle), not a delete', () => {
    const onToggle = vi.fn();
    render(<LogItemRow item={item()} isExpanded={false} onToggle={onToggle} onDelete={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText('Chocolate'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('read-only (coach viewing a client) has no Delete action and no swipe', () => {
    const onToggle = vi.fn();
    render(<LogItemRow item={item()} isExpanded={false} onToggle={onToggle} readOnly />);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    swipeLeft(screen.getByText('Chocolate'));
    fireEvent.click(screen.getByText('Chocolate'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
