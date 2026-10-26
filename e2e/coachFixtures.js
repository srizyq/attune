// A trainer with three clients in different states — never logged, off target,
// and on track — for the coach list / client detail tests.
const TRAINER_ID = '00000000-0000-4000-8000-00000000d3m0';
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const CLIENTS = [
  { id: 'c1', name: 'Amogh Joshi', goal: 'lose', calorie_target: 2100, protein_g: 150, carbs_g: 200, fat_g: 70 },
  { id: 'c2', name: 'Tarun', goal: 'lose', calorie_target: 1900, protein_g: 140, carbs_g: 180, fat_g: 60 },
  { id: 'c3', name: 'A client with a rather long name to check wrapping', goal: 'maintain', calorie_target: 2400, protein_g: 160, carbs_g: 260, fat_g: 80 },
];

// A client's card in the list (the tap target), not its Message button.
export const clientCard = (page, name) => page.locator('div[role="button"]', { hasText: name });

export const COACH_BACKEND = {
  profile: { coach_pass: true, coach_mode: true, coach_invite_code: 'ABCD1234', coach_pass_status: 'active', name: 'Coach Sam' },
  tables: {
    checkin_forms: [], checkin_responses: [],
    trainer_clients: CLIENTS.map((client, i) => ({
      id: `l${i + 1}`, status: 'active', created_at: new Date(Date.now() - i * 86400000).toISOString(), group_label: null, trainer_id: TRAINER_ID, client_id: client.id, client,
    })),
  },
  rpc: {
    get_client_summaries: [
      { link_id: 'l1', client_id: 'c1', client_name: 'Amogh Joshi', group_label: null, connected_at: new Date(Date.now() - 10 * 86400000).toISOString(), goal: 'lose', calorie_target: 2100, protein_g: 150, last_log_date: null, days_logged_7d: 0, days_on_target_7d: 0, days_protein_7d: 0, days_judged_7d: 0, today_cal: 0, weight_change_kg_14d: null },
      { link_id: 'l2', client_id: 'c2', client_name: 'Tarun', group_label: null, connected_at: new Date(Date.now() - 20 * 86400000).toISOString(), goal: 'lose', calorie_target: 1900, protein_g: 140, last_log_date: daysAgo(1), days_logged_7d: 6, days_on_target_7d: 2, days_protein_7d: 3, days_judged_7d: 6, today_cal: 0, weight_change_kg_14d: 0.2 },
      { link_id: 'l3', client_id: 'c3', client_name: CLIENTS[2].name, group_label: null, connected_at: new Date(Date.now() - 30 * 86400000).toISOString(), goal: 'maintain', calorie_target: 2400, protein_g: 160, last_log_date: daysAgo(0), days_logged_7d: 7, days_on_target_7d: 7, days_protein_7d: 6, days_judged_7d: 7, today_cal: 1800, weight_change_kg_14d: -0.1 },
    ],
  },
};

// A coach who OWNS a team: Mia Mate is on it too, and Kai is Mia's client.
export const TEAM_CLIENT = { id: 'team-kai', name: 'Kai Teamclient', goal: 'lose', calorie_target: 2000, protein_g: 140, carbs_g: 200, fat_g: 65 };
const teamSummary = { link_id: 'tl1', client_id: 'team-kai', client_name: 'Kai Teamclient', group_label: null, connected_at: new Date(Date.now() - 5 * 86400000).toISOString(), goal: 'lose', calorie_target: 2000, protein_g: 140, last_log_date: daysAgo(0), days_logged_7d: 6, days_on_target_7d: 4, days_protein_7d: 4, avg_cal_7d: 1950, today_cal: 900, latest_weight_kg: 82, latest_weight_date: daysAgo(1), weight_change_kg_14d: -0.8, last_checkin_date: daysAgo(1), days_complete_7d: 5, days_judged_7d: 6, avg_cal_complete_7d: 1960, pace_kg_per_week: 0.5, weight_rate_kg_week: -0.4, weigh_ins_28d: 8, targets_set_by: null, targets_overridden_at: null, coach_id: 'mate-id', coach_name: 'Mia Mate' };
const member = (user_id, name, role) => ({ user_id, name, role, joined_at: '2026-10-01T00:00:00Z', client_count: 1, has_pass: true });
export const TEAM = (isOwner = true, members) => ({ id: 'team-1', name: 'Northside Clinic', is_owner: isOwner, max_members: 25, members: members || [member(TRAINER_ID, 'Coach Sam', 'owner'), member('mate-id', 'Mia Mate', 'member')], invites: [] });

export const TEAM_OWNER_BACKEND = {
  ...COACH_BACKEND,
  tables: {
    ...COACH_BACKEND.tables,
    trainer_clients: [
      ...COACH_BACKEND.tables.trainer_clients,
      { id: 'tl1', status: 'active', created_at: new Date().toISOString(), group_label: null, trainer_id: 'mate-id', client_id: TEAM_CLIENT.id, client: TEAM_CLIENT },
    ],
  },
  rpc: {
    ...COACH_BACKEND.rpc,
    get_my_team: TEAM(true),
    // Own clients by default, the teammates' when the scope says team.
    get_client_summaries: (req) => (/"p_scope":"team"/.test(req.postData() || '') ? [teamSummary] : COACH_BACKEND.rpc.get_client_summaries),
  },
};

// The same coach with twelve clients, enough for search and sort to appear.
const MANY = Array.from({ length: 9 }, (_, i) => ({ id: `z${i}`, name: `Zed Client ${i + 1}`, goal: 'maintain', calorie_target: 2000, protein_g: 140, carbs_g: 220, fat_g: 70 }));
export const COACH_BACKEND_MANY = {
  ...COACH_BACKEND,
  tables: {
    ...COACH_BACKEND.tables,
    trainer_clients: [
      ...COACH_BACKEND.tables.trainer_clients,
      ...MANY.map((client, i) => ({ id: `lz${i}`, status: 'active', created_at: new Date(Date.now() - (i + 5) * 86400000).toISOString(), group_label: null, trainer_id: TRAINER_ID, client_id: client.id, client })),
    ],
  },
  rpc: {
    ...COACH_BACKEND.rpc,
    get_client_summaries: [
      ...COACH_BACKEND.rpc.get_client_summaries,
      ...MANY.map((client, i) => ({ link_id: `lz${i}`, client_id: client.id, client_name: client.name, group_label: null, connected_at: new Date(Date.now() - 30 * 86400000).toISOString(), goal: 'maintain', calorie_target: 2000, protein_g: 140, last_log_date: daysAgo(0), days_logged_7d: 7, days_on_target_7d: 7, days_protein_7d: 7, days_judged_7d: 7, days_complete_7d: 7, today_cal: 1500, weight_change_kg_14d: 0 })),
    ],
  },
};
