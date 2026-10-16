// Which tables the data export reads, and which it leaves out on purpose.
// Pure (no imports) so the database tests can check it against the real schema.

// table, the column that points at this person, and how to order the rows so
// paging can't skip or repeat one. `label` is what the person is told.
export const EXPORT_TABLES = [
  { key: 'foodLogs', label: 'Food log', table: 'food_logs', col: 'user_id', order: ['logged_date', 'id'] },
  { key: 'weightLogs', label: 'Weight', table: 'weight_logs', col: 'user_id', order: ['logged_date', 'id'] },
  { key: 'checkins', label: 'Daily check-ins', table: 'checkins', col: 'user_id', order: ['checkin_date'] },
  { key: 'workouts', label: 'Workouts', table: 'workout_logs', col: 'user_id', order: ['logged_date', 'id'] },
  { key: 'bodyMeasurements', label: 'Body measurements', table: 'body_measurements', col: 'user_id', order: ['logged_date', 'id'] },
  { key: 'progressPhotos', label: 'Progress photos (names and dates only)', table: 'progress_photos', col: 'user_id', order: ['taken_date', 'id'] },
  { key: 'customFoods', label: 'Your own foods', table: 'custom_foods', col: 'user_id', order: ['created_at', 'id'] },
  { key: 'favouriteFoods', label: 'Favourite foods', table: 'favourite_foods', col: 'user_id', order: ['id'] },
  { key: 'savedMeals', label: 'Saved meals and recipes', table: 'saved_meals', col: 'user_id', order: ['created_at', 'id'] },
  { key: 'daySlots', label: 'Custom day slots', table: 'day_slots', col: 'user_id', order: ['id'] },
  { key: 'fasts', label: 'Fasts', table: 'fasts', col: 'user_id', order: ['id'] },
  // Coaching: the connection(s), what was said both ways, plans and forms sent to you, and your answers.
  { key: 'coachConnections', label: 'Coach connections', table: 'trainer_clients', col: 'client_id', order: ['created_at', 'id'] },
  { key: 'coachMessages', label: 'Messages with your coach', table: 'trainer_comments', col: 'client_id', order: ['created_at', 'id'] },
  { key: 'mealPlans', label: 'Meal plans from your coach', table: 'meal_plans', col: 'client_id', order: ['created_at', 'id'] },
  { key: 'checkinForms', label: 'Check-in forms from your coach', table: 'checkin_forms', col: 'client_id', order: ['id'] },
  { key: 'checkinResponses', label: 'Your check-in answers', table: 'checkin_responses', col: 'client_id', order: ['created_at', 'id'] },
  // Community, if used.
  { key: 'communityProfile', label: 'Community profile', table: 'community_profiles', col: 'user_id', order: [] },
  { key: 'communityPosts', label: 'Community posts', table: 'community_posts', col: 'author_id', order: ['created_at', 'id'] },
  { key: 'communityReactions', label: 'Community reactions', table: 'community_reactions', col: 'user_id', order: [] },
  { key: 'communitySaves', label: 'Community saves', table: 'community_saves', col: 'user_id', order: [] },
  { key: 'communityFollowing', label: 'Community follows', table: 'community_follows', col: 'follower_id', order: [] },
  { key: 'friendSettings', label: 'Friends settings', table: 'friend_settings', col: 'user_id', order: [] },
  { key: 'friendHiddenDays', label: 'Days hidden from friends', table: 'friend_hidden_days', col: 'user_id', order: [] },
];

// Tables that hold something of the person's but are deliberately not in the
// export, and why. supabase/tests/data-export.test.js fails for any table that
// cascades from a user and is in neither list, so a new feature has to decide.
export const EXPORT_COVERED_ELSEWHERE = {
  profiles: 'exported as `profile`',
  friendships: 'exported as `friendships` (either side of the friendship)',
};
export const EXPORT_EXCLUDED = {
  trainer_notes: 'private notes a coach keeps about a client — only that coach can read them',
  push_subscriptions: 'browser push endpoints, not personal content',
  client_errors: 'crash reports; they contain no food or health data',
  coach_invites: "a coach's own invites to clients (not about this person)",
  coach_team_invites: 'coach team administration',
  coach_team_members: 'coach team administration',
  coach_teams: 'coach team administration',
  community_blocks: 'moderation and safety settings',
  community_copies: 'records of recipe copies between people',
  community_moderators: 'staff roles',
  community_push_log: 'notification delivery log',
  community_reports: 'moderation reports',
  community_testers: 'staff-managed access list',
};


