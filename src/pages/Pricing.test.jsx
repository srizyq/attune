// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', is_anonymous: false } }) }));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ profile: state.profile, loading: false, refetch: vi.fn() }) }));
vi.mock('../lib/billing', () => ({ authedPost: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    // app_settings.payments_frozen — defaults to unfrozen so the existing
    // behaviour tests don't each need to know about the freeze switch.
    from: vi.fn(() => ({ select: () => ({ maybeSingle: async () => ({ data: { payments_frozen: !!state.paymentsFrozen } }) }) })),
  },
}));

import Pricing from './Pricing';
import { authedPost } from '../lib/billing';

const setup = async (profile, { paymentsFrozen = false } = {}) => {
  state.profile = profile;
  state.paymentsFrozen = paymentsFrozen;
  render(<MemoryRouter><Pricing /></MemoryRouter>);
  // The frozen flag loads asynchronously (a real supabase.from(...).maybeSingle()
  // call) before either card renders at all — let it settle.
  await waitFor(() => expect(screen.queryByText('Pro')).toBeInTheDocument());
};
afterEach(() => { cleanup(); vi.mocked(authedPost).mockClear(); });

describe('Pricing — Pro card reflects Coach Pass including Pro', () => {
  it('a brand-new free user is offered the free month, no coach-pass messaging', async () => {
    await setup({ is_premium: false, coach_pass: false, trial_ends_at: null });
    expect(screen.getByRole('button', { name: 'Start my free month' })).toBeInTheDocument();
    expect(screen.queryByText(/Included with your Coach Pass/)).not.toBeInTheDocument();
  });

  it('a free user whose trial already lapsed sees the normal paid subscribe button', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    await setup({ is_premium: false, coach_pass: false, trial_ends_at: past });
    expect(screen.getByRole('button', { name: /Subscribe — A\$4\.99\/month/ })).toBeInTheDocument();
    expect(screen.queryByText(/Included with your Coach Pass/)).not.toBeInTheDocument();
  });

  it('a Coach Pass holder with no Pro subscription of their own sees it is already included, with no paid CTA', async () => {
    await setup({ is_premium: false, coach_pass: true, trial_ends_at: null, stripe_pro_subscription_id: null });
    expect(screen.getByText('Included with your Coach Pass — no separate subscription needed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Subscribe/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start my free month/ })).not.toBeInTheDocument();
  });

  it('a Coach Pass holder whose own Pro trial already lapsed still sees it is included, not a paid subscribe button', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    await setup({ is_premium: false, coach_pass: true, trial_ends_at: past, stripe_pro_subscription_id: null });
    expect(screen.getByText('Included with your Coach Pass — no separate subscription needed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Subscribe/ })).not.toBeInTheDocument();
  });

  it('a real Pro subscriber is unaffected even if they also hold a Coach Pass', async () => {
    await setup({ is_premium: true, coach_pass: true, stripe_pro_subscription_id: 'sub_1', pro_status: 'active', trial_ends_at: null });
    expect(screen.getByText(/Subscribed · active/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeInTheDocument();
    expect(screen.queryByText(/Included with your Coach Pass/)).not.toBeInTheDocument();
  });

  it('a comp-granted Pro account (no coach_pass) is unaffected', async () => {
    await setup({ is_premium: true, coach_pass: false, stripe_pro_subscription_id: null, trial_ends_at: null });
    expect(screen.getByText('Comp access — no billing to manage')).toBeInTheDocument();
  });

  it('the Coach Pass benefit list includes Pro inclusion, rest-day targets, and co-coaching', async () => {
    await setup({ is_premium: false, coach_pass: false, trial_ends_at: null });
    expect(screen.getByText(/Includes full Pro access for your own personal tracking/)).toBeInTheDocument();
    expect(screen.getByText(/training vs rest days/)).toBeInTheDocument();
    expect(screen.getByText(/Co-coach a client with a teammate/)).toBeInTheDocument();
  });
});

describe('Pricing — checkout requires confirming first', () => {
  it('clicking Subscribe does not hit checkout until the confirm modal is accepted', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    await setup({ is_premium: false, coach_pass: false, trial_ends_at: past });
    fireEvent.click(screen.getByRole('button', { name: /Subscribe — A\$4\.99\/month/ }));
    expect(authedPost).not.toHaveBeenCalled();
    expect(screen.getByText('Subscribe to Pro?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(authedPost).toHaveBeenCalledWith('/api/create-checkout-session', { plan: 'pro' });
  });

  it('cancelling the confirm modal leaves checkout untouched', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    await setup({ is_premium: false, coach_pass: false, trial_ends_at: past });
    fireEvent.click(screen.getByRole('button', { name: /Subscribe — A\$4\.99\/month/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(authedPost).not.toHaveBeenCalled();
    // The modal plays a brief exit animation (useClosingTransition) before unmounting.
    await waitFor(() => expect(screen.queryByText('Subscribe to Pro?')).not.toBeInTheDocument());
  });

  it('starting a Coach Pass free trial also confirms first, with trial-specific wording', async () => {
    await setup({ is_premium: false, coach_pass: false, trial_ends_at: null });
    fireEvent.click(screen.getByRole('button', { name: 'Start 30-day free trial' }));
    expect(authedPost).not.toHaveBeenCalled();
    expect(screen.getByText('Start your 30-day free trial?')).toBeInTheDocument();
    expect(screen.getByText(/won't be charged until the trial ends/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(authedPost).toHaveBeenCalledWith('/api/create-checkout-session', { plan: 'coach' });
  });
});

describe('Pricing — payments frozen (app_settings.payments_frozen)', () => {
  it('a brand-new free user sees no free-trial button and no "days free" caption', async () => {
    await setup({ is_premium: false, coach_pass: false, trial_ends_at: null }, { paymentsFrozen: true });
    expect(screen.queryByRole('button', { name: /Start my free month/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/days free, no card required/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Payments are temporarily paused — check back soon.').length).toBeGreaterThan(0);
  });

  it('a user who would otherwise see the paid Subscribe button sees none while frozen', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    await setup({ is_premium: false, coach_pass: false, trial_ends_at: past }, { paymentsFrozen: true });
    expect(screen.queryByRole('button', { name: /Subscribe/ })).not.toBeInTheDocument();
  });

  it('Coach Pass shows no Start-trial/Start-Coach-Pass button while frozen, and hides the "first days free" caption', async () => {
    await setup({ is_premium: false, coach_pass: false, trial_ends_at: null }, { paymentsFrozen: true });
    expect(screen.queryByRole('button', { name: /Start.*[Tt]rial|Start Coach Pass/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/First 30 days free/)).not.toBeInTheDocument();
  });

  it('an existing Pro subscriber keeps Manage billing even while frozen (the Coach Pass card still freezes, since they have no Coach Pass)', async () => {
    await setup({ is_premium: true, coach_pass: false, stripe_pro_subscription_id: 'sub_1', pro_status: 'active', trial_ends_at: null }, { paymentsFrozen: true });
    expect(screen.getByText(/Subscribed · active/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeInTheDocument();
  });

  it('comp and Coach-Pass-included access are unaffected by the freeze', async () => {
    await setup({ is_premium: false, coach_pass: true, trial_ends_at: null, stripe_pro_subscription_id: null }, { paymentsFrozen: true });
    expect(screen.getByText('Included with your Coach Pass — no separate subscription needed')).toBeInTheDocument();
    expect(screen.queryByText('Payments are temporarily paused — check back soon.')).not.toBeInTheDocument();
  });
});
