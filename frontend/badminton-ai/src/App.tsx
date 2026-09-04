import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { useTheme } from "./context/useTheme";

// FE-15: lazy-load every route (including ProtectedRoute/PrivateLayout --
// ProtectedRoute pulls in firebase/auth via useAuthUser, so leaving it as a
// static import here would still ship Firebase Auth to an anonymous
// landing-page visitor even with the page components split out).
const LandingPage = lazy(() => import("./pages/LandingPage"));
const SignInPage = lazy(() => import("./pages/SignInPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AnalysisPage = lazy(() => import("./pages/AnalysisPage"));
const ProtectedRoute = lazy(() => import("./auth/ProtectedRoute"));
const PrivateLayout = lazy(() => import("./layouts/PrivateLayout"));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}

function ThemedApp() {
  const { isDark } = useTheme();
  return (
    <div className={`theme-ai-saas min-h-screen bg-background text-foreground${isDark ? " dark" : ""}`}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/signup" element={<SignUpPage />} />

          <Route
            element={
              <ProtectedRoute>
                <PrivateLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/analysis/:videoId" element={<AnalysisPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}
