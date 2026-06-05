import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { InboxProvider } from './context/InboxContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import ProjectList from './pages/ProjectList';
import ProjectDetail from './pages/ProjectDetail';
import RequestList from './pages/RequestList';
import TeacherRoute from './components/TeacherRoute';
import AdminRoute from './components/AdminRoute';
import Dashboard from './pages/teacher/Dashboard';
import CreateProject from './pages/teacher/CreateProject';
import EditProject from './pages/teacher/EditProject';
import StudentDashboard from './pages/student/Dashboard';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Landing from './pages/Landing';
import AdminDashboard from './pages/admin/AdminDashboard';
import ProjectManagement from './pages/admin/ProjectManagement';
import Inbox from './pages/Inbox';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import TeacherReviews from './pages/TeacherReviews';
import Archive from './pages/Archive';
import ArchivedConversations from './pages/ArchivedConversations';
import TeacherArchive from './pages/TeacherArchive';
import StudentArchive from './pages/student/Archive';
import Groups from './pages/Groups';
import Pricing from './pages/Pricing';
import TutorSignup from './pages/TutorSignup';
import OnboardingReturn from './pages/OnboardingReturn';
import OnboardingRefresh from './pages/OnboardingRefresh';
import TutorHome from './pages/TutorHome';
import TutorDashboard from './pages/TutorDashboard';
import VerifyEmail from './pages/VerifyEmail';
import { useTenant } from './hooks/useTenant';

const TutorShell = () => (
  // Tutor subdomains get their own minimal shell — no apex Kotobaseed nav,
  // no apex Footer. Each page renders its own header below.
  <Routes>
    <Route path="/" element={<TutorHome />} />
    <Route path="/dashboard" element={<TutorDashboard />} />
    <Route path="/login" element={<Login />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

const ApexShell = () => {
  const { token } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Navbar />
      <div className="flex-grow">
        <Routes>
          <Route path="/" element={token ? <ProjectList /> : <Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/onboarding/tutor" element={<TutorSignup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding/return" element={<OnboardingReturn />} />
            <Route path="/onboarding/refresh" element={<OnboardingRefresh />} />
            <Route path="/projects" element={<ProjectList />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/requests" element={<RequestList />} />
            <Route path="/profile/:id" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/teacher/:id/reviews" element={<TeacherReviews />} />
            <Route path="/teacher/:id/archive" element={<TeacherArchive />} />

            {/* Student Routes */}
            <Route path="/student/dashboard" element={<StudentDashboard />} />
            <Route path="/student/:id/archive" element={<StudentArchive />} />

            {/* Teacher Routes */}
            <Route element={<TeacherRoute />}>
              <Route path="/teacher/dashboard" element={<Dashboard />} />
              <Route path="/teacher/create-project" element={<CreateProject />} />
              <Route path="/teacher/projects/:id/edit" element={<EditProject />} />
            </Route>

            {/* Admin Routes */}
            <Route element={<AdminRoute />}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/audit-log" element={<AdminAuditLog />} />
              <Route path="/admin/projects" element={<ProjectManagement />} />
            </Route>

            {/* Messaging Routes */}
            <Route path="/messages" element={<Inbox />} />
            <Route path="/messages/:conversationId" element={<Inbox />} />
            <Route path="/messages/archive" element={<ArchivedConversations />} />
            <Route path="/messages/archive/:conversationId" element={<ArchivedConversations />} />
          </Route>

          {/* Catch-all route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <Footer />
    </div>
  );
}

const AppContent = () => {
  const tenant = useTenant();
  return tenant.kind === 'tutor' ? <TutorShell /> : <ApexShell />;
};

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <InboxProvider>
          <Router>
            <AppContent />
          </Router>
        </InboxProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
