// src/App.jsx
import { lazy, startTransition, Suspense, useEffect, useState } from 'react'
import FirstRunTour from './components/FirstRunTour'
import { track, identifyUser, resetUser } from './lib/telemetry'
import { syncQueue } from './lib/offlineQueue'
import { addFoodLog } from './lib/db'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { ProfileProvider } from './context/ProfileProvider'
import { useAuth } from './hooks/useAuth'
import RequireAuth from './components/RequireAuth'
import Welcome from './pages/onboarding/Welcome'
import Step1 from './pages/onboarding/Step1'
import Step2 from './pages/onboarding/Step2'
import Step3 from './pages/onboarding/Step3'
import Step4 from './pages/onboarding/Step4'
import Step5 from './pages/onboarding/Step5'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import FoodSearch from "./pages/FoodSearch";
import DailyLog from "./pages/DailyLog";
import { locationChanged, isPageTransition } from './lib/routeTransition';
import { rememberScreen } from './lib/lastScreen';
import Toast from './components/Toast';
import { onAppToast } from './lib/appToast';
import { preloadPages } from './lib/preloadPages';

// Secondary screens load on demand so the first paint ships less JS. The
// bottom-nav tabs (Dashboard, Food, Log) stay eager to keep tab switches instant.
const loadRecipes = () => import('./pages/Recipes');
const Recipes = lazy(loadRecipes);
const loadRecipeDetail = () => import('./pages/RecipeDetail');
const RecipeDetail = lazy(loadRecipeDetail);
const loadSettings = () => import('./pages/Settings');
const Settings = lazy(loadSettings);
const loadSettingsGoals = () => import('./pages/SettingsGoals');
const SettingsGoals = lazy(loadSettingsGoals);
const loadProfile = () => import('./pages/Profile');
const Profile = lazy(loadProfile);
const loadMyProfile = () => import('./pages/MyProfile');
const MyProfile = lazy(loadMyProfile);
const loadPricing = () => import('./pages/Pricing');
const Pricing = lazy(loadPricing);
const loadNutrients = () => import('./pages/Nutrients');
const Nutrients = lazy(loadNutrients);
const loadNutrientFoods = () => import('./pages/NutrientFoods');
const NutrientFoods = lazy(loadNutrientFoods);
const loadExpenditure = () => import('./pages/Expenditure');
const Expenditure = lazy(loadExpenditure);
const loadFasting = () => import('./pages/Fasting');
const Fasting = lazy(loadFasting);
const loadCoach = () => import('./pages/Coach');
const Coach = lazy(loadCoach);
const loadFriends = () => import('./pages/Friends');
const Friends = lazy(loadFriends);
const Notifications = lazy(() => import('./pages/Notifications'));
const SettingsNotifications = lazy(() => import('./pages/SettingsSubPages').then((m) => ({ default: m.SettingsNotifications })));
const SettingsCoach = lazy(() => import('./pages/SettingsSubPages').then((m) => ({ default: m.SettingsCoach })));
const SettingsPrivacy = lazy(() => import('./pages/SettingsSubPages').then((m) => ({ default: m.SettingsPrivacy })));
const SettingsImport = lazy(() => import('./pages/SettingsSubPages').then((m) => ({ default: m.SettingsImport })));
const loadScan = () => import('./pages/Scan');
const Scan = lazy(loadScan);
const loadFriendDay = () => import('./pages/FriendDay');
const FriendDay = lazy(loadFriendDay);
const loadReportProblem = () => import('./pages/ReportProblem');
const ReportProblem = lazy(loadReportProblem);
const loadAdminReports = () => import('./pages/AdminReports');
const AdminReports = lazy(loadAdminReports);
const loadJoinFriend = () => import('./pages/JoinFriend');
const JoinFriend = lazy(loadJoinFriend);
const loadJoinCoach = () => import('./pages/JoinCoach');
const JoinCoach = lazy(loadJoinCoach);
const loadDashboardRedesignHarness = () => import('./prototypes/dashboard-redesign/Harness');
const DashboardRedesignHarness = lazy(loadDashboardRedesignHarness);
const loadSettingsRedesignHarness = () => import('./prototypes/settings-redesign/Harness');
const SettingsRedesignHarness = lazy(loadSettingsRedesignHarness);
const loadTerms = () => import('./pages/Terms');
const Terms = lazy(loadTerms);
const loadPrivacy = () => import('./pages/Privacy');
const Privacy = lazy(loadPrivacy);

