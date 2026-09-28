import SegmentedControl from './SegmentedControl';

// Pro-only choice between the hourly timeline and the meal-grouped view
// (Breakfast/Lunch/Dinner/Snacks) — shared between Dashboard's daily log
// and the full /log page so picking one on either page shows up on both,
// since both read the same profile.daily_log_view field rather than
// keeping page-local state.
//
// Thin wrapper around SegmentedControl — kept as its own component (rather
// than inlining the options at each call site) so both call sites stay in
// sync if the two view options themselves ever change.
export default function DailyLogViewToggle({ value, onChange, fill = false }) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      fill={fill}
      style={fill ? { maxWidth: 360 } : undefined}
      options={[
        { id: 'hourly', label: 'Hourly', icon: 'ti-clock' },
        { id: 'meals', label: 'Meals', icon: 'ti-list' },
      ]}
    />
  );
}
