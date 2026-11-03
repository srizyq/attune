import { useNavigate } from 'react-router-dom';
import SegmentedControl from '../SegmentedControl';

// The Friends | Recipes | Coach switch at the top of the Friends tab. Recipes is
// a view of the same page; Coach is its own page (it has plenty in it). This
// makes the three feel like one tab.
const FRIENDS_TAB_PATHS = { friends: '/friends', recipes: '/friends?tab=recipes', coach: '/coach' };

export default function FriendsTabs({ active }) {
  const navigate = useNavigate();
  return (
    <div style={{ marginBottom: 14 }}>
      <SegmentedControl
        asTabs
        ariaLabel="Friends sections"
        value={active}
        onChange={(id) => navigate(FRIENDS_TAB_PATHS[id] || '/friends', { replace: active !== 'coach' && id !== 'coach' })}
        options={[
          { id: 'friends', label: 'Friends', icon: 'ti-users-group' },
          { id: 'recipes', label: 'Recipes', icon: 'ti-tools-kitchen-2' },
          { id: 'coach', label: 'Coach', icon: 'ti-users' },
        ]}
      />
    </div>
  );
}
