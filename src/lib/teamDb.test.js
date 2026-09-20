import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ rpc: null }));
vi.mock('./supabase', () => ({ supabase: { rpc: (...args) => Promise.resolve(h.rpc(...args)) } }));
import {
  getMyTeam, createCoachTeam, createTeamInvite, revokeTeamInvite, redeemTeamInvite, leaveCoachTeam,
  removeTeamMember, deleteCoachTeam, shareClientWithTeammate, getClientCoaches, getMyTrainers,
} from './db';

const missing = { code: 'PGRST202', message: 'Could not find the function public.get_my_team without parameters in the schema cache' };
beforeEach(() => { h.rpc = () => ({ data: null, error: null }); });

describe('getMyTeam', () => {
  it('returns the team document, or null when not on one', async () => {
    h.rpc = () => ({ data: { id: 't1', name: 'Clinic' }, error: null });
    expect(await getMyTeam()).toEqual({ supported: true, team: { id: 't1', name: 'Clinic' } });
    h.rpc = () => ({ data: null, error: null });
    expect(await getMyTeam()).toEqual({ supported: true, team: null });
  });
  it('is "not supported" (so the UI hides) before the SQL update, and surfaces other errors', async () => {
    h.rpc = () => ({ data: null, error: missing });
    expect(await getMyTeam()).toEqual({ supported: false, team: null });
    const other = { code: '42501', message: 'permission denied' };
    h.rpc = () => ({ data: null, error: other });
    await expect(getMyTeam()).rejects.toBe(other);
  });
});

describe('team actions', () => {
  it('call the right database function with the right arguments', async () => {
    const calls = [];
    h.rpc = (name, args) => { calls.push([name, args]); return { data: 'ok', error: null }; };
    await createCoachTeam('Clinic');
    await createTeamInvite(3);
    await createTeamInvite();
    await revokeTeamInvite('i1');
    await redeemTeamInvite('ABCD2345');
    await leaveCoachTeam();
    await removeTeamMember('u1');
    await deleteCoachTeam();
    await shareClientWithTeammate('c1', 'u2');
    expect(calls).toEqual([
      ['create_coach_team', { p_name: 'Clinic' }],
      ['create_team_invite', { p_days: 3 }],
      ['create_team_invite', { p_days: 7 }],
      ['revoke_team_invite', { p_invite_id: 'i1' }],
      ['redeem_team_invite', { p_code: 'ABCD2345' }],
      ['leave_coach_team', {}],
      ['remove_team_member', { p_user_id: 'u1' }],
      ['delete_coach_team', {}],
      ['share_client_with_teammate', { p_client_id: 'c1', p_teammate_id: 'u2' }],
    ]);
  });
  it('say plainly that the database update is missing, and pass the database\'s own messages through', async () => {
    h.rpc = () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(createCoachTeam('x')).rejects.toThrow(/latest database update/);
    const refusal = { message: 'Only the team owner can invite people' };
    h.rpc = () => ({ data: null, error: refusal });
    await expect(createTeamInvite()).rejects.toBe(refusal);
  });
});

describe('getClientCoaches', () => {
  it('maps the rows', async () => {
    h.rpc = () => ({ data: [{ trainer_id: 'a', trainer_name: 'Ann', status: 'pending' }], error: null });
    expect(await getClientCoaches('c1')).toEqual({ supported: true, coaches: [{ id: 'a', name: 'Ann', status: 'pending' }] });
    h.rpc = () => ({ data: null, error: null });
    expect((await getClientCoaches('c1')).coaches).toEqual([]);
  });
  it('is not supported before the SQL update', async () => {
    h.rpc = () => ({ data: null, error: missing });
    expect(await getClientCoaches('c1')).toEqual({ supported: false, coaches: [] });
  });
});

describe('getMyTrainers', () => {
  it('carries who suggested a coach, null when nobody did or the column is absent', async () => {
    h.rpc = () => ({ data: [
      { id: 'l1', status: 'pending', created_at: 'x', consented_at: null, trainer_id: 't1', trainer_name: 'Mia', trainer_logo_url: null, referred_by_name: 'Olive' },
      { id: 'l2', status: 'active', created_at: 'x', consented_at: 'y', trainer_id: 't2', trainer_name: 'Olive', trainer_logo_url: null },
    ], error: null });
    const rows = await getMyTrainers('me');
    expect(rows[0]).toMatchObject({ id: 'l1', referredByName: 'Olive', trainer: { name: 'Mia' } });
    expect(rows[1].referredByName).toBeNull();
  });
});
