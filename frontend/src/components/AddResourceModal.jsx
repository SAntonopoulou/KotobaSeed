import React, { useState } from 'react';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

const AddResourceModal = ({ videoId, onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !url) {
      addToast('Title and URL are required.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await client.post(`/videos/${videoId}/resources`, { title, url });
      onSuccess();
    } catch (error) {
      addToast(error.response?.data?.detail || 'Failed to add resource.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed z-20 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={onClose}>
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Add a New Resource</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="resource-title" className="block text-sm font-medium text-gray-700">Resource Title</label>
                  <input type="text" id="resource-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md py-2 px-3" />
                </div>
                <div>
                  <label htmlFor="resource-url" className="block text-sm font-medium text-gray-700">Resource URL</label>
                  <input type="url" id="resource-url" value={url} onChange={(e) => setUrl(e.target.value)} required className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md py-2 px-3" />
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button type="submit" disabled={isSubmitting} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-kotoba-primary text-base font-medium text-white hover:bg-kotoba-primary/90 sm:ml-3 sm:w-auto sm:text-sm disabled:bg-kotoba-primary/40">
                {isSubmitting ? 'Adding...' : 'Add Resource'}
              </button>
              <button type="button" onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddResourceModal;
