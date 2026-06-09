import React, { useState } from 'react';
import client from '../api/client';
import { useToast } from '../context/ToastContext';

const RespondToReview = ({ ratingId, onResponseSuccess }) => {
  const [response, setResponse] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!response.trim()) {
      addToast("Response cannot be empty.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      await client.post(`/ratings/${ratingId}/respond`, { response });
      addToast("Your response has been posted.", "success");
      if (onResponseSuccess) {
        onResponseSuccess();
      }
      setResponse('');
    } catch (error) {
      addToast(error.response?.data?.detail || "Failed to post response.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <textarea
        className="w-full p-2 border rounded-md text-sm"
        rows="2"
        placeholder="Write a public response..."
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        disabled={isSubmitting}
      />
      <button
        type="submit"
        className="mt-2 px-3 py-1 bg-kotoba-primary text-white text-sm rounded-md hover:bg-kotoba-primary/90 disabled:bg-kotoba-text/30"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Posting...' : 'Post Response'}
      </button>
    </form>
  );
};

export default RespondToReview;
