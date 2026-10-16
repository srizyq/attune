// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import WeightPlanCard from './WeightPlanCard';

afterEach(cleanup);
const s = (over = {}) => ({ goal: 'lose', pace_kg_per_week: 0.5, weight_rate_kg_week: -0.45, weigh_ins_28d: 12, ...over });

describe('WeightPlanCard', () => {
  it('shows the actual rate against the plan, with a status', () => {
    render(<WeightPlanCard summary={s()} />);
    expect(screen.getByTestId('weight-plan-rate')).toHaveTextContent('−0.45 kg/week against a plan of −0.5');
    expect(screen.getByTestId('weight-plan-status')).toHaveTextContent('On plan');
    expect(screen.getByText(/Based on 12 weigh-ins over the last 28 days/)).toBeInTheDocument();
  });

  it('calls out a client whose weight is not moving — the case a two-week change misses', () => {
    render(<WeightPlanCard summary={s({ weight_rate_kg_week: -0.02 })} />);
    expect(screen.getByTestId('weight-plan-status')).toHaveTextContent('Not moving');
    expect(screen.getByText(/look at logged intake first/i)).toBeInTheDocument();
  });

  it('says the same for each status the list can flag', () => {
    for (const [rate, label] of [[0.3, 'Moving the wrong way'], [-0.2, 'Slower than planned'], [-0.9, 'Faster than planned']]) {
      render(<WeightPlanCard summary={s({ weight_rate_kg_week: rate })} />);
      expect(screen.getByTestId('weight-plan-status')).toHaveTextContent(label);
      cleanup();
    }
  });

  it('explains what is needed when there is not enough to judge', () => {
    render(<WeightPlanCard summary={s({ weight_rate_kg_week: null, weigh_ins_28d: 2 })} />);
    expect(screen.getByTestId('weight-plan-empty')).toHaveTextContent('needs 4 or more spread over at least 10 days (2 in the last 28)');
    cleanup();
    render(<WeightPlanCard summary={s({ goal: null, weight_rate_kg_week: null })} />);
    expect(screen.getByTestId('weight-plan-empty')).toHaveTextContent('Set a goal');
  });

  it('renders nothing before the database update (the summary has no rate column at all)', () => {
    const { container } = render(<WeightPlanCard summary={{ goal: 'lose', calorie_target: 2000 }} />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    expect(render(<WeightPlanCard summary={undefined} />).container).toBeEmptyDOMElement();
  });
});
