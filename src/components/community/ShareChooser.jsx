import { useState } from 'react';
import ActionSheet from './ActionSheet';
import { useFoodLogs } from '../../hooks/useFoodLogs';
import { useSavedMeals } from '../../hooks/useSavedMeals';
import { buildDayPost, buildMealPost, buildRecipePost, canShareRecipe, mealLabel } from '../../lib/communityPosts';
import { targetsForDate } from '../../lib/dayTargets';
import { todayLocalDate } from '../../lib/patterns';

/**
 * "What do you want to share?" — for the + in Community, where the food isn't
 * on screen. Offers today so far, a meal from today, or one of your recipes,
 * then hands the chosen post to `onPick` (which opens the share sheet).
 */
export default function ShareChooser({ profile, onPick, onClose }) {
  const today = todayLocalDate();
  const { meals, loading } = useFoodLogs(today);
  const recipes = useSavedMeals();
  const [step, setStep] = useState('start'); // start | meal | recipe

  const items = Object.values(meals).flat();
  const mealsWithFood = Object.entries(meals).filter(([, list]) => list.length > 0);
  const shareable = recipes.rows.filter(canShareRecipe);

  if (step === 'meal') {
    return (
      <ActionSheet
        title="Which meal?"
        onClose={onClose}
        actions={mealsWithFood.map(([key, list]) => ({
          label: `${mealLabel(key)} · ${Math.round(list.reduce((s, i) => s + i.cal, 0))} kcal`,
          icon: 'ti-tools-kitchen-2',
          onSelect: () => onPick(buildMealPost({ meal: key, date: today, items: list })),
        }))}
      />
    );
  }
  if (step === 'recipe') {
    return (
      <ActionSheet
        title="Which recipe?"
        onClose={onClose}
        actions={shareable.map((r) => ({ label: r.name, icon: 'ti-chef-hat', onSelect: () => onPick(buildRecipePost(r)) }))}
      />
    );
  }

  const actions = [];
  if (items.length > 0) actions.push({ label: 'Today so far', icon: 'ti-target-arrow', onSelect: () => onPick(buildDayPost({ date: today, today, items, targetCalories: targetsForDate(profile, today)?.calories })) });
  if (mealsWithFood.length > 0) actions.push({ label: 'A meal from today', icon: 'ti-tools-kitchen-2', keepOpen: true, onSelect: () => setStep('meal') });
  if (shareable.length > 0) actions.push({ label: 'A recipe', icon: 'ti-chef-hat', keepOpen: true, onSelect: () => setStep('recipe') });

  if (!loading && !recipes.loading && actions.length === 0) {
    return <ActionSheet title="Nothing to share yet. Log some food or save a recipe, then share it here." actions={[]} onClose={onClose} />;
  }
  return <ActionSheet title="What do you want to share?" actions={actions} onClose={onClose} />;
}
