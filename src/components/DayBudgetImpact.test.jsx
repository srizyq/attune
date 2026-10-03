// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import DayBudgetImpact from './DayBudgetImpact';

afterEach(cleanup);

describe('DayBudgetImpact', () => {
  it('shows what is left before and after, with no overage bar, while under target', () => {
    render(<DayBudgetImpact target={2700} consumed={1000} adding={500} />);
    expect(screen.getByText(/1,700 kcal left/)).toBeInTheDocument();
    expect(screen.getByText(/1,200 kcal left/)).toBeInTheDocument();
    expect(screen.queryByTestId('budget-over')).toBeNull();
    expect(screen.getByText('Total: 1,500 kcal')).toBeInTheDocument();
  });

  it('shows the overage as a pill and as a red segment starting at the target tick', () => {
    render(<DayBudgetImpact target={2700} consumed={2343} adding={700} />);
    expect(screen.getByText(/357 kcal left/)).toBeInTheDocument();
    expect(screen.getByText('343 kcal over')).toBeInTheDocument();
    const over = screen.getByTestId('budget-over');
    // target / total = 2700 / 3043 of the way along
    expect(parseFloat(over.style.left)).toBeCloseTo((2700 / 3043) * 100, 1);
    expect(over.style.right).toBe('0px');
    expect(screen.getByText('Total: 3,043 kcal')).toBeInTheDocument();
  });

  it('is already over before anything is added when today is past target', () => {
    render(<DayBudgetImpact target={2000} consumed={2200} adding={0} />);
    expect(screen.getAllByText(/kcal over/).length).toBeGreaterThan(0);
  });

  it('renders nothing without a target', () => {
    const { container } = render(<DayBudgetImpact target={0} consumed={100} adding={50} />);
    expect(container).toBeEmptyDOMElement();
  });
});
