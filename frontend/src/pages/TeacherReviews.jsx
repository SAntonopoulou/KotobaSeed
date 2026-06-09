import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import { formatDateShort } from '../utils/dates';

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

    if (loading) return <div className="font-sans text-center py-12 text-kotoba-text/60">Loading reviews…</div>;
    if (error) return (
        <div className="font-sans max-w-3xl mx-auto px-4 py-16 text-center">
            <div className="bg-white rounded-3xl shadow-soft p-8 text-red-600 text-sm">{error}</div>
        </div>
    );
    if (!teacher) return null;

    return (
        <div className="font-sans bg-kotoba-background min-h-screen text-kotoba-text">
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
                <header className="mb-10">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                        Reviews
                    </p>
                    <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold text-kotoba-primary leading-tight tracking-[-0.02em]">
                        Reviews for {teacher.full_name}
                    </h1>
                    {teacher.average_rating && (
                        <div className="mt-4 inline-flex items-center gap-2 bg-white rounded-full pl-3 pr-4 py-2 shadow-soft">
                            <StarIcon color="#d6a42f" size={20} />
                            <span className="font-display text-xl font-bold text-kotoba-primary tabular-nums">{teacher.average_rating}</span>
                            <span className="text-sm text-kotoba-text/65">({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})</span>
                        </div>
                    )}
                </header>

                <div className="space-y-4">
                    {reviews.length === 0 ? (
                        <div className="bg-white rounded-3xl shadow-soft p-10 text-center">
                            <p className="text-kotoba-text/70">This teacher has no reviews yet.</p>
                        </div>
                    ) : (
                        reviews.map((review, index) => (
                            <div key={index} className="bg-white rounded-3xl shadow-soft p-6 sm:p-7 hover:shadow-soft-lg transition-shadow duration-300">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-0.5">
                                        {[...Array(5)].map((_, i) => (
                                            <StarIcon key={i} color={i < review.rating ? '#d6a42f' : 'rgba(43,70,60,0.15)'} />
                                        ))}
                                    </div>
                                    <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-text/50">
                                        {formatDateShort(review.created_at)}
                                    </span>
                                </div>
                                {review.comment && (
                                    <blockquote className="mt-4 font-display text-lg text-kotoba-text/85 italic leading-relaxed">
                                        <span aria-hidden="true" className="text-kotoba-secondary-dark mr-0.5">“</span>
                                        {review.comment}
                                        <span aria-hidden="true" className="text-kotoba-secondary-dark ml-0.5">”</span>
                                    </blockquote>
                                )}

                                {review.teacher_response && (
                                    <div className="mt-5 pt-5 border-t border-kotoba-text/[0.06] bg-kotoba-background/40 -mx-6 sm:-mx-7 px-6 sm:px-7 py-4 rounded-b-3xl">
                                        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
                                            Response from {teacher.full_name}
                                        </p>
                                        <p className="mt-2 text-sm text-kotoba-text/80 italic leading-relaxed">"{review.teacher_response}"</p>
                                        <p className="text-xs text-kotoba-text/40 text-right mt-1">{formatDateShort(review.response_created_at)}</p>
                                    </div>
                                )}

                                <div className="mt-5 pt-4 border-t border-kotoba-text/[0.06]">
                                    <p className="text-sm text-kotoba-text/75">
                                        For project:{' '}
                                        <Link
                                            to={`/projects/${review.project.id}`}
                                            className="font-display font-bold text-kotoba-primary hover:underline"
                                        >
                                            {review.project.title}
                                        </Link>
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-kotoba-text/55">
                                        <span>Goal: {formatCurrency(review.project.funding_goal)}</span>
                                        <span className="capitalize">Language: {review.project.language}</span>
                                        <span>Level: {review.project.level}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
};

export default TeacherReviews;
