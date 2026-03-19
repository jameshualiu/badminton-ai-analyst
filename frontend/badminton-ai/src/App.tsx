import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import DashboardPage from "./pages/DashboardPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import PrivateLayout from "./layouts/PrivateLayout";
import AnalysisPage from "./pages/AnalysisPage";

export default function App() {
  return (
    <div className="theme-amethyst min-h-screen bg-background text-foreground">
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
    </div>
  );
}