// Downloaded quietly once someone is signed in and the first screen is up, so
// opening any of them later is instant (see lib/preloadPages.js).
const PRELOAD = [loadSettings, loadSettingsGoals, loadProfile, loadExpenditure, loadNutrients, loadRecipes, loadRecipeDetail, loadFasting, loadScan, loadFriends, loadCoach, loadMyProfile];

// Bottom-nav destinations switch between each other like iOS tabs (a soft
// cross-dissolve + slight rise); everything else is reached by drilling in
// from one of those pages (a settings icon, a chart tap, a back-arrow
// header) and gets a native-style push slide instead. Onboarding/login/the
// prototype harness are excluded — first-run and dev-only surfaces don't
// need this.
const TAB_PATHS = new Set(['/dashboard', '/food', '/coach', '/log']);
function routeAnimClass(pathname) {
  return TAB_PATHS.has(pathname) ? 'route-anim-tab' : 'route-anim-push';
}

// The tour is for people who have just finished signing up, not existing users.
const isNewAccount = (u) => !!u?.created_at && Date.now() - new Date(u.created_at).getTime() < 3 * 24 * 3600 * 1000

function AnimatedRoutes() {
  const location = useLocation();
  const navType = useNavigationType(); // 'PUSH' | 'POP' | 'REPLACE'
  const [renderedLocation, setRenderedLocation] = useState(location);
  const [animClass, setAnimClass] = useState('');

  useEffect(() => { rememberScreen(location.pathname); }, [location.pathname]);

  const { user } = useAuth();
  const signedIn = !!user;
  useEffect(() => (signedIn ? preloadPages(PRELOAD) : undefined), [signedIn]);
  useEffect(() => { if (user?.id) identifyUser(user.id); else resetUser(); }, [user?.id]);
  useEffect(() => {
    if (!user?.id) return undefined;
    const run = () => syncQueue(addFoodLog, user.id).then(({ synced }) => { if (synced) window.location.reload(); }).catch(() => {});
    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [user?.id]);
  useEffect(() => { track('screen_view', { path: location.pathname.replace(/\/[0-9a-f-]{8,}.*/i, '/:id') }); }, [location.pathname]);

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
    // As a transition: if the new page's code hasn't downloaded yet, React keeps
    // showing the current page until it has, instead of flashing an empty screen.
    startTransition(() => {
      setRenderedLocation(location);
      setAnimClass(direction);
    });
  }, [location, renderedLocation, navType]);

  return (
    <>
    <FirstRunTour enabled={signedIn && !user?.is_anonymous && isNewAccount(user)} onDashboard={location.pathname === '/dashboard'} />
    <div key={renderedLocation.pathname} className={animClass} onAnimationEnd={() => setAnimClass('')}>
      <Suspense fallback={null}>
      <Routes location={renderedLocation}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/onboarding" element={<Navigate to="/onboarding/welcome" replace />} />
        <Route path="/onboarding/welcome" element={<Welcome />} />
        <Route path="/onboarding/step1" element={<Step1 />} />
        <Route path="/onboarding/step2" element={<Step2 />} />
        <Route path="/onboarding/step3" element={<Step3 />} />
        <Route path="/onboarding/step4" element={<Step4 />} />
        <Route path="/onboarding/step5" element={<Step5 />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/food" element={<RequireAuth><FoodSearch /></RequireAuth>} />
        <Route path="/scan/barcode" element={<RequireAuth><Scan kind="barcode" /></RequireAuth>} />
        <Route path="/scan/photo" element={<RequireAuth><Scan kind="photo" /></RequireAuth>} />
        <Route path="/scan/menu" element={<RequireAuth><Scan kind="menu" /></RequireAuth>} />
        <Route path="/recipes" element={<RequireAuth><Recipes /></RequireAuth>} />
        <Route path="/recipes/:id" element={<RequireAuth><RecipeDetail /></RequireAuth>} />
        <Route path="/progress" element={<Navigate to="/expenditure" replace />} />
        <Route path="/nutrients" element={<RequireAuth><Nutrients /></RequireAuth>} />
        <Route path="/nutrients/:key" element={<RequireAuth><NutrientFoods /></RequireAuth>} />
        <Route path="/expenditure" element={<RequireAuth><Expenditure /></RequireAuth>} />
        <Route path="/fasting" element={<RequireAuth><Fasting /></RequireAuth>} />
        <Route path="/log" element={<RequireAuth><DailyLog /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/settings/notifications" element={<RequireAuth><SettingsNotifications /></RequireAuth>} />
        <Route path="/settings/coach" element={<RequireAuth><SettingsCoach /></RequireAuth>} />
        <Route path="/settings/privacy" element={<RequireAuth><SettingsPrivacy /></RequireAuth>} />
        <Route path="/settings/privacy/import" element={<RequireAuth><SettingsImport /></RequireAuth>} />
        <Route path="/settings/goals" element={<RequireAuth><SettingsGoals /></RequireAuth>} />
        <Route path="/coach/*" element={<RequireAuth><Coach /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
        <Route path="/friends" element={<RequireAuth><Friends /></RequireAuth>} />
        <Route path="/friends/join/:code" element={<JoinFriend />} />
        <Route path="/friends/:id" element={<RequireAuth><FriendDay /></RequireAuth>} />
        <Route path="/community/*" element={<Navigate to="/friends" replace />} />
        <Route path="/join/:code" element={<JoinCoach />} />
        <Route path="/profile" element={<RequireAuth><MyProfile /></RequireAuth>} />
        <Route path="/settings/personal" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/settings/report" element={<RequireAuth><ReportProblem /></RequireAuth>} />
        <Route path="/admin/reports" element={<RequireAuth><AdminReports /></RequireAuth>} />
        <Route path="/pricing" element={<RequireAuth><Pricing /></RequireAuth>} />
        <Route path="/prototypes/dashboard-redesign" element={<DashboardRedesignHarness />} />
        <Route path="/prototypes/settings-redesign" element={<SettingsRedesignHarness />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </div>
    </>
  );
}

// Keeps --vvh and --vvo (consumed by .modal-backdrop/.sheet-panel in
// index.css) in sync with the visual viewport, which shrinks — and shifts —
// when the on-screen keyboard opens, unlike 100vh/window.innerHeight, which
// do neither. --vvh alone (the original fix here) covers the shrink: without
// it, a centered modal stays sized for the full pre-keyboard height and its
// bottom half ends up hidden under the keyboard. But focusing a text/number
// input inside a `position: fixed` modal also makes iOS Safari pan the
// *visual* viewport down over the (unmoved) layout viewport to keep that
// input clear of the keyboard — confirmed via screen recording: with only
// --vvh applied, the barcode-scan modal's backdrop stayed pinned to the
// layout viewport's top while the visual viewport panned down past it,
// visibly detaching the backdrop from the real top of the screen and
// exposing a strip of the food list behind it, right above the keyboard.
// --vvo (visualViewport.offsetTop) is that pan distance; translateY-ing the
// backdrop by it keeps the backdrop visually anchored to the top of
// whatever's actually on screen, same as --vvh keeps its bottom edge off
// the keyboard.
function useVisualViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const setVvh = () => {
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
      document.documentElement.style.setProperty('--vvo', `${vv.offsetTop}px`);
    };
    setVvh();
    vv.addEventListener('resize', setVvh);
    vv.addEventListener('scroll', setVvh);
    return () => {
      vv.removeEventListener('resize', setVvh);
      vv.removeEventListener('scroll', setVvh);
    };
  }, []);
}

// Confirmations that outlive the screen that caused them (a scan page logs
// food and then closes) — see lib/appToast.js.
function AppToastHost() {
  const [toast, setToast] = useState(null);
  useEffect(() => onAppToast((t) => setToast({ ...t, id: Date.now() })), []);
  return toast ? <Toast key={toast.id} message={toast.message} error={toast.isError} onDone={() => setToast(null)} /> : null;
}

export default function App() {
  useVisualViewportHeight();
  return (
    <AuthProvider>
      <ProfileProvider>
        <BrowserRouter>
          <AnimatedRoutes />
          <AppToastHost />
        </BrowserRouter>
      </ProfileProvider>
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
        minHeight: 'var(--app-h)', background: 'var(--bg-primary)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '3px solid var(--border-default)', borderTopColor: 'var(--accent)',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }
  return <Navigate to={user ? '/dashboard' : '/onboarding/welcome'} replace />;
}
