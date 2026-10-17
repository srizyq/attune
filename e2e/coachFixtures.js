// A trainer with three clients in different states — never logged, off target,
// and on track — for the coach list / client detail tests.
const TRAINER_ID = '00000000-0000-4000-8000-00000000d3m0';
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const CLIENTS = [
  { id: 'c1', name: 'Amogh Joshi', goal: 'lose', calorie_target: 2100, protein_g: 150, carbs_g: 200, fat_g: 70 },
  { id: 'c2', name: 'Tarun', goal: 'lose', calorie_target: 1900, protein_g: 140, carbs_g: 180, fat_g: 60 },
  { id: 'c3', name: 'A client with a rather long name to check wrapping', goal: 'maintain', calorie_target: 2400, protein_g: 160, carbs_g: 260, fat_g: 80 },
];

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
