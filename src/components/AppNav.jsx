import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LogoMark from './LogoMark';
import QuickActionSheet from './QuickActionSheet';
import { useCommunityAccess } from '../hooks/useCommunityAccess';

// Desktop sidebar keeps the fuller set of primary pages. Mobile trims to
// the 4 highest-frequency destinations plus a center "+" for everything
// else — Meal Plans was a real nav item here until it was removed as a
// feature entirely (static/demo page, never backed by real data).
const DESKTOP_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard', path: '/dashboard' },
  { id: 'food', label: 'Food search', icon: 'ti-search', path: '/food' },
  { id: 'coach', label: 'Coach', icon: 'ti-users', path: '/coach' },
];

const MOBILE_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard', path: '/dashboard' },
  { id: 'log', label: 'Daily log', icon: 'ti-clipboard-list', path: '/log' },
];
const MOBILE_ITEMS_RIGHT = [
  { id: 'coach', label: 'Coach', icon: 'ti-users', path: '/coach' },
];
// With Community switched on, its tab takes the Coach slot — Coach lives inside
// it (Friends | Coach), so the Coach pages keep this tab lit.
const COMMUNITY_ITEM = { id: 'community', label: 'Community', icon: 'ti-world', path: '/community' };

// One shared shape for every bottom-nav tab (not just the two MOBILE_ITEMS
// arrays — Settings below is the same button, just with no array entry of
// its own) so the active state can't drift out of sync between them. The
// outer button stays the full flex:1 tap target (unstyled); the inner
// -content span is what actually gets the filled pill when active, sized
// to just the icon+label rather than the whole tap slot — same reasoning
// as why the old icon-only highlight lived on the glyph, not the button.
function MobileNavButton({ isActive, label, icon, onClick }) {
  return (
    <button
      className="app-bottom-icon"
      title={label}
      onClick={onClick}
    >
      <span className={`app-bottom-icon-content${isActive ? ' is-active' : ''}`}>
        <span className="app-bottom-icon-pill"><i className={`ti ${icon}`} /></span>
        <span className="app-bottom-icon-label">{label}</span>
      </span>
    </button>
  );
}

// Desktop: left sidebar. Mobile/tablet (<=860px): bottom nav — CSS media
// queries control which one renders, not JS, so it responds to real
// viewport width without a resize listener.
export default function AppNav({ active, initials }) {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { enabled: communityOn } = useCommunityAccess();
  const swap = (item) => (communityOn && item.id === 'coach' ? COMMUNITY_ITEM : item);
  const isActive = (item) => active === item.id || (communityOn && item.id === 'community' && active === 'coach');

  return (
    <>
      <nav className="app-sidebar">
        <LogoMark size={28} />
        {DESKTOP_ITEMS.map(swap).map(item => (
          <button
            key={item.id}
            className={`app-nav-icon${isActive(item) ? ' is-active' : ''}`}
            title={item.label}
            onClick={() => navigate(item.path)}
          >
            <i className={`ti ${item.icon}`} />
          </button>
        ))}
        <div className="app-sidebar-spacer" />
        <button
          className={`app-nav-avatar${active === 'settings' || active === 'profile' ? ' is-active' : ''}`}
          title="Settings"
          onClick={() => navigate('/settings')}
        >
          {initials}
        </button>
      </nav>

      <nav className="app-bottom-nav">
        {MOBILE_ITEMS.map(item => (
          <MobileNavButton
            key={item.id}
            isActive={active === item.id}
            label={item.label}
            icon={item.icon}
            onClick={() => navigate(item.path)}
          />
        ))}
        <button
          className="app-bottom-add"
          title="Quick add"
          aria-label="Quick add"
          onClick={() => setSheetOpen(true)}
        >
          <i className="ti ti-plus" />
        </button>
        {MOBILE_ITEMS_RIGHT.map(swap).map(item => (
          <MobileNavButton
            key={item.id}
            isActive={isActive(item)}
            label={item.label}
            icon={item.icon}
            onClick={() => navigate(item.path)}
          />
        ))}
        <MobileNavButton
          isActive={active === 'settings' || active === 'profile'}
          label="Settings"
          icon="ti-settings"
          onClick={() => navigate('/settings')}
        />
      </nav>

      {sheetOpen && <QuickActionSheet onClose={() => setSheetOpen(false)} />}
    </>
  );
}
