// src/App.jsx
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './hooks/useAuth'
import RequireAuth from './components/RequireAuth'
import Welcome from './pages/onboarding/Welcome'
import Step1 from './pages/onboarding/Step1'
import Step2 from './pages/onboarding/Step2'
import Step3 from './pages/onboarding/Step3'
import Step4 from './pages/onboarding/Step4'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import FoodSearch from "./pages/FoodSearch";
import Progress from "./pages/Progress";
import AIInsights from "./pages/AIInsights";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Nutrients from "./pages/Nutrients";
import Expenditure from "./pages/Expenditure";
import DailyLog from "./pages/DailyLog";
import Coach from "./pages/Coach";
import DashboardRedesignHarness from "./prototypes/dashboard-redesign/Harness";
import SettingsRedesignHarness from "./prototypes/settings-redesign/Harness";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import { locationChanged, isPageTransition } from './lib/routeTransition';

// Bottom-nav destinations switch between each other like iOS tabs (a soft
// cross-dissolve + slight rise); everything else is reached by drilling in
// from one of those pages (a settings icon, a chart tap, a back-arrow
// header) and gets a native-style push slide instead. Onboarding/login/the
// prototype harness are excluded — first-run and dev-only surfaces don't
// need this.
const TAB_PATHS = new Set(['/dashboard', '/food', '/progress', '/insights', '/log']);
function routeAnimClass(pathname) {
  return TAB_PATHS.has(pathname) ? 'route-anim-tab' : 'route-anim-push';
}

function AnimatedRoutes() {
  const location = useLocation();
  const navType = useNavigationType(); // 'PUSH' | 'POP' | 'REPLACE'
  const [renderedLocation, setRenderedLocation] = useState(location);
  const [animClass, setAnimClass] = useState('');

  useEffect(() => {
    if (!locationChanged(location, renderedLocation)) return;
    if (!isPageTransition(location, renderedLocation)) {
      // Same route, new state — a calendar day click, a re-opened scan
      // modal — must still update, just without a transition animation
      // since it isn't a real page change. See routeTransition.js.
      setRenderedLocation(location);
      return;
    }
    const base = routeAnimClass(location.pathname);
    const direction = navType === 'POP' && base === 'route-anim-push' ? 'route-anim-pop' : base;
    setRenderedLocation(location);
    setAnimClass(direction);
  }, [location, renderedLocation, navType]);

  return (
    <div key={renderedLocation.pathname} className={animClass} onAnimationEnd={() => setAnimClass('')}>
      <Routes location={renderedLocation}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/onboarding" element={<Navigate to="/onboarding/welcome" replace />} />
        <Route path="/onboarding/welcome" element={<Welcome />} />
        <Route path="/onboarding/step1" element={<Step1 />} />
        <Route path="/onboarding/step2" element={<Step2 />} />
        <Route path="/onboarding/step3" element={<Step3 />} />
        <Route path="/onboarding/step4" element={<Step4 />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/food" element={<RequireAuth><FoodSearch /></RequireAuth>} />
        <Route path="/progress" element={<RequireAuth><Progress /></RequireAuth>} />
        <Route path="/nutrients" element={<RequireAuth><Nutrients /></RequireAuth>} />
        <Route path="/expenditure" element={<RequireAuth><Expenditure /></RequireAuth>} />
        <Route path="/log" element={<RequireAuth><DailyLog /></RequireAuth>} />
        <Route path="/insights" element={<RequireAuth><AIInsights /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/coach" element={<RequireAuth><Coach /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/prototypes/dashboard-redesign" element={<DashboardRedesignHarness />} />
        <Route path="/prototypes/settings-redesign" element={<SettingsRedesignHarness />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AnimatedRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

// "/" used to render a full marketing page (nav, hero, pricing table,
// etc. — see git history if that copy is ever needed again). The user
// explicitly asked to never see it again, on any device: "/" is now a
// pure auth gate that always sends visitors straight into the product —
// signed in or not, phone or desktop.
function Landing() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f0f0f', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '3px solid #2a2a2a', borderTopColor: '#8fbc8f',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }
  return <Navigate to={user ? '/dashboard' : '/onboarding/welcome'} replace />;
}
