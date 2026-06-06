import React, { useState } from 'react';
import client from '../api/client';

const StarIcon = ({ color, size }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill={color}
      height={size}
      width={size}
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );

const RateProject = ({ projectId, onRatingSuccess, initialRating, initialComment }) => {
  const [rating, setRating] = useState(initialRating || 0);
  const [hover, setHover] = useState(initialRating || 0);
  const [comment, setComment] = useState(initialComment || '');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a rating.');
      return;
    }
    setError('');
    setIsSubmitting(true);

    try {
      await client.post(`/ratings/project/${projectId}`, {
        rating,
        comment,
      });
      if (onRatingSuccess) {
        onRatingSuccess({ rating, comment });
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'An error occurred while submitting your rating.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (initialRating > 0) { // Changed from hasRated to initialRating > 0
    return (
      <div className="p-4 my-4 bg-green-100 border border-green-400 text-green-700 rounded">
        <p className="font-bold mb-2">You have rated this project:</p>
        <div className="flex items-center">
          {[...Array(5)].map((_, index) => {
            const ratingValue = index + 1;
            return (
              <StarIcon
                key={index}
                color={ratingValue <= initialRating ? '#ffc107' : '#e4e5e9'}
                size={20}
              />
            );
          })}
          <span className="ml-2 text-green-800 font-semibold">{initialRating} / 5</span>
        </div>
        {initialComment && <p className="mt-2 text-sm italic">"{initialComment}"</p>}
      </div>
    );
  }

  return (
    <div className="p-4 my-4 border rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-2">Rate this project</h3>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center mb-4">
          {[...Array(5)].map((_, index) => {
            const ratingValue = index + 1;
            return (
              <label key={index} className="cursor-pointer">
                <input
                  type="radio"
                  name="rating"
                  value={ratingValue}
                  onClick={() => setRating(ratingValue)}
                  className="hidden"
                  disabled={isSubmitting}
                />
                <StarIcon
                  color={ratingValue <= (hover || rating) ? '#ffc107' : '#e4e5e9'}
                  size={25}
                  onMouseEnter={() => setHover(ratingValue)}
                  onMouseLeave={() => setHover(0)}
                />
              </label>
            );
          })}
        </div>
        <textarea
          className="w-full p-2 border rounded"
          rows="3"
          placeholder="Optional: Add a public comment..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={isSubmitting}
        ></textarea>
        <button
          type="submit"
          className="mt-2 px-4 py-2 bg-kotoba-primary text-white rounded hover:bg-kotoba-primary/90 disabled:bg-gray-400"
          disabled={rating === 0 || isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Rating'}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
};

export default RateProject;
