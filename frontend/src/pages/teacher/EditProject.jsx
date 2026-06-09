import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';

const EditProject = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [project, setProject] = useState({
    title: '',
    description: '',
    language: '',
    level: '',
    funding_goal: 0,
    delivery_days: 0,
    tags: '',
    project_image_url: '',
    series_intro_video_url: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const response = await client.get(`/projects/${id}`);
        setProject(response.data);
      } catch (error) {
        console.error("Failed to fetch project", error);
        addToast("Failed to load project data.", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [id, addToast]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProject(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...project,
        funding_goal: parseInt(project.funding_goal, 10),
        delivery_days: parseInt(project.delivery_days, 10),
      };
      await client.patch(`/projects/${id}`, payload);
      addToast("Project updated successfully!", "success");
      navigate('/teacher/dashboard');
    } catch (error) {
      console.error("Failed to update project", error);
      addToast(error.response?.data?.detail || "Failed to update project.", "error");
    }
  };

  if (loading) {
    return <div>Loading project...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-kotoba-text mb-8">Edit project</h1>
      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 shadow rounded-lg">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-kotoba-text/80">Title</label>
          <input type="text" name="title" id="title" value={project.title} onChange={handleChange} required className="mt-1 block w-full shadow-sm sm:text-sm border-kotoba-text/20 rounded-md" />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-kotoba-text/80">Description</label>
          <textarea name="description" id="description" rows="4" value={project.description} onChange={handleChange} required className="mt-1 block w-full shadow-sm sm:text-sm border-kotoba-text/20 rounded-md"></textarea>
        </div>
        <div>
          <label htmlFor="project_image_url" className="block text-sm font-medium text-kotoba-text/80">Project Image URL (Optional)</label>
          <input type="url" name="project_image_url" id="project_image_url" value={project.project_image_url || ''} onChange={handleChange} className="mt-1 block w-full shadow-sm sm:text-sm border-kotoba-text/20 rounded-md" />
        </div>
        {project.is_series && (
          <div>
            <label htmlFor="series_intro_video_url" className="block text-sm font-medium text-kotoba-text/80">Series Introduction Video URL (Optional)</label>
            <input type="url" name="series_intro_video_url" id="series_intro_video_url" value={project.series_intro_video_url || ''} onChange={handleChange} className="mt-1 block w-full shadow-sm sm:text-sm border-kotoba-text/20 rounded-md" />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="language" className="block text-sm font-medium text-kotoba-text/80">Language</label>
            <input type="text" name="language" id="language" value={project.language} onChange={handleChange} required className="mt-1 block w-full shadow-sm sm:text-sm border-kotoba-text/20 rounded-md" />
          </div>
          <div>
            <label htmlFor="level" className="block text-sm font-medium text-kotoba-text/80">Level</label>
            <input type="text" name="level" id="level" value={project.level} onChange={handleChange} required className="mt-1 block w-full shadow-sm sm:text-sm border-kotoba-text/20 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="funding_goal" className="block text-sm font-medium text-kotoba-text/80">Funding Goal (€)</label>
            <input
              type="number"
              name="funding_goal"
              id="funding_goal"
              value={project.funding_goal / 100}
              onChange={(e) => setProject(prev => ({ ...prev, funding_goal: e.target.value * 100 }))}
              required
              disabled={project.status !== 'draft'}
              className="mt-1 block w-full shadow-sm sm:text-sm border-kotoba-text/20 rounded-md disabled:bg-kotoba-background/60"
            />
             {project.status !== 'draft' && <p className="mt-1 text-xs text-kotoba-text/60">Funding goal cannot be changed for active projects.</p>}
          </div>
          <div>
            <label htmlFor="delivery_days" className="block text-sm font-medium text-kotoba-text/80">Delivery Days (after funding)</label>
            <input type="number" name="delivery_days" id="delivery_days" value={project.delivery_days} onChange={handleChange} required className="mt-1 block w-full shadow-sm sm:text-sm border-kotoba-text/20 rounded-md" />
          </div>
        </div>
        <div>
          <label htmlFor="tags" className="block text-sm font-medium text-kotoba-text/80">Tags (comma-separated)</label>
          <input type="text" name="tags" id="tags" value={project.tags} onChange={handleChange} className="mt-1 block w-full shadow-sm sm:text-sm border-kotoba-text/20 rounded-md" />
        </div>
        <div className="text-right">
          <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90">
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditProject;
