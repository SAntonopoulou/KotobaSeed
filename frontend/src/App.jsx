import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { InboxProvider } from './context/InboxContext';

// High-traffic, always-needed pages stay eager — auth pages, the landing,
// shell-level layout. Everything else lazy-loads on first navigation,
// keeping the initial bundle small.
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import TeacherRoute from './components/TeacherRoute';
import AdminRoute from './components/AdminRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Landing from './pages/Landing';
import TutorHome from './pages/TutorHome';
import ConsentNotice from './components/ConsentNotice';
import { useTenant } from './hooks/useTenant';

// Lazy-loaded routes — each becomes its own chunk on demand.
const ProjectList = lazy(() => import('./pages/ProjectList'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const RequestList = lazy(() => import('./pages/RequestList'));
const Dashboard = lazy(() => import('./pages/teacher/Dashboard'));
const CreateProject = lazy(() => import('./pages/teacher/CreateProject'));
const EditProject = lazy(() => import('./pages/teacher/EditProject'));
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const Library = lazy(() => import('./pages/Library'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminAuditLog = lazy(() => import('./pages/admin/AdminAuditLog'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminStaff = lazy(() => import('./pages/admin/AdminStaff'));
const ProjectManagement = lazy(() => import('./pages/admin/ProjectManagement'));
const Inbox = lazy(() => import('./pages/Inbox'));
const TeacherReviews = lazy(() => import('./pages/TeacherReviews'));
const Archive = lazy(() => import('./pages/Archive'));
const ArchivedConversations = lazy(() => import('./pages/ArchivedConversations'));
const TeacherArchive = lazy(() => import('./pages/TeacherArchive'));
const StudentArchive = lazy(() => import('./pages/student/Archive'));
const Groups = lazy(() => import('./pages/Groups'));
const Pricing = lazy(() => import('./pages/Pricing'));
const TutorSignup = lazy(() => import('./pages/TutorSignup'));
const OnboardingReturn = lazy(() => import('./pages/OnboardingReturn'));
const OnboardingRefresh = lazy(() => import('./pages/OnboardingRefresh'));
const TutorDashboard = lazy(() => import('./pages/TutorDashboard'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const BookingSuccess = lazy(() => import('./pages/BookingSuccess'));
const BookingCancelled = lazy(() => import('./pages/BookingCancelled'));
const Classroom = lazy(() => import('./pages/Classroom'));
const ArticlesIndex = lazy(() => import('./pages/ArticlesIndex'));
const ArticleReader = lazy(() => import('./pages/ArticleReader'));
const ArticleEditor = lazy(() => import('./pages/ArticleEditor'));
const NewsletterUnsubscribe = lazy(() => import('./pages/NewsletterUnsubscribe'));
const MyAssignments = lazy(() => import('./pages/MyAssignments'));
const TakeAssignment = lazy(() => import('./pages/TakeAssignment'));
const PlacementTest = lazy(() => import('./pages/PlacementTest'));
const ModulesStorefront = lazy(() => import('./pages/ModulesStorefront'));
const ModuleDetail = lazy(() => import('./pages/ModuleDetail'));
const MySubscriptions = lazy(() => import('./pages/MySubscriptions'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const Refunds = lazy(() => import('./pages/Refunds'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Support = lazy(() => import('./pages/Support'));
const StaffSupport = lazy(() => import('./pages/staff/StaffSupport'));
const Referrals = lazy(() => import('./pages/Referrals'));
const AffiliateApply = lazy(() => import('./pages/AffiliateApply'));
const AdminAffiliates = lazy(() => import('./pages/admin/AdminAffiliates'));

const RouteFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <p className="text-kotoba-text/60 text-sm">Loading…</p>
  </div>
);

const TutorShell = () => (
  // Tutor subdomains get their own minimal shell — no apex Kotobaseed nav,
  // no apex Footer. Each page renders its own header below.
  <Suspense fallback={<RouteFallback />}>
  <Routes>
    <Route path="/" element={<TutorHome />} />
    <Route path="/dashboard" element={<TutorDashboard />} />
    <Route path="/dashboard/articles/new" element={<ArticleEditor />} />
    <Route path="/dashboard/articles/:slug/edit" element={<ArticleEditor />} />
    <Route path="/articles" element={<ArticlesIndex />} />
    <Route path="/articles/:slug" element={<ArticleReader />} />
    <Route path="/placement-test" element={<PlacementTest />} />
    <Route path="/modules" element={<ModulesStorefront />} />
    <Route path="/modules/:slug" element={<ModuleDetail />} />
    <Route path="/newsletters/unsubscribe" element={<NewsletterUnsubscribe />} />
    <Route path="/support" element={<Support />} />
    <Route path="/support/:ticketId" element={<Support />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="/refunds" element={<Refunds />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/booking/success" element={<BookingSuccess />} />
    <Route path="/booking/cancelled" element={<BookingCancelled />} />
    <Route path="/classroom/:bookingId" element={<Classroom />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
  </Suspense>
);

const ApexShell = () => {
  const { token } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Navbar />
      <div className="flex-grow">
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={token ? <ProjectList /> : <Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/library" element={<Library />} />
          <Route path="/newsletters/unsubscribe" element={<NewsletterUnsubscribe />} />
          <Route path="/onboarding/tutor" element={<TutorSignup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding/return" element={<OnboardingReturn />} />
            <Route path="/onboarding/refresh" element={<OnboardingRefresh />} />
            <Route path="/classroom/:bookingId" element={<Classroom />} />
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
            <Route path="/student/assignments" element={<MyAssignments />} />
            <Route path="/student/subscriptions" element={<MySubscriptions />} />
            <Route path="/student/assignments/:id" element={<TakeAssignment />} />

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
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/admin/staff" element={<AdminStaff />} />
              <Route path="/admin/affiliates" element={<AdminAffiliates />} />
              <Route path="/admin/projects" element={<ProjectManagement />} />
            </Route>

            {/* Support */}
            <Route path="/support" element={<Support />} />
            <Route path="/support/:ticketId" element={<Support />} />
            <Route path="/staff/support" element={<StaffSupport />} />
            <Route path="/staff/support/:ticketId" element={<StaffSupport />} />

            <Route path="/referrals" element={<Referrals />} />
            <Route path="/affiliates/apply" element={<AffiliateApply />} />

            {/* Messaging Routes */}
            <Route path="/messages" element={<Inbox />} />
            <Route path="/messages/:conversationId" element={<Inbox />} />
            <Route path="/messages/archive" element={<ArchivedConversations />} />
            <Route path="/messages/archive/:conversationId" element={<ArchivedConversations />} />
          </Route>

          {/* Catch-all route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </div>
      <Footer />
    </div>
  );
}

const AppContent = () => {
  const tenant = useTenant();
  return (
    <>
      {tenant.kind === 'tutor' ? <TutorShell /> : <ApexShell />}
      <ConsentNotice />
    </>
  );
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
