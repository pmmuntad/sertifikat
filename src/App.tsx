import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, RequireOrganization } from './components/ProtectedRoute';
import { DashboardLayout } from './components/DashboardLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { EventListPage } from './pages/dashboard/EventListPage';
import { EventCreatePage } from './pages/dashboard/EventCreatePage';
import { EventDetailPage } from './pages/dashboard/EventDetailPage';
import { FormBuilderPage } from './pages/dashboard/FormBuilderPage';
import { TemplateManagerPage } from './pages/dashboard/TemplateManagerPage';
import { TemplateEditorPage } from './pages/dashboard/TemplateEditorPage';
import { CommitteeManagerPage } from './pages/dashboard/CommitteeManagerPage';
import { LiveMonitorPage } from './pages/dashboard/LiveMonitorPage';
import { ProjectorPage } from './pages/dashboard/ProjectorPage';
import { WhatsAppSessionsPage } from './pages/dashboard/WhatsAppSessionsPage';
import { AttendanceFormPage } from './pages/public/AttendanceFormPage';
import { CertificateVerificationPage } from './pages/public/CertificateVerificationPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      {/* Publik: peserta absen via QR, dan verifikasi sertifikat siapa pun */}
      <Route path="/attend/:eventId" element={<AttendanceFormPage />} />
      <Route path="/verify/:certificateId" element={<CertificateVerificationPage />} />

      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />

      {/* Dashboard (perlu login + organisasi aktif) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<RequireOrganization />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<EventListPage />} />
            <Route path="events/new" element={<EventCreatePage />} />
            <Route path="events/:eventId" element={<EventDetailPage />} />
            <Route path="events/:eventId/form-builder" element={<FormBuilderPage />} />
            <Route path="events/:eventId/templates" element={<TemplateManagerPage />} />
            <Route path="events/:eventId/templates/:templateId/editor" element={<TemplateEditorPage />} />
            <Route path="events/:eventId/committee" element={<CommitteeManagerPage />} />
            <Route path="events/:eventId/monitor" element={<LiveMonitorPage />} />
            <Route path="events/:eventId/projector" element={<ProjectorPage />} />
            <Route path="wa-sessions" element={<WhatsAppSessionsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
