import React, { Suspense, lazy, useEffect, useState } from 'react';
import client from './api/client';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DemoProvider } from './context/DemoContext';
import DemoBar from './components/demo/DemoBar';
import DemoTour from './components/demo/DemoTour';
import { ToastProvider } from './context/ToastContext';
import { InboxProvider } from './context/InboxContext';
import { MaintenanceProvider } from './context/MaintenanceContext';
import MaintenanceSurface from './components/MaintenanceSurface';
import { ModalProvider } from './context/ModalContext';

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
import Landing from './pages/LandingV2';
const GroupsIndex = lazy(() => import('./pages/GroupsIndex'));
const GroupDetail = lazy(() => import('./pages/GroupDetail'));
const GroupThreads = lazy(() => import('./pages/GroupThreads'));
const GroupThreadDetail = lazy(() => import('./pages/GroupThreadDetail'));
const Try = lazy(() => import('./pages/Try'));
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
const StudentTutors = lazy(() => import('./pages/student/Tutors'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const Library = lazy(() => import('./pages/Library'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminAuditLog = lazy(() => import('./pages/admin/AdminAuditLog'));
const AdminDatabase = lazy(() => import('./pages/admin/AdminDatabase'));
const AdminGrants = lazy(() => import('./pages/admin/AdminGrants'));
const AdminCustomThemes = lazy(() => import('./pages/admin/AdminCustomThemes'));
const AdminCustomThemesV2List = lazy(() => import('./pages/admin/AdminCustomThemesV2List'));
const AdminCustomThemeV2Editor = lazy(() => import('./pages/admin/AdminCustomThemeV2Editor'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminStaff = lazy(() => import('./pages/admin/AdminStaff'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminAnnouncements = lazy(() => import('./pages/admin/AdminAnnouncements'));
const AdminMaintenance = lazy(() => import('./pages/admin/AdminMaintenance'));
const AdminDemoTrials = lazy(() => import('./pages/admin/AdminDemoTrials'));
const ProjectManagement = lazy(() => import('./pages/admin/ProjectManagement'));
const Inbox = lazy(() => import('./pages/Inbox'));
const TeacherReviews = lazy(() => import('./pages/TeacherReviews'));
const Archive = lazy(() => import('./pages/Archive'));
const ArchivedConversations = lazy(() => import('./pages/ArchivedConversations'));
const TeacherArchive = lazy(() => import('./pages/TeacherArchive'));
const StudentArchive = lazy(() => import('./pages/student/Archive'));
const Pricing = lazy(() => import('./pages/Pricing'));
const TutorSignup = lazy(() => import('./pages/TutorSignup'));
const OnboardingReturn = lazy(() => import('./pages/OnboardingReturn'));
const OnboardingRefresh = lazy(() => import('./pages/OnboardingRefresh'));
const TutorDashboard = lazy(() => import('./pages/TutorDashboard'));
const TutorOnboardingWizard = lazy(() => import('./pages/TutorOnboardingWizard'));
const TutorGettingStarted = lazy(() => import('./pages/TutorGettingStarted'));
const TeamAccept = lazy(() => import('./pages/TeamAccept'));
const Discover = lazy(() => import('./pages/Discover'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const BookingSuccess = lazy(() => import('./pages/BookingSuccess'));
const BookingCancelled = lazy(() => import('./pages/BookingCancelled'));
const Classroom = lazy(() => import('./pages/Classroom'));
const DemoClassroom = lazy(() => import('./pages/DemoClassroom'));
const ArticlesIndex = lazy(() => import('./pages/ArticlesIndex'));
const ArticleReader = lazy(() => import('./pages/ArticleReader'));
// Vasso-greek themed surfaces. ThemedRoute picks the bespoke variant
// when the tenant tutor's theme === 'vasso-greek', otherwise falls
// back to the default kotobaseed page. The default page is mounted
// directly for every other tutor so there's zero behaviour change
// for them.
const ThemedRoute = lazy(() => import('./themes/vasso_greek/ThemedRoute'));
const VassoArticlesIndex = lazy(() => import('./themes/vasso_greek/VassoArticlesIndex'));
const VassoArticleReader = lazy(() => import('./themes/vasso_greek/VassoArticleReader'));
const VassoModulesStorefront = lazy(() => import('./themes/vasso_greek/VassoModulesStorefront'));
const VassoModuleDetail = lazy(() => import('./themes/vasso_greek/VassoModuleDetail'));
const VassoReviews = lazy(() => import('./themes/vasso_greek/VassoReviews'));
const VassoLogin = lazy(() => import('./themes/vasso_greek/VassoLogin'));
const VassoRegister = lazy(() => import('./themes/vasso_greek/VassoRegister'));
const VassoForgotPassword = lazy(() => import('./themes/vasso_greek/VassoForgotPassword'));
const VassoBookingSuccess = lazy(() => import('./themes/vasso_greek/VassoBookingSuccess'));
const VassoBookingCancelled = lazy(() => import('./themes/vasso_greek/VassoBookingCancelled'));
const VassoClassroom = lazy(() => import('./themes/vasso_greek/VassoClassroom'));
const VassoResetPassword = lazy(() => import('./themes/vasso_greek/VassoResetPassword'));
const VassoVerifyEmail = lazy(() => import('./themes/vasso_greek/VassoVerifyEmail'));
// Dafni-botanical themed surfaces. ThemedRoute picks Dafni's variant
// when the tenant's theme === 'custom-dafni', mirroring Vasso's setup.
const DafniArticlesIndex = lazy(() => import('./themes/dafni_botanical/DafniArticlesIndex'));
const DafniArticleReader = lazy(() => import('./themes/dafni_botanical/DafniArticleReader'));
const DafniModulesStorefront = lazy(() => import('./themes/dafni_botanical/DafniModulesStorefront'));
const DafniModuleDetail = lazy(() => import('./themes/dafni_botanical/DafniModuleDetail'));
const DafniReviews = lazy(() => import('./themes/dafni_botanical/DafniReviews'));
const DafniLogin = lazy(() => import('./themes/dafni_botanical/DafniLogin'));
const DafniRegister = lazy(() => import('./themes/dafni_botanical/DafniRegister'));
const DafniForgotPassword = lazy(() => import('./themes/dafni_botanical/DafniForgotPassword'));
const DafniBookingSuccess = lazy(() => import('./themes/dafni_botanical/DafniBookingSuccess'));
const DafniBookingCancelled = lazy(() => import('./themes/dafni_botanical/DafniBookingCancelled'));
const DafniClassroom = lazy(() => import('./themes/dafni_botanical/DafniClassroom'));
const DafniResetPassword = lazy(() => import('./themes/dafni_botanical/DafniResetPassword'));
const DafniVerifyEmail = lazy(() => import('./themes/dafni_botanical/DafniVerifyEmail'));
// Sophia-inkwell themed surfaces (third bespoke pack).
const SophiaArticlesIndex = lazy(() => import('./themes/sophia_inkwell/SophiaArticlesIndex'));
const SophiaArticleReader = lazy(() => import('./themes/sophia_inkwell/SophiaArticleReader'));
const SophiaModulesStorefront = lazy(() => import('./themes/sophia_inkwell/SophiaModulesStorefront'));
const SophiaModuleDetail = lazy(() => import('./themes/sophia_inkwell/SophiaModuleDetail'));
const SophiaReviews = lazy(() => import('./themes/sophia_inkwell/SophiaReviews'));
const SophiaLogin = lazy(() => import('./themes/sophia_inkwell/SophiaLogin'));
const SophiaRegister = lazy(() => import('./themes/sophia_inkwell/SophiaRegister'));
const SophiaForgotPassword = lazy(() => import('./themes/sophia_inkwell/SophiaForgotPassword'));
const SophiaBookingSuccess = lazy(() => import('./themes/sophia_inkwell/SophiaBookingSuccess'));
const SophiaBookingCancelled = lazy(() => import('./themes/sophia_inkwell/SophiaBookingCancelled'));
const SophiaClassroom = lazy(() => import('./themes/sophia_inkwell/SophiaClassroom'));
const SophiaResetPassword = lazy(() => import('./themes/sophia_inkwell/SophiaResetPassword'));
const SophiaVerifyEmail = lazy(() => import('./themes/sophia_inkwell/SophiaVerifyEmail'));
const ArticleEditor = lazy(() => import('./pages/ArticleEditor'));
const NewsletterUnsubscribe = lazy(() => import('./pages/NewsletterUnsubscribe'));
const NewsletterConfirmSubscription = lazy(() => import('./pages/NewsletterConfirmSubscription'));
const NewsletterSubscriberUnsubscribe = lazy(() => import('./pages/NewsletterSubscriberUnsubscribe'));
const MyAssignments = lazy(() => import('./pages/MyAssignments'));
const TakeAssignment = lazy(() => import('./pages/TakeAssignment'));
const PlacementTest = lazy(() => import('./pages/PlacementTest'));
const ModulesStorefront = lazy(() => import('./pages/ModulesStorefront'));
const ModuleDetail = lazy(() => import('./pages/ModuleDetail'));
const MySubscriptions = lazy(() => import('./pages/MySubscriptions'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const Refunds = lazy(() => import('./pages/Refunds'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));
const AcceptableUse = lazy(() => import('./pages/AcceptableUse'));
const TutorAgreement = lazy(() => import('./pages/TutorAgreement'));
const ReportContent = lazy(() => import('./pages/ReportContent'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Support = lazy(() => import('./pages/Support'));
const StaffSupport = lazy(() => import('./pages/staff/StaffSupport'));
const Referrals = lazy(() => import('./pages/Referrals'));
const AffiliateApply = lazy(() => import('./pages/AffiliateApply'));
const AdminAffiliates = lazy(() => import('./pages/admin/AdminAffiliates'));
const Help = lazy(() => import('./pages/Help'));
const Status = lazy(() => import('./pages/Status'));
const ContactTutor = lazy(() => import('./pages/ContactTutor'));

const RouteFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <p className="text-kotoba-text/60 text-sm">Loading…</p>
  </div>
);

// Apply the tutor's chosen theme class to every tenant route, not just
// the homepage. Previously the themeClass was scoped to TutorHome's
// outermost div, so navigating from `/` to `/articles` or `/classroom`
// reverted to the default sage palette mid-session. Fetching once at
// shell mount and stamping the class on the wrapper means every nested
// route inherits the right theme via Tailwind's nesting tokens.
const TutorShell = () => {
  const [theme, setTheme] = useState('sage');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/tutor/me');
        if (!cancelled && res.data?.theme) setTheme(res.data.theme);
      } catch {
        // Anonymous browse or backend hiccup — fall back to default.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    // Tutor subdomains get their own minimal shell — no apex Kotobaseed nav,
    // no apex Footer. Each page renders its own header below.
    <div className={`theme-${theme} min-h-screen`}>
      <Suspense fallback={null}>
        <AnnouncementBanner />
      </Suspense>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
    <Route path="/" element={<TutorHome />} />
    <Route path="/dashboard" element={<TutorDashboard />} />
    {/* Legacy reading-based wizard retired; redirect any inbound link to
        the dashboard where the interactive mascot-led tour auto-starts. */}
    <Route path="/onboarding/tutor" element={<Navigate to="/dashboard" replace />} />
    <Route path="/onboarding/tutor/:moduleKey" element={<Navigate to="/dashboard" replace />} />
    <Route path="/onboarding/team-accept" element={<TeamAccept />} />
    <Route path="/discover" element={<Discover />} />
    <Route path="/dashboard/articles/new" element={<ArticleEditor />} />
    <Route path="/dashboard/articles/:slug/edit" element={<ArticleEditor />} />
    <Route path="/articles" element={<ThemedRoute themes={{ 'custom-vasso': VassoArticlesIndex, 'vasso-greek': VassoArticlesIndex, 'custom-dafni': DafniArticlesIndex, 'custom-sophia': SophiaArticlesIndex }} fallback={ArticlesIndex} />} />
    <Route path="/articles/:slug" element={<ThemedRoute themes={{ 'custom-vasso': VassoArticleReader, 'vasso-greek': VassoArticleReader, 'custom-dafni': DafniArticleReader, 'custom-sophia': SophiaArticleReader }} fallback={ArticleReader} />} />
    <Route path="/placement-test" element={<PlacementTest />} />
    <Route path="/modules" element={<ThemedRoute themes={{ 'custom-vasso': VassoModulesStorefront, 'vasso-greek': VassoModulesStorefront, 'custom-dafni': DafniModulesStorefront, 'custom-sophia': SophiaModulesStorefront }} fallback={ModulesStorefront} />} />
    <Route path="/modules/:slug" element={<ThemedRoute themes={{ 'custom-vasso': VassoModuleDetail, 'vasso-greek': VassoModuleDetail, 'custom-dafni': DafniModuleDetail, 'custom-sophia': SophiaModuleDetail }} fallback={ModuleDetail} />} />
    {/* /reviews is a per-theme route — each bespoke theme renders its own
        page; every other tenant falls back to a redirect to the landing's
        #reviews anchor for the same experience as today. */}
    <Route path="/reviews" element={<ThemedRoute themes={{ 'custom-vasso': VassoReviews, 'vasso-greek': VassoReviews, 'custom-dafni': DafniReviews, 'custom-sophia': SophiaReviews }} fallback={() => <Navigate to="/#reviews" replace />} />} />
    <Route path="/newsletters/unsubscribe" element={<NewsletterUnsubscribe />} />
    <Route path="/newsletters/confirm" element={<NewsletterConfirmSubscription />} />
    <Route path="/newsletters/subscriber-unsubscribe" element={<NewsletterSubscriberUnsubscribe />} />
    <Route path="/support" element={<Support />} />
    <Route path="/support/:ticketId" element={<Support />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="/refunds" element={<Refunds />} />
    <Route path="/legal/cookies" element={<CookiePolicy />} />
    <Route path="/legal/acceptable-use" element={<AcceptableUse />} />
    <Route path="/legal/tutor-agreement" element={<TutorAgreement />} />
    <Route path="/legal/report-content" element={<ReportContent />} />
    <Route path="/forgot-password" element={<ThemedRoute themes={{ 'custom-vasso': VassoForgotPassword, 'vasso-greek': VassoForgotPassword, 'custom-dafni': DafniForgotPassword, 'custom-sophia': SophiaForgotPassword }} fallback={ForgotPassword} />} />
    <Route path="/reset-password" element={<ThemedRoute themes={{ 'custom-vasso': VassoResetPassword, 'vasso-greek': VassoResetPassword, 'custom-dafni': DafniResetPassword, 'custom-sophia': SophiaResetPassword }} fallback={ResetPassword} />} />
    <Route path="/help" element={<Help />} />
    <Route path="/help/tutor-getting-started" element={<TutorGettingStarted />} />
    <Route path="/status" element={<Status />} />
    <Route path="/login" element={<ThemedRoute themes={{ 'custom-vasso': VassoLogin, 'vasso-greek': VassoLogin, 'custom-dafni': DafniLogin, 'custom-sophia': SophiaLogin }} fallback={Login} />} />
    <Route path="/register" element={<ThemedRoute themes={{ 'custom-vasso': VassoRegister, 'vasso-greek': VassoRegister, 'custom-dafni': DafniRegister, 'custom-sophia': SophiaRegister }} fallback={Register} />} />
    <Route path="/verify-email" element={<ThemedRoute themes={{ 'custom-vasso': VassoVerifyEmail, 'vasso-greek': VassoVerifyEmail, 'custom-dafni': DafniVerifyEmail, 'custom-sophia': SophiaVerifyEmail }} fallback={VerifyEmail} />} />
    <Route path="/booking/success" element={<ThemedRoute themes={{ 'custom-vasso': VassoBookingSuccess, 'vasso-greek': VassoBookingSuccess, 'custom-dafni': DafniBookingSuccess, 'custom-sophia': SophiaBookingSuccess }} fallback={BookingSuccess} />} />
    <Route path="/booking/cancelled" element={<ThemedRoute themes={{ 'custom-vasso': VassoBookingCancelled, 'vasso-greek': VassoBookingCancelled, 'custom-dafni': DafniBookingCancelled, 'custom-sophia': SophiaBookingCancelled }} fallback={BookingCancelled} />} />
    <Route path="/classroom/:bookingId" element={<ThemedRoute themes={{ 'custom-vasso': VassoClassroom, 'vasso-greek': VassoClassroom, 'custom-dafni': DafniClassroom, 'custom-sophia': SophiaClassroom }} fallback={Classroom} />} />
    {/* Practice classroom — internal back-office surface, not themed per
        tenant. Tutor-only; access is gated server-side. */}
    <Route path="/demo-classroom" element={<DemoClassroom />} />
    <Route path="/contact" element={<ContactTutor />} />
    {/* Tutor self-service surfaces — mounted on the tenant shell so tutors
        never need to cross to the apex to manage their own account,
        timezone, subscription, or profile. */}
    <Route path="/settings" element={<Settings />} />
    <Route path="/profile/:id" element={<Profile />} />
    <Route path="/pricing" element={<Pricing />} />
    <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </div>
  );
};

const NextLessonBanner = lazy(() => import('./components/NextLessonBanner'));
const AnnouncementBanner = lazy(() => import('./components/AnnouncementBanner'));

const ApexShell = () => {
  // Source-of-truth auth state. AuthContext.currentUser reflects the
  // shared .kotobaseed.net cookie, not per-origin localStorage.
  const { currentUser } = useAuth();

  return (
    <div className="min-h-screen bg-kotoba-background/60 flex flex-col">
      <Navbar />
      <Suspense fallback={null}>
        <AnnouncementBanner />
      </Suspense>
      <Suspense fallback={null}>
        <NextLessonBanner />
      </Suspense>
      <div className="flex-grow">
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={currentUser ? <ProjectList /> : <Landing />} />
          <Route path="/try/tutor" element={<Try role="tutor" />} />
          <Route path="/try/creator" element={<Try role="creator" />} />
          <Route path="/try/student" element={<Try role="student" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/library" element={<Library />} />
          <Route path="/newsletters/unsubscribe" element={<NewsletterUnsubscribe />} />
    <Route path="/newsletters/confirm" element={<NewsletterConfirmSubscription />} />
    <Route path="/newsletters/subscriber-unsubscribe" element={<NewsletterSubscriberUnsubscribe />} />
          <Route path="/onboarding/tutor" element={<TutorSignup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/legal/cookies" element={<CookiePolicy />} />
          <Route path="/legal/acceptable-use" element={<AcceptableUse />} />
          <Route path="/legal/tutor-agreement" element={<TutorAgreement />} />
          <Route path="/legal/report-content" element={<ReportContent />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/help" element={<Help />} />
          <Route path="/help/tutor-getting-started" element={<TutorGettingStarted />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/groups" element={<GroupsIndex />} />
          <Route path="/groups/:slug" element={<GroupDetail />} />
          <Route path="/groups/:slug/threads" element={<GroupThreads />} />
          <Route path="/groups/:slug/threads/:threadId" element={<GroupThreadDetail />} />
          <Route path="/status" element={<Status />} />

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
            <Route path="/student/tutors" element={<StudentTutors />} />
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
              <Route path="/admin/database" element={<AdminDatabase />} />
              <Route path="/admin/grants" element={<AdminGrants />} />
              <Route path="/admin/custom-themes" element={<AdminCustomThemes />} />
              <Route path="/admin/custom-themes/v2" element={<AdminCustomThemesV2List />} />
              <Route path="/admin/custom-themes/v2/new" element={<AdminCustomThemeV2Editor />} />
              <Route path="/admin/custom-themes/v2/:id/edit" element={<AdminCustomThemeV2Editor />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/admin/staff" element={<AdminStaff />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/admin/announcements" element={<AdminAnnouncements />} />
              <Route path="/admin/maintenance" element={<AdminMaintenance />} />
              <Route path="/admin/demo-trials" element={<AdminDemoTrials />} />
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
      <ModalProvider>
        <AuthProvider>
          <DemoProvider>
            <InboxProvider>
              <MaintenanceProvider>
                <Router>
                  {/* Demo bar — shown only when the current session is
                      a demo account. Above MaintenanceSurface so demo
                      visitors see the explanation before any
                      maintenance banner. */}
                  <DemoBar />
                  {/* Persistent tour engine — renders the mascot once
                      so it visibly travels between pages. Auto-no-ops
                      when the session isn't a demo. */}
                  <DemoTour />
                  {/* Maintenance banner/modal renders above every route
                      but suppresses itself on /classroom/* so an
                      in-progress lesson isn't kicked out. */}
                  <MaintenanceSurface />
                  <AppContent />
                </Router>
              </MaintenanceProvider>
            </InboxProvider>
          </DemoProvider>
        </AuthProvider>
      </ModalProvider>
    </ToastProvider>
  );
}

export default App;
