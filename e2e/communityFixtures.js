import { USER_ID } from './fixtures.js';

// Shared by the Community e2e tests: the signed-in member and feed cards as the
// database's functions return them.
export const ME = { user_id: USER_ID, username: 'alex.m', display_name: 'Alex', bio: '', avatar_path: null, is_private: false, discoverable: true, created_at: '2026-10-01T00:00:00Z' };
export const card = (id, over = {}) => ({
  id, author_id: `author-${id}`, username: 'maya.k', display_name: 'Maya', avatar_path: null, is_coach: false,
  kind: 'meal', audience: 'public', note: '', photo_path: null, photo_status: 'none', hidden: false,
  created_at: new Date(Date.now() - 2 * 3600e3).toISOString(), edited_at: null,
  hearts: 3, flames: 1, copies: 2, my_heart: false, my_flame: false, saved: false,
  payload: { title: 'Chicken power bowl', meal: 'lunch', calories: 640, protein_g: 46, carbs_g: 52, fat_g: 26, items: [{ name: 'Grilled chicken', calories: 400, protein_g: 40, carbs_g: 5, fat_g: 12 }, { name: 'Quinoa', calories: 240, protein_g: 6, carbs_g: 47, fat_g: 14 }] },
  ...over,
});
export const DAY = card('p-day', {
  kind: 'day', hearts: 12, copies: 0,
  payload: { title: 'Today so far', partial: true, goal_pct: 98, calories: 2050, protein_g: 150, carbs_g: 210, fat_g: 68, items: [{ name: 'Oats', meal: 'breakfast', calories: 350, protein_g: 14, carbs_g: 52, fat_g: 9 }, { name: 'Chicken bowl', meal: 'lunch', calories: 640, protein_g: 46, carbs_g: 52, fat_g: 26 }] },
});
export const MEAL = card('p-meal', { note: 'So good' });
export const RECIPE = card('p-recipe', {
  kind: 'recipe', username: 'sam.r', display_name: 'Sam', copies: 21,
  payload: { title: 'Overnight oats', servings: 2, calories: 350, protein_g: 14, carbs_g: 52, fat_g: 9, ingredients: [{ name: 'Oats', calories: 300, protein_g: 10, carbs_g: 50, fat_g: 6, grams: 80 }, { name: 'Milk', calories: 400, protein_g: 18, carbs_g: 54, fat_g: 12 }] },
});
