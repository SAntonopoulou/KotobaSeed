import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import client from '../../api/client';
import LinkVideoModal from '../../components/VideoUpload';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useToast } from '../../context/ToastContext';

const Dashboard = () => {
  const [projects, setProjects] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({});
  
  const { addToast } = useToast();
  const location = useLocation();

  const fetchData = async () => {
    try {
      const userRes = await client.get('/users/me');
      setUser(userRes.data);
      
      const projectsRes = await client.get('/projects/me');
      const activeProjects = projectsRes.data.filter(p => p.status !== 'cancelled');
      setProjects(activeProjects);
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
      addToast("Failed to load dashboard data", 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('stripe_return') === 'true') {
      addToast("Stripe account connected! Your status will update shortly.", 'info');
      const timer = setTimeout(() => {
        fetchData();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [addToast, location.search]);

  const handleSetupPayouts = async () => {
    try {
      const response = await client.post('/users/stripe-onboarding-link');
      window.location.href = response.data.onboarding_url;
    } catch (error) {
      console.error("Failed to setup payouts", error);
      addToast("Failed to initiate Stripe onboarding.", 'error');
    }
  };

  const handleLinkVideo = (projectId) => {
    setSelectedProjectId(projectId);
    setShowVideoModal(true);
  };

  const handleVideoLinkSuccess = () => {
    setShowVideoModal(false);
    addToast("Video linked successfully!", 'success');
    fetchData();
  };

  const confirmMarkAsReady = (projectId) => {
    setModalConfig({
      title: "Mark Project as Ready",
      message: "Are you sure? This will notify all backers to confirm the project is complete.",
      confirmText: "Mark as Ready",
      isDanger: false,
      onConfirm: () => handleMarkAsReady(projectId)
    });
    setModalOpen(true);
  };

  const handleMarkAsReady = async (projectId) => {
    setModalOpen(false);
    try {
      await client.post(`/projects/${projectId}/complete`);
      fetchData();
      addToast("Confirmation requested from students. You will be notified when the project is confirmed and funds are released.", 'success');
    } catch (error) {
      console.error("Failed to mark as ready", error);
      addToast(error.response?.data?.detail || "Failed to mark as ready.", 'error');
    }
  };

  const confirmCancelProject = (projectId) => {
    setModalConfig({
      title: "Cancel Project",
      message: "Are you sure? This will refund all backers and cannot be undone.",
      confirmText: "Cancel Project",
      isDanger: true,
      onConfirm: () => handleCancelProject(projectId)
    });
    setModalOpen(true);
  };

  const handleCancelProject = async (projectId) => {
      setModalOpen(false);
      try {
          await client.post(`/projects/${projectId}/cancel`);
          fetchData();
          addToast("Project cancelled and refunds initiated.", 'success');
      } catch (error) {
          console.error("Failed to cancel project", error);
          addToast(error.response?.data?.detail || "Failed to cancel project.", 'error');
      }
  };

  if (loading) return <div className="p-10 text-center">Loading dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Teacher Dashboard</h1>
        <Link
          to="/teacher/create-project"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none"
        >
          Create New Project
        </Link>
      </div>

      {!user?.tutor_slug && (
        <div className="bg-gradient-to-r from-kotoba-primary to-green-700 rounded-2xl p-6 text-white shadow-md mb-8">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold mb-2">Get your own tutoring site</h2>
              <p className="text-sm opacity-90 leading-relaxed">
                Run one-to-one lessons at <span className="font-mono">yourname.kotobaseed.net</span> alongside the marketplace.
                Bookings, lesson packs, classroom video, payouts via Stripe — all yours.
                On Pro you keep 100% of what students pay you.
              </p>
            </div>
            <Link
              to="/onboarding/tutor"
              className="inline-flex items-center px-5 py-2.5 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark whitespace-nowrap"
            >
              Set up my tutor site →
            </Link>
          </div>
        </div>
      )}

      {!user?.stripe_account_id && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                You need to setup payouts to receive funds.
                <button
                  onClick={handleSetupPayouts}
                  className="ml-2 font-medium underline hover:text-yellow-600 focus:outline-none"
                >
                  Setup Payouts
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {projects.length === 0 ? (
            <li className="px-4 py-4 sm:px-6 text-center text-gray-500">
              No active projects. Create one to get started!
            </li>
          ) : (
            projects.map((project) => {
              const videoCount = project.videos ? project.videos.length : 0;
              let isMarkAsReadyDisabled = false;
              let markAsReadyTooltip = "";

              if (project.is_series) {
                if (project.num_videos === null || videoCount !== project.num_videos) {
                  isMarkAsReadyDisabled = true;
                  markAsReadyTooltip = `For this series project, exactly ${project.num_videos || 'the specified'} videos must be uploaded. Currently ${videoCount} uploaded.`;
                }
              } else {
                if (videoCount !== 1) {
                  isMarkAsReadyDisabled = true;
                  markAsReadyTooltip = `For a single video project, exactly 1 video must be uploaded. Currently ${videoCount} uploaded.`;
                }
              }

              let canLinkVideo = false;
              if (project.is_series) {
                canLinkVideo = project.num_videos !== null && videoCount < project.num_videos;
              } else {
                canLinkVideo = videoCount < 1;
              }

              return (
                <li key={project.id}>
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                          <Link to={`/projects/${project.id}`} className="text-sm font-medium text-kotoba-primary hover:text-kotoba-primary truncate">
                            {project.title}
                          </Link>
                          <p className="text-xs text-gray-500">Status: {project.status}</p>
                          {project.is_series && (
                            <p className="text-xs text-gray-500">Videos uploaded: {videoCount} / {project.num_videos}</p>
                          )}
                      </div>
                      <div className="ml-2 flex-shrink-0 flex space-x-2">
                        {project.status === 'draft' && (
                          <Link
                            to={`/teacher/projects/${project.id}/edit`}
                            className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200"
                          >
                            Edit
                          </Link>
                        )}
                        
                        {project.status === 'successful' && (
                          <>
                            {canLinkVideo && (
                              <button
                                onClick={() => handleLinkVideo(project.id)}
                                className="px-2 py-1 text-xs font-semibold rounded-full bg-kotoba-secondary/20 text-kotoba-text hover:bg-kotoba-primary/90"
                              >
                                Link Video
                              </button>
                            )}
                            <button
                              onClick={() => confirmMarkAsReady(project.id)}
                              className={`px-2 py-1 text-xs font-semibold rounded-full ${isMarkAsReadyDisabled ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-green-100 text-green-800 hover:bg-green-200'}`}
                              disabled={isMarkAsReadyDisabled}
                              title={markAsReadyTooltip}
                            >
                              Mark as Ready
                            </button>
                          </>
                        )}

                        {project.status !== 'completed' && project.status !== 'cancelled' && (
                            <button
                              onClick={() => confirmCancelProject(project.id)}
                              className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 hover:bg-red-200"
                            >
                                Cancel
                            </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-500">
                          Goal: €{(project.funding_goal / 100).toFixed(2)}
                        </p>
                        <p className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                          Raised: €{(project.current_funding / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {showVideoModal && (
        <LinkVideoModal
            projectId={selectedProjectId} 
            onClose={() => setShowVideoModal(false)}
            onSuccess={handleVideoLinkSuccess}
        />
      )}

      <ConfirmationModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText={modalConfig.confirmText}
        isDanger={modalConfig.isDanger}
      />
    </div>
  );
};

export default Dashboard;
