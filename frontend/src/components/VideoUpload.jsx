import React, { useState } from 'react';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

const LinkVideoModal = ({ projectId, onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const { addToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await client.post('/videos/', {
        project_id: projectId,
        title,
        url,
      });
      addToast('Video linked successfully!', 'success');
      onSuccess();
    } catch (error) {
      console.error("Failed to link video", error);
      addToast(error.response?.data?.detail || 'Failed to link video.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3 text-center">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Link a Video</h3>
          <form onSubmit={handleSubmit} className="mt-2 text-left space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">Video Title</label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700">Video URL</label>
              <input
                type="url"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
            <div className="items-center px-4 py-3">
              <button
                type="submit"
                className="px-4 py-2 bg-kotoba-primary text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-kotoba-primary/90 focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              >
                Link Video
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-gray-200 text-gray-800 text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-300 focus:outline-none"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LinkVideoModal;
