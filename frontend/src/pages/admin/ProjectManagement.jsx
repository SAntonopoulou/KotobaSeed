import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useToast } from '../../context/ToastContext';

const ProjectManagement = () => {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const { addToast } = useToast();

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const response = await client.get('/admin/projects');
      setProjects(response.data);
    } catch (error) {
      addToast('Error fetching projects', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCleanupClick = () => {
    setIsCleanupModalOpen(true);
  };

  const handleConfirmCleanup = async () => {
    try {
      const response = await client.post('/admin/projects/cleanup-abandoned');
      addToast(response.data.message, 'success');
      fetchProjects();
    } catch (error) {
      addToast(error.response?.data?.detail || error.message, 'error');
    } finally {
      setIsCleanupModalOpen(false);
    }
  };

  const handleCancelClick = (project) => {
    setSelectedProject(project);
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedProject) return;
    try {
      await client.delete(`/admin/projects/${selectedProject.id}`);
      addToast(`Project "${selectedProject.title}" has been successfully cancelled.`, 'success');
      fetchProjects();
    } catch (error) {
      addToast(error.response?.data?.detail || error.message, 'error');
    } finally {
      setIsCancelModalOpen(false);
      setSelectedProject(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'funding':
        return 'bg-kotoba-secondary/20 text-kotoba-text';
      case 'successful':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-kotoba-background/60 text-kotoba-text/90';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-kotoba-text">Project Management</h1>
        <button
          className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md shadow-sm"
          onClick={handleCleanupClick}
        >
          Clean Up Abandoned Projects
        </button>
      </div>

      <div className="bg-white shadow sm:rounded-md overflow-x-auto">
        <table className="min-w-full divide-y divide-kotoba-text/10">
          <thead className="bg-kotoba-background/40">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">Teacher</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">Funding</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-kotoba-text/10">
            {projects.map((project) => (
              <tr key={project.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-kotoba-text">{project.title}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-kotoba-text/60">{project.teacher?.full_name || 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-kotoba-text/60">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(project.status)}`}>
                    {project.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap text-sm text-kotoba-text/60">€{(project.current_funding / 100).toFixed(2)} / €{(project.funding_goal / 100).toFixed(2)}</td>
                <td className="px-6 py-4 text-right whitespace-nowrap text-sm font-medium">
                  {project.status !== 'completed' && project.status !== 'cancelled' && (
                    <button
                      className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-md shadow-sm"
                      onClick={() => handleCancelClick(project)}
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmationModal
        isOpen={isCleanupModalOpen}
        onClose={() => setIsCleanupModalOpen(false)}
        onConfirm={handleConfirmCleanup}
        title="Clean up abandoned projects"
        message="Cancel every project that belonged to a deleted teacher? This is irreversible and triggers refunds to every backer."
        confirmText="Cancel projects + refund"
        isDanger
      />

      <ConfirmationModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={handleConfirmCancel}
        title="Cancel project"
        message={`Cancel "${selectedProject?.title}"? Every backer will be refunded.`}
        confirmText="Cancel + refund"
        isDanger
      />
    </div>
  );
};

export default ProjectManagement;
