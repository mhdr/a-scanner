import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ScansPage from './pages/ScansPage';
import ScanDetailPage from './pages/ScanDetailPage';
import ResultsPage from './pages/ResultsPage';
import IpDetailPage from './pages/IpDetailPage';
import ProvidersPage from './pages/ProvidersPage';
import LoginPage from './pages/LoginPage';
import { useAuthStore } from './stores/authStore';

/** Redirects to /login when not authenticated. */
function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public route — login page (no Layout wrapper) */}
        <Route path="/login" element={<LoginPage />} />

        {/* All other routes require authentication */}
        <Route
          path="*"
          element={
            <AuthGuard>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/scans" replace />} />
                  <Route path="/scans" element={<ScansPage />} />
                  <Route path="/scans/:id" element={<ScanDetailPage />} />
                  <Route path="/providers" element={<ProvidersPage />} />
                  <Route path="/results/:ip" element={<IpDetailPage />} />
                  <Route path="/results" element={<ResultsPage />} />
                </Routes>
              </Layout>
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

