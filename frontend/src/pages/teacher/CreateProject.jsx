import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';

const CreateProject = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    language: '',
    level: '',
    funding_goal: '',
    delivery_days: '',
    tags: '',
    is_series: false,
    num_videos: 1,
    price_per_video: 0,
    project_image_url: '',
    series_intro_video_url: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (formData.is_series && formData.price_per_video > 0 && formData.num_videos > 0) {
      setFormData(prev => ({
        ...prev,
        funding_goal: (formData.price_per_video * formData.num_videos).toFixed(2)
      }));
    }
  }, [formData.is_series, formData.price_per_video, formData.num_videos]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.title || !formData.description || !formData.language || !formData.level || !formData.funding_goal || !formData.delivery_days) {
      addToast('Please fill out all required fields.', 'error');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        funding_goal: Math.round(parseFloat(formData.funding_goal) * 100),
        delivery_days: parseInt(formData.delivery_days, 10),
        num_videos: formData.is_series ? parseInt(formData.num_videos, 10) : null,
        price_per_video: formData.is_series ? Math.round(parseFloat(formData.price_per_video) * 100) : null,
      };

      await client.post('/projects/', payload);
      addToast('Project created successfully!', 'success');
      navigate('/teacher/dashboard');
    } catch (error) {
      console.error('Failed to create project', error);
      const errorMessage = error.response?.data?.detail || 'Failed to create project. Please try again.';
      addToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Create a New Project</h1>
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="title">
            Project Title
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="title"
            type="text"
            placeholder="e.g., Japanese Grammar Explained: N5 Level"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="description">
            Description
          </label>
          <textarea
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline h-32"
            id="description"
            placeholder="Describe the video content you will create."
            name="description"
            value={formData.description}
            onChange={handleChange}
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="project_image_url">
            Project Image URL (Optional)
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="project_image_url"
            type="url"
            placeholder="https://example.com/your-image.png"
            name="project_image_url"
            value={formData.project_image_url}
            onChange={handleChange}
          />
        </div>
        <div className="flex flex-wrap -mx-3 mb-4">
          <div className="w-full md:w-1/2 px-3 mb-6 md:mb-0">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="language">
              Language
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="language"
              type="text"
              placeholder="e.g., Japanese"
              name="language"
              value={formData.language}
              onChange={handleChange}
              required
            />
          </div>
          <div className="w-full md:w-1/2 px-3">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="level">
              Level
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="level"
              type="text"
              placeholder="e.g., N5, A1"
              name="level"
              value={formData.level}
              onChange={handleChange}
              required
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              name="is_series"
              checked={formData.is_series}
              onChange={handleChange}
              className="h-4 w-4 text-kotoba-primary border-gray-300 rounded"
            />
            <span className="ml-2 text-gray-700 text-sm font-bold">Is this a series of videos?</span>
          </label>
        </div>
        {formData.is_series && (
          <div className="flex flex-wrap -mx-3 mb-4">
            <div className="w-full md:w-1/2 px-3 mb-6 md:mb-0">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="num_videos">Number of Videos</label>
              <input type="number" name="num_videos" id="num_videos" value={formData.num_videos} onChange={handleChange} min="1" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" />
            </div>
            <div className="w-full md:w-1/2 px-3">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="price_per_video">Price Per Video (€)</label>
              <input type="number" name="price_per_video" id="price_per_video" value={formData.price_per_video} onChange={handleChange} min="0" step="0.01" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" />
              <p className="text-xs text-gray-500 mt-1">Set to 0 if you want to define a total funding goal instead.</p>
            </div>
          </div>
        )}
        {formData.is_series && (
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="series_intro_video_url">
              Series Introduction Video URL (Optional)
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="series_intro_video_url"
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              name="series_intro_video_url"
              value={formData.series_intro_video_url}
              onChange={handleChange}
            />
          </div>
        )}
        <div className="flex flex-wrap -mx-3 mb-4">
          <div className="w-full md:w-1/2 px-3 mb-6 md:mb-0">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="funding_goal">
              Funding Goal (€)
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="funding_goal"
              type="number"
              placeholder="e.g., 100"
              name="funding_goal"
              value={formData.funding_goal}
              onChange={handleChange}
              min="1"
              step="0.01"
              disabled={formData.is_series && formData.price_per_video > 0}
              required
            />
          </div>
          <div className="w-full md:w-1/2 px-3">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="delivery_days">
              Delivery Days (after funding)
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="delivery_days"
              type="number"
              placeholder="e.g., 14"
              name="delivery_days"
              value={formData.delivery_days}
              onChange={handleChange}
              min="1"
              required
            />
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="tags">
            Tags (comma-separated)
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="tags"
            type="text"
            placeholder="e.g., grammar, travel, food"
            name="tags"
            value={formData.tags}
            onChange={handleChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <button
            className="bg-kotoba-primary hover:bg-kotoba-primary/90 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:bg-kotoba-primary/40"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateProject;
