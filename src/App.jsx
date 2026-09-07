// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
