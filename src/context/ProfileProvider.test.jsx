// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, render, screen, waitFor, act, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ auth: { user: { id: 'u1', email: 'a@b.test' } }, profile: { id: 'u1', name: 'Sam' } }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/db', () => ({
  getProfile: vi.fn(async () => h.profile),
  upsertProfile: vi.fn(async (_id, fields) => ({ ...h.profile, ...fields })),
}));
import { getProfile, upsertProfile } from '../lib/db';
import { ProfileProvider } from './ProfileProvider';
import { useProfile } from '../hooks/useProfile';

beforeEach(() => { cleanup(); vi.clearAllMocks(); h.auth = { user: { id: 'u1', email: 'a@b.test' } }; h.profile = { id: 'u1', name: 'Sam' }; });

function Name({ id }) {
  const { profile, loading } = useProfile();
  return <p data-testid={id}>{loading ? 'loading' : profile?.name ?? 'none'}</p>;
}

describe('ProfileProvider', () => {
  it('loads the profile once however many screens use it', async () => {
    render(<ProfileProvider><Name id="a" /><Name id="b" /><Name id="c" /></ProfileProvider>);
    await waitFor(() => expect(screen.getByTestId('a').textContent).toBe('Sam'));
    expect(screen.getByTestId('b').textContent).toBe('Sam');
    expect(getProfile).toHaveBeenCalledTimes(1);
  });

  it('shows the profile at once to a screen that opens later, with no loading state', async () => {
    const { rerender } = render(<ProfileProvider><Name id="a" /></ProfileProvider>);
    await waitFor(() => expect(screen.getByTestId('a').textContent).toBe('Sam'));
    rerender(<ProfileProvider><Name id="a" /><Name id="late" /></ProfileProvider>);
    expect(screen.getByTestId('late').textContent).toBe('Sam');
    expect(getProfile).toHaveBeenCalledTimes(1);
  });

  it('shares a save with every screen', async () => {
    const { result } = renderHook(() => ({ a: useProfile(), b: useProfile() }), { wrapper: ProfileProvider });
    await waitFor(() => expect(result.current.a.profile?.name).toBe('Sam'));
    await act(async () => { await result.current.a.save({ name: 'Alex' }); });
    expect(result.current.a.profile.name).toBe('Alex');
    expect(result.current.b.profile.name).toBe('Alex');
    expect(upsertProfile).toHaveBeenCalledWith('u1', { name: 'Alex' });
  });

  it('keeps the profile it has when a refresh fails', async () => {
    const { result } = renderHook(() => useProfile(), { wrapper: ProfileProvider });
    await waitFor(() => expect(result.current.profile?.name).toBe('Sam'));
    getProfile.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.refetch(); });
    expect(result.current.profile.name).toBe('Sam');
  });

  it('does not show one account the previous account\'s profile', async () => {
    const view = render(<ProfileProvider><Name id="a" /></ProfileProvider>);
    await waitFor(() => expect(screen.getByTestId('a').textContent).toBe('Sam'));
    h.auth = { user: { id: 'u2', email: 'c@d.test' } };
    h.profile = { id: 'u2', name: 'Robin' };
    view.rerender(<ProfileProvider><Name id="a" /></ProfileProvider>);
    await waitFor(() => expect(screen.getByTestId('a').textContent).toBe('Robin'));
  });
});

describe('useProfile without a provider', () => {
  it('still loads its own profile', async () => {
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.profile?.name).toBe('Sam'));
  });
});
