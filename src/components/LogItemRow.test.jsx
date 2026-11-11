// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import LogItemRow from './LogItemRow';

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div>; }
const renderRow = (props) => render(<MemoryRouter><Routes><Route path="*" element={<><LogItemRow {...props} /><Where /></>} /></Routes></MemoryRouter>);

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
    renderRow({ item: item(), onDelete });
    swipeLeft(screen.getByText('Chocolate'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('a plain tap opens the edit page for that entry, not a delete', () => {
    const onDelete = vi.fn();
    renderRow({ item: item({ loggedDate: '2026-11-10' }), onDelete });
    fireEvent.click(screen.getByText('Chocolate'));
    expect(screen.getByTestId('where')).toHaveTextContent('/log/item/i1?date=2026-11-10');
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('read-only (coach viewing a client) has no Delete action, no swipe, and opens a detail sheet', () => {
    renderRow({ item: item(), readOnly: true });
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    swipeLeft(screen.getByText('Chocolate'));
    fireEvent.click(screen.getByText('Chocolate'));
    // opens the read-only detail sheet, stays on the same page
    expect(screen.getByRole('dialog', { name: 'Chocolate' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/');
  });
});
