import { useNavigate } from 'react-router-dom';
import SegmentedControl from '../SegmentedControl';

// The Friends | Coach switch at the top of the Friends tab. Coach is its own
// page (it has plenty in it); this makes the two feel like one tab.
export default function FriendsTabs({ active }) {
  const navigate = useNavigate();
  return (
    <div style={{ marginBottom: 14 }}>
      <SegmentedControl
        asTabs
        ariaLabel="Friends sections"
        value={active}
        onChange={(id) => navigate(id === 'coach' ? '/coach' : '/friends')}
        options={[{ id: 'friends', label: 'Friends', icon: 'ti-users-group' }, { id: 'coach', label: 'Coach', icon: 'ti-users' }]}
      />
    </div>
  );
}
