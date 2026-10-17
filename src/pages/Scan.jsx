import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { hasProAccess } from '../lib/proAccess';
import { todayLocalDate } from '../lib/patterns';
import { latestDate } from '../lib/weekStrip';
import { mealFromDate, currentTimeHHMM, formatTimeFromDate } from '../lib/mealTime';
import { withBrand } from '../lib/format';
import { canGoBack } from '../lib/scanRoutes';
import { showAppToast } from '../lib/appToast';
import { BarcodeScanner } from './FoodSearch';
import PhotoScanModal from '../components/PhotoScanModal';
import MenuScanModal from '../components/MenuScanModal';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

// One page per scan: /scan/barcode, /scan/photo, /scan/menu. Where it was
// opened from travels in router state — the day being logged (date), the meal
// or time slot (openMeal / presetTime), and, while a recipe is being built, the
// recipe so far (builder). Closing goes back to where the person came from;
// in recipe mode it returns to Food search with the new ingredients added.
export default function Scan({ kind }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const state = location.state || {};
  const isPremium = hasProAccess(profile);
  const showSlots = isPremium && (profile?.daily_log_view || 'meals') === 'slots';
  const today = todayLocalDate();
  const [selectedDate] = useState(() => (state.date && state.date <= latestDate(today) ? state.date : today));
  const { addFood } = useFoodLogs(selectedDate);

  const [defaultMeal] = useState(() => {
    const requested = state.openMeal && state.openMeal.charAt(0).toUpperCase() + state.openMeal.slice(1);
    if (requested && MEALS.includes(requested)) return requested;
    const auto = mealFromDate(new Date());
    return auto.charAt(0).toUpperCase() + auto.slice(1);
  });
  const [defaultTime] = useState(() => state.presetTime || currentTimeHHMM());

  // Recipe mode: ingredients gather here and go back to Food search together.
  // A ref, so the list is current the instant a scan adds to it.
  const recipeMode = !!state.builder;
  const itemsRef = useRef(state.builder?.items || []);

  function close() {
    if (recipeMode) {
      navigate('/food', { replace: true, state: { restoreBuilder: { ...state.builder, items: itemsRef.current } } });
    } else if (canGoBack()) {
      navigate(-1);
    } else {
      navigate('/food', { replace: true });
    }
  }

  async function handleScanned(food, meal, loggedAt) {
    if (recipeMode) {
      itemsRef.current = [...itemsRef.current, food];
      showAppToast(`${withBrand(food.name, food.brand)} added to recipe`);
      return;
    }
    await addFood(food, meal, loggedAt);
    showAppToast(`${withBrand(food.name, food.brand)} added${meal ? ` to ${meal}` : loggedAt ? ` at ${formatTimeFromDate(loggedAt)}` : ''}`);
  }

  const common = { onClose: close, selectedDate, showSlots, onAddFood: handleScanned };

  return (
    <div style={{ minHeight: 'var(--app-h, 100vh)', background: 'var(--bg-primary)' }}>
      {kind === 'barcode' && (
        <BarcodeScanner {...common} recipeMode={recipeMode} defaultMeal={defaultMeal} defaultTime={defaultTime} />
      )}
      {kind === 'photo' && (
        <PhotoScanModal
          {...common} recipeMode={recipeMode} defaultMeal={defaultMeal} defaultTime={defaultTime}
          onCreateCustom={(prefill) => navigate('/food', { replace: true, state: { openCreateFood: true, createFoodPrefill: prefill || null, date: selectedDate } })}
          onSearchManually={() => navigate('/food', { replace: true, state: { focusSearch: true, date: selectedDate } })}
        />
      )}
      {kind === 'menu' && (
        <MenuScanModal
          {...common}
          onSearchManually={() => navigate('/food', { replace: true, state: { focusSearch: true, date: selectedDate } })}
        />
      )}
    </div>
  );
}
