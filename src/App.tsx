import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';

const Landing = lazy(() => import('./pages/Landing').then((module) => ({ default: module.Landing })));
const SignIn = lazy(() => import('./pages/SignIn').then((module) => ({ default: module.SignIn })));
const SignUp = lazy(() => import('./pages/SignUp').then((module) => ({ default: module.SignUp })));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then((module) => ({ default: module.ForgotPassword })));
const Onboarding = lazy(() => import('./pages/Onboarding').then((module) => ({ default: module.Onboarding })));
const Feed = lazy(() => import('./pages/Feed').then((module) => ({ default: module.Feed })));
const Discover = lazy(() => import('./pages/Discover').then((module) => ({ default: module.Discover })));
const Recommendations = lazy(() => import('./pages/Recommendations').then((module) => ({ default: module.Recommendations })));
const MyNetwork = lazy(() => import('./pages/MyNetwork').then((module) => ({ default: module.MyNetwork })));
const SocialGraph = lazy(() => import('./pages/SocialGraph').then((module) => ({ default: module.SocialGraph })));
const Communities = lazy(() => import('./pages/Communities').then((module) => ({ default: module.Communities })));
const ConnectionPaths = lazy(() => import('./pages/ConnectionPaths').then((module) => ({ default: module.ConnectionPaths })));
const SavedProfiles = lazy(() => import('./pages/SavedProfiles').then((module) => ({ default: module.SavedProfiles })));
const Notifications = lazy(() => import('./pages/Notifications').then((module) => ({ default: module.Notifications })));
const Insights = lazy(() => import('./pages/Insights').then((module) => ({ default: module.Insights })));
const MutualFriends = lazy(() => import('./pages/MutualFriends').then((module) => ({ default: module.MutualFriends })));
const Analytics = lazy(() => import('./pages/Analytics').then((module) => ({ default: module.Analytics })));
const ProfileSettings = lazy(() => import('./pages/ProfileSettings').then((module) => ({ default: module.ProfileSettings })));
const PrivacySettings = lazy(() => import('./pages/PrivacySettings').then((module) => ({ default: module.PrivacySettings })));
const ProfileView = lazy(() => import('./pages/ProfileView').then((module) => ({ default: module.ProfileView })));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, authError, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-10 h-10" />
      </div>
    );
  }
  if (!session) return <Navigate to="/signin" replace />;
  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-canvas">
        <div role="alert" className="max-w-xl rounded-2xl bg-white p-8 shadow-card">
          <h1 className="text-xl font-bold text-navy-900">Bondly database setup is incomplete</h1>
          <p className="mt-3 text-sm text-navy-600">{authError}</p>
        </div>
      </div>
    );
  }
  if (!profile || !profile.onboarding_completed) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner className="w-10 h-10" /></div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Feed />} />
          <Route path="feed" element={<Navigate to="/app" replace />} />
          <Route path="discover" element={<Discover />} />
          <Route path="recommendations" element={<Recommendations />} />
          <Route path="network" element={<MyNetwork />} />
          <Route path="graph" element={<SocialGraph />} />
          <Route path="communities" element={<Communities />} />
          <Route path="paths" element={<ConnectionPaths />} />
          <Route path="saved" element={<SavedProfiles />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="insights" element={<Insights />} />
          <Route path="mutual-friends" element={<MutualFriends />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<ProfileSettings />} />
          <Route path="privacy" element={<PrivacySettings />} />
          <Route path="profile/:id" element={<ProfileView />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
