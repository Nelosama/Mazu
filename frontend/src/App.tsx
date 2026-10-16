import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/AuthContext';
import { PageLoader } from '@/components/ui';
import { LandingPage } from '@/pages/LandingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { BusinessPage } from '@/pages/public/BusinessPage';

// La experiencia pública se carga de inmediato; el panel y el Super Admin en diferido.
const ManagePage = lazy(() =>
  import('@/pages/public/ManagePage').then((m) => ({ default: m.ManagePage })),
);
const FeedbackPage = lazy(() =>
  import('@/pages/public/FeedbackPage').then((m) => ({ default: m.FeedbackPage })),
);
const LoginPage = lazy(() =>
  import('@/pages/auth/AuthPages').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('@/pages/auth/AuthPages').then((m) => ({ default: m.RegisterPage })),
);
const AppLayout = lazy(() =>
  import('@/pages/app/AppLayout').then((m) => ({ default: m.AppLayout })),
);
const BusinessPickerPage = lazy(() =>
  import('@/pages/app/BusinessPickerPage').then((m) => ({ default: m.BusinessPickerPage })),
);
const AgendaPage = lazy(() =>
  import('@/pages/app/AgendaPage').then((m) => ({ default: m.AgendaPage })),
);
const ServicesPage = lazy(() =>
  import('@/pages/app/ServicesPage').then((m) => ({ default: m.ServicesPage })),
);
const StaffPage = lazy(() =>
  import('@/pages/app/StaffPage').then((m) => ({ default: m.StaffPage })),
);
const StaffSchedulePage = lazy(() =>
  import('@/pages/app/StaffSchedulePage').then((m) => ({ default: m.StaffSchedulePage })),
);
const FeedbackDashboardPage = lazy(() =>
  import('@/pages/app/FeedbackPage').then((m) => ({ default: m.FeedbackDashboardPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/app/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const TeamPage = lazy(() => import('@/pages/app/TeamPage').then((m) => ({ default: m.TeamPage })));
const OnboardingPage = lazy(() =>
  import('@/pages/app/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
);
const AdminPage = lazy(() =>
  import('@/pages/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
);

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  if (status === 'loading') return <PageLoader label={t('common.loading')} />;
  if (status === 'anonymous')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function AppRoutes() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<PageLoader label={t('common.loading')} />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/b/:slug" element={<BusinessPage />} />
        <Route path="/m/:token" element={<ManagePage />} />
        <Route path="/f/:token" element={<FeedbackPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <BusinessPickerPage />
            </RequireAuth>
          }
        />
        <Route
          path="/app/:businessId"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="agenda" replace />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="staff/:staffId/schedule" element={<StaffSchedulePage />} />
          <Route path="feedback" element={<FeedbackDashboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="team" element={<TeamPage />} />
        </Route>
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
