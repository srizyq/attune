// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SwipeToDelete from './SwipeToDelete';

afterEach(cleanup);

function swipeLeft(el, distance) {
  fireEvent.pointerDown(el, { clientX: 200 });
  fireEvent.pointerMove(el, { clientX: 200 - distance });
  fireEvent.pointerUp(el, { clientX: 200 - distance });
}

describe('SwipeToDelete', () => {
  it('renders the row and a hidden Delete action', () => {
    render(<SwipeToDelete onDelete={vi.fn()}><div>Chocolate</div></SwipeToDelete>);
    expect(screen.getByText('Chocolate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('a tap too small to count as a drag still reaches the row\'s own onClick', () => {
    const onRowClick = vi.fn();
    render(
      <SwipeToDelete onDelete={vi.fn()}>
        <div onClick={onRowClick}>Chocolate</div>
      </SwipeToDelete>
    );
    const row = screen.getByText('Chocolate');
    fireEvent.pointerDown(row, { clientX: 200 });
    fireEvent.pointerUp(row, { clientX: 200 });
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('a real swipe left snaps open and swallows the trailing click instead of firing the row\'s onClick', () => {
    const onRowClick = vi.fn();
    render(
      <SwipeToDelete onDelete={vi.fn()}>
        <div onClick={onRowClick}>Chocolate</div>
      </SwipeToDelete>
    );
    const row = screen.getByText('Chocolate');
    swipeLeft(row, 60); // past the commit threshold
    fireEvent.click(row); // the synthetic click a real drag's pointerup leaves behind
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('tapping the row again while open closes it instead of firing onClick', () => {
    const onRowClick = vi.fn();
    render(
      <SwipeToDelete onDelete={vi.fn()}>
        <div onClick={onRowClick}>Chocolate</div>
      </SwipeToDelete>
    );
    const row = screen.getByText('Chocolate');
    swipeLeft(row, 60);
    fireEvent.click(row); // consumes the drag's own trailing click, as above

    fireEvent.click(row); // a fresh, deliberate tap while still open
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('a swipe that falls short of the commit threshold springs back without deleting', () => {
    const onDelete = vi.fn();
    render(<SwipeToDelete onDelete={onDelete}><div>Chocolate</div></SwipeToDelete>);
    swipeLeft(screen.getByText('Chocolate'), 10);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('tapping the revealed Delete button deletes', () => {
    const onDelete = vi.fn();
    render(<SwipeToDelete onDelete={onDelete}><div>Chocolate</div></SwipeToDelete>);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('disabled renders the row plain, with no Delete action and no swipe', () => {
    const onDelete = vi.fn();
    const onRowClick = vi.fn();
    render(
      <SwipeToDelete onDelete={onDelete} disabled>
        <div onClick={onRowClick}>Chocolate</div>
      </SwipeToDelete>
    );
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    swipeLeft(screen.getByText('Chocolate'), 60);
    fireEvent.click(screen.getByText('Chocolate'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});
