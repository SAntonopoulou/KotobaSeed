import React, { useState } from 'react';
import client from '../api/client';
import { useToast } from '../context/ToastContext';
import ConfirmationModal from './ConfirmationModal';

const LinkVideoModal = ({ projectId, onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [resources, setResources] = useState([{ title: '', url: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const { addToast } = useToast();

  const handleResourceChange = (index, field, value) => {
    const newResources = [...resources];
    newResources[index][field] = value;
    setResources(newResources);
  };

  const addResourceField = () => {
    setResources([...resources, { title: '', url: '' }]);
  };

  const removeResourceField = (index) => {
    const newResources = resources.filter((_, i) => i !== index);
    setResources(newResources);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsConfirmModalOpen(true);
  };

  const executeSubmit = async () => {
    setIsConfirmModalOpen(false);
    if (!title || !url) {
      addToast('Video title and URL are required.', 'error');
      return;
    }
    setIsSubmitting(true);

    try {
      const payload = {
        project_id: projectId,
        title,
        url,
        resources: resources.filter(r => r.title && r.url),
      };
      await client.post('/videos/', payload);
      onSuccess();
    } catch (error) {
      addToast(error.response?.data?.detail || 'Failed to link video.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={onClose}>
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>
          <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Link a New Video</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700">Video Title</label>
                  <input type="text" id="title" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md py-2 px-3" />
                </div>
                <div>
                  <label htmlFor="url" className="block text-sm font-medium text-gray-700">Video URL</label>
                  <input type="url" id="url" value={url} onChange={(e) => setUrl(e.target.value)} required className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md py-2 px-3" />
                </div>
                <h4 className="text-md font-medium text-gray-800 pt-2">Supplementary Resources (Optional)</h4>
                {resources.map((resource, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input type="text" placeholder="Resource Title" value={resource.title} onChange={(e) => handleResourceChange(index, 'title', e.target.value)} className="flex-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md py-2 px-3" />
                    <input type="url" placeholder="Resource URL" value={resource.url} onChange={(e) => handleResourceChange(index, 'url', e.target.value)} className="flex-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md py-2 px-3" />
                    <button type="button" onClick={() => removeResourceField(index)} className="text-red-500 hover:text-red-700">&times;</button>
                  </div>
                ))}
                <button type="button" onClick={addResourceField} className="text-sm text-kotoba-primary hover:text-kotoba-primary">+ Add another resource</button>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button type="submit" disabled={isSubmitting} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-kotoba-primary text-base font-medium text-white hover:bg-kotoba-primary/90 sm:ml-3 sm:w-auto sm:text-sm disabled:bg-kotoba-primary/40">
                {isSubmitting ? 'Submitting...' : 'Link Video'}
              </button>
              <button type="button" onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
        </div>
      </div>
      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={executeSubmit}
        title="Confirm Video Submission"
        message="Are you sure you want to submit this video? Once submitted, the video link cannot be edited. You can still add more resources later."
        confirmText="Submit Video"
      />
    </>
  );
};

export default LinkVideoModal;
