import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';

const StarIcon = ({ color = 'currentColor', size = 20 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={color} height={size} width={size}>
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
);

const TeacherReviews = () => {
    const { id } = useParams();
    const [teacher, setTeacher] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [profileRes, reviewsRes] = await Promise.all([
                    client.get(`/users/${id}/profile`),
                    client.get(`/users/${id}/ratings`)
                ]);
                setTeacher(profileRes.data);
                setReviews(reviewsRes.data);
            } catch (err) {
                console.error("Failed to load teacher reviews", err);
                setError("Could not load reviews for this teacher.");
            } finally {
                setLoading(false);
            }
        };
        fetchAllData();
    }, [id]);

    const formatCurrency = (amountInCents) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amountInCents / 100);

    if (loading) return <div className="text-center py-10">Loading reviews...</div>;
    if (error) return <div className="text-center py-10 text-red-600">{error}</div>;
    if (!teacher) return null;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Reviews for {teacher.full_name}</h1>
                {teacher.average_rating && (
                    <div className="mt-2 flex items-center">
                        <StarIcon color="#ffc107" size={24} />
                        <span className="ml-2 text-2xl font-bold text-gray-800">{teacher.average_rating}</span>
                        <span className="ml-2 text-gray-500">({reviews.length} reviews)</span>
                    </div>
                )}
            </div>

            <div className="space-y-6">
                {reviews.length === 0 ? (
                    <p className="text-gray-500">This teacher has no reviews yet.</p>
                ) : (
                    reviews.map((review, index) => (
                        <div key={index} className="bg-white shadow-md rounded-lg p-6 border border-gray-200">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center">
                                    {[...Array(5)].map((_, i) => (
                                        <StarIcon key={i} color={i < review.rating ? '#ffc107' : '#e4e5e9'} />
                                    ))}
                                </div>
                                <span className="text-sm text-gray-500">{new Date(review.created_at).toLocaleDateString()}</span>
                            </div>
                            {review.comment && <p className="mt-4 text-gray-700 italic">"{review.comment}"</p>}
                            
                            {review.teacher_response && (
                                <div className="mt-4 pt-4 border-t border-gray-200 bg-gray-50 p-3 rounded-md">
                                    <p className="text-sm font-semibold text-gray-800">Response from {teacher.full_name}:</p>
                                    <p className="text-sm text-gray-600 italic">"{review.teacher_response}"</p>
                                    <p className="text-xs text-gray-400 text-right">{new Date(review.response_created_at).toLocaleDateString()}</p>
                                </div>
                            )}

                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <p className="text-sm text-gray-600">For project: <Link to={`/projects/${review.project.id}`} className="font-semibold text-kotoba-primary hover:underline">{review.project.title}</Link></p>
                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                                    <span>Goal: {formatCurrency(review.project.funding_goal)}</span>
                                    <span className="capitalize">Language: {review.project.language}</span>
                                    <span>Level: {review.project.level}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default TeacherReviews;
