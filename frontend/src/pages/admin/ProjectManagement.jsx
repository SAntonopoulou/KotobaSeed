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
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Project Management</h1>
        <button
          className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md shadow-sm"
          onClick={handleCleanupClick}
        >
          Clean Up Abandoned Projects
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teacher</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Funding</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {projects.map((project) => (
              <tr key={project.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{project.title}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{project.teacher?.full_name || 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(project.status)}`}>
                    {project.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap text-sm text-gray-500">€{(project.current_funding / 100).toFixed(2)} / €{(project.funding_goal / 100).toFixed(2)}</td>
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
        title="Confirm Abandoned Project Cleanup"
        message="Are you sure you want to cancel all projects from deleted teachers? This action is irreversible and will trigger refunds to all backers."
      />

      <ConfirmationModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={handleConfirmCancel}
        title="Confirm Project Cancellation"
        message={`Are you sure you want to cancel the project "${selectedProject?.title}"? This will refund all backers.`}
      />
    </div>
  );
};

export default ProjectManagement;
