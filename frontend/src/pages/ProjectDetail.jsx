import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import PledgeForm from '../components/PledgeForm';
import RateProject from '../components/RateProject';
import RespondToReview from '../components/RespondToReview';
import { useToast } from '../context/ToastContext';
import ProjectCard from '../components/ProjectCard';
import VideoPlayer from '../components/VideoPlayer';
import VerifiedBadge from '../components/VerifiedBadge';
import defaultProjectImage from '../assets/default_project_image.svg';
import { getVideoThumbnail } from '../utils/video';
import LinkVideoModal from '../components/LinkVideoModal';
import AddResourceModal from '../components/AddResourceModal';
import TipForm from '../components/TipForm';

const StarIcon = ({ color = 'currentColor', size = 20 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={color} height={size} width={size}>
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
);

const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [videos, setVideos] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [backers, setBackers] = useState([]);
  const [relatedProjects, setRelatedProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [newUpdate, setNewUpdate] = useState('');
  const [editingUpdateId, setEditingUpdateId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [isEditingIntroVideo, setIsEditingIntroVideo] = useState(false);
  const [newIntroVideoUrl, setNewIntroVideoUrl] = useState('');
  
  const { addToast } = useToast();
  const token = localStorage.getItem('token');
  const ratingSectionRef = useRef(null);

  const fetchData = async () => {
    try {
      const projectRes = await client.get(`/projects/${id}`);
      setProject(projectRes.data);
      
      if (token) {
          try {
              const userRes = await client.get('/users/me');
              setCurrentUser(userRes.data);
          } catch (e) { console.error("Failed to fetch user"); }
      }

      const [updatesRes, backersRes] = await Promise.all([
        client.get(`/projects/${id}/updates`),
        client.get(`/projects/${id}/backers`)
      ]);
      setUpdates(updatesRes.data);
      setBackers(backersRes.data);

      if (['completed', 'successful'].includes(projectRes.data.status)) {
        const reviewsRes = await client.get(`/ratings/project/${id}`);
        setReviews(reviewsRes.data);
      }
      
      if (['in_progress', 'completed', 'successful', 'pending_confirmation'].includes(projectRes.data.status)) {
          const videosRes = await client.get('/videos/', { params: { project_id: id } });
          setVideos(videosRes.data);
      }

      const relatedRes = await client.get(`/projects/${id}/related`);
      setRelatedProjects(relatedRes.data);

    } catch (err) {
      if (err.response && err.response.status === 404) {
          addToast("This project could not be found.", "error");
          navigate('/projects');
      } else {
          console.error(err);
          setError("Failed to load project details.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id, token, navigate, addToast]);

  const handleFollow = async (teacherId) => {
    try {
      await client.post(`/users/${teacherId}/follow`);
      setProject(prev => ({ ...prev, is_following_teacher: true }));
      addToast("Followed teacher!", "success");
    } catch (error) {
      console.error("Failed to follow", error);
      addToast("Failed to follow teacher.", "error");
    }
  };

  const handleUnfollow = async (teacherId) => {
    try {
      await client.delete(`/users/${teacherId}/follow`);
      setProject(prev => ({ ...prev, is_following_teacher: false }));
      addToast("Unfollowed teacher.", "success");
    } catch (error) {
      console.error("Failed to unfollow", error);
      addToast("Failed to unfollow teacher.", "error");
    }
  };

  const handleConfirmCompletion = async () => {
    try {
      const res = await client.post(`/projects/${id}/confirm-completion`);
      setProject(res.data);
      addToast("Project completion confirmed!", "success");
      setTimeout(() => {
        ratingSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        addToast("Now you can rate this project.", "info");
      }, 500);
    } catch (error) {
      console.error("Failed to confirm completion", error);
      addToast(error.response?.data?.detail || "Failed to confirm completion.", "error");
    }
  };

  const handleRatingSuccess = () => {
    fetchData();
  };

  const handlePostUpdate = async () => {
      if (!newUpdate.trim()) return;
      try {
          await client.post(`/projects/${id}/updates`, { content: newUpdate });
          fetchData();
          setNewUpdate('');
          addToast("Update posted!", 'success');
      } catch (error) {
          console.error("Failed to post update", error);
          addToast("Failed to post update", 'error');
      }
  };

  const handleEditUpdate = (update) => { setEditingUpdateId(update.id); setEditingContent(update.content); };
  const handleCancelEdit = () => { setEditingUpdateId(null); setEditingContent(''); };

  const handleSaveUpdate = async (updateId) => {
    try {
      await client.patch(`/projects/updates/${updateId}`, { content: editingContent });
      fetchData();
      handleCancelEdit();
      addToast("Update saved!", "success");
    } catch (error) {
      console.error("Failed to save update", error);
      addToast("Failed to save update.", "error");
    }
  };

  const handleUpdateImage = async () => {
    try {
      await client.patch(`/projects/${id}`, { project_image_url: newImageUrl });
      addToast("Project image updated successfully!", "success");
      setIsEditingImage(false);
      fetchData();
    } catch (error) {
      console.error("Failed to update project image", error);
      addToast(error.response?.data?.detail || "Failed to update image.", "error");
    }
  };

  const handleVideoLinkSuccess = () => {
    setShowVideoModal(false);
    addToast("Video linked successfully!", 'success');
    fetchData();
  };

  const handleAddResourceSuccess = () => {
    setShowResourceModal(false);
    addToast("Resource added successfully!", "success");
    fetchData();
  };

  const handleSaveIntroVideo = async () => {
    try {
      await client.patch(`/projects/${id}`, { series_intro_video_url: newIntroVideoUrl });
      addToast("Intro video updated successfully!", "success");
      setIsEditingIntroVideo(false);
      fetchData();
    } catch (error) {
      console.error("Failed to update intro video", error);
      addToast(error.response?.data?.detail || "Failed to update intro video.", "error");
    }
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;
  if (error) return <div className="text-center py-10 text-red-600">{error}</div>;
  if (!project) return null;

  const percentage = Math.min((project.current_funding / project.funding_goal) * 100, 100);
  const formatCurrency = (amountInCents) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amountInCents / 100);
  const isOwner = currentUser && currentUser.id === project.teacher_id;
  const tags = project.tags ? project.tags.split(',').map(t => t.trim()) : [];
  const canRate = project.is_backed_by_user && project.status === 'completed';
  const isFollowing = project.is_following_teacher;
  const canFollow = currentUser && currentUser.id !== project.teacher_id;

  let deliveryText = null;
  if (project.delivery_days) {
    if (project.status === 'completed' && project.funded_at && project.completed_at) {
      const fundedDate = new Date(project.funded_at);
      const completedDate = new Date(project.completed_at);
      const diffTime = Math.abs(completedDate - fundedDate);
      const actualDeliveryDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      deliveryText = `Delivered: ${actualDeliveryDays} days after funding (Projected: ${project.delivery_days} days)`;
    } else if (!project.deadline) {
      deliveryText = `Delivery: ${project.delivery_days} days after funding`;
    }
  }

  let headerImageUrl = defaultProjectImage;
  if (project.project_image_url) {
    headerImageUrl = project.project_image_url;
  } else if (!project.is_series && videos.length > 0) {
    headerImageUrl = getVideoThumbnail(videos[0].url);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="lg:grid lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2">
          <div className="relative mb-8 rounded-lg overflow-hidden shadow-lg group">
            <img src={headerImageUrl} alt={project.title} className="w-full h-64 object-cover" />
            {isOwner && !isEditingImage && (
              <button onClick={() => { setIsEditingImage(true); setNewImageUrl(project.project_image_url || ''); }} className="absolute top-3 right-3 bg-black bg-opacity-50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" title="Edit Project Image">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
              </button>
            )}
          </div>

          {isOwner && isEditingImage && (
            <div className="mb-6 p-4 border rounded-lg bg-gray-50 shadow-sm">
              <label htmlFor="project_image_url" className="block text-sm font-medium text-gray-700">Project Image URL</label>
              <input type="url" id="project_image_url" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="https://example.com/your-image.png" />
              <div className="mt-3 flex justify-end space-x-3">
                <button onClick={() => setIsEditingImage(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button onClick={handleUpdateImage} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90">Save Image</button>
              </div>
            </div>
          )}

          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl mb-4">{project.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-kotoba-secondary/20 text-kotoba-text">{project.language}</span>
            <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800">{project.level}</span>
            {tags.map((tag, index) => <span key={index} className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-gray-100 text-gray-800">{tag}</span>)}
          </div>
          <div className="mb-6 text-gray-500 text-sm flex items-center gap-4">
            <p className="flex items-center">By <Link to={`/profile/${project.teacher_id}`} className="text-kotoba-primary hover:underline ml-1">{project.teacher_name}</Link><VerifiedBadge languages={project.teacher_verified_languages} /></p>
            {canFollow && (
              isFollowing ? (
                <button onClick={() => handleUnfollow(project.teacher_id)} className="bg-gray-200 text-gray-700 px-3 py-1 rounded-md text-sm font-medium">Unfollow</button>
              ) : (
                <button onClick={() => handleFollow(project.teacher_id)} className="bg-kotoba-primary text-white px-3 py-1 rounded-md text-sm font-medium">Follow</button>
              )
            )}
          </div>
          {project.requester_name && <p className="mt-1">Requested by {project.requester_name}</p>}
          <div className="prose prose-indigo max-w-none text-gray-500 mb-8"><p className="whitespace-pre-line">{project.description}</p></div>

          {project.is_series && (
            <div className="mt-8 border-t border-gray-200 pt-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Series Introduction</h2>
                {isOwner && (
                  <button onClick={() => { setIsEditingIntroVideo(!isEditingIntroVideo); setNewIntroVideoUrl(project.series_intro_video_url || ''); }} className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none">
                    {project.series_intro_video_url ? 'Edit Intro Video' : 'Add Intro Video'}
                  </button>
                )}
              </div>
              {isEditingIntroVideo ? (
                <div className="p-4 border rounded-lg bg-gray-50 shadow-sm">
                  <label htmlFor="series_intro_video_url" className="block text-sm font-medium text-gray-700">Intro Video URL</label>
                  <input type="url" id="series_intro_video_url" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm" value={newIntroVideoUrl} onChange={(e) => setNewIntroVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
                  <div className="mt-3 flex justify-end space-x-3">
                    <button onClick={() => setIsEditingIntroVideo(false)} className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSaveIntroVideo} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90">Save Intro Video</button>
                  </div>
                </div>
              ) : (
                project.series_intro_video_url ? <VideoPlayer url={project.series_intro_video_url} /> : <p>No introduction video has been added for this series yet.</p>
              )}
            </div>
          )}

          <div className="mt-8 border-t border-gray-200 pt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Project Videos</h2>
              {isOwner && project.status === 'successful' && (<button onClick={() => setShowVideoModal(true)} className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none">Link Video</button>)}
            </div>
            {videos.length > 0 ? (
              <div className="space-y-8">
                {videos.map(video => (
                  <div key={video.id} className="bg-white p-4 rounded-lg shadow border border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">{video.title}</h3>
                    <VideoPlayer url={video.url} />
                    {video.resources && video.resources.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <h4 className="text-sm font-medium text-gray-800 mb-2">Resources:</h4>
                        <ul className="space-y-1">
                          {video.resources.map(res => (
                            <li key={res.id}><a href={res.url} target="_blank" rel="noopener noreferrer" className="text-kotoba-primary hover:underline">{res.title}</a></li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {isOwner && (
                      <div className="mt-4 text-right">
                        <button onClick={() => { setSelectedVideoId(video.id); setShowResourceModal(true); }} className="text-sm text-kotoba-primary hover:underline">Add Resource</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className="text-gray-500">No videos have been added yet.</p>}
          </div>

          {project.is_backed_by_user && project.status === 'pending_confirmation' && (
            <div className="my-6 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700">
              <h4 className="font-bold">Action Required</h4>
              <p className="mb-2">The teacher has marked this project as complete. Please review the materials and confirm completion to release the funds.</p>
              <button onClick={handleConfirmCompletion} className="bg-green-500 text-white font-bold py-2 px-4 rounded hover:bg-green-600">Confirm Project Completion</button>
            </div>
          )}

          {canRate && (
            <div ref={ratingSectionRef} className="mt-8 border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Rating</h2>
              <RateProject projectId={project.id} onRatingSuccess={handleRatingSuccess} initialRating={project.my_rating?.rating} initialComment={project.my_rating?.comment} />
            </div>
          )}

          {reviews.length > 0 && (
            <div className="mt-8 border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Reviews</h2>
              <div className="space-y-6">
                {reviews.map((review) => (
                  <div key={review.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        {[...Array(5)].map((_, i) => <StarIcon key={i} color={i < review.rating ? '#ffc107' : '#e4e5e9'} />)}
                        <span className="ml-3 font-semibold">{review.user_name}</span>
                      </div>
                      <span className="text-sm text-gray-500">{new Date(review.created_at).toLocaleDateString()}</span>
                    </div>
                    {review.comment && <p className="mt-3 text-gray-700 italic">"{review.comment}"</p>}
                    {review.teacher_response && (<div className="mt-4 pt-4 border-t border-gray-200"><p className="text-sm font-semibold text-gray-800">Response from {project.teacher_name}:</p><p className="text-sm text-gray-600 italic">"{review.teacher_response}"</p><p className="text-xs text-gray-400 text-right">{new Date(review.response_created_at).toLocaleDateString()}</p></div>)}
                    {isOwner && !review.teacher_response && (<RespondToReview ratingId={review.id} onResponseSuccess={fetchData} />)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 border-t border-gray-200 pt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Project Updates</h2>
            {isOwner && (
              <div className="mb-6"><textarea className="w-full border border-gray-300 rounded-md p-2 text-sm" rows={3} placeholder="Post an update for your backers..." value={newUpdate} onChange={(e) => setNewUpdate(e.target.value)} /><div className="mt-2 text-right"><button onClick={handlePostUpdate} className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none">Post Update</button></div></div>
            )}
            {updates.length === 0 ? (<p className="text-gray-500 text-sm">No updates yet.</p>) : (
              <div className="space-y-4">
                {updates.map(update => (
                  <div key={update.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    {editingUpdateId === update.id ? (
                      <div><textarea className="w-full border border-gray-300 rounded-md p-2 text-sm" rows={3} value={editingContent} onChange={(e) => setEditingContent(e.target.value)} /><div className="mt-2 text-right space-x-2"><button onClick={handleCancelEdit} className="text-sm text-gray-600">Cancel</button><button onClick={() => handleSaveUpdate(update.id)} className="text-sm text-kotoba-primary font-medium">Save</button></div></div>
                    ) : (
                      <><p className="text-gray-800 whitespace-pre-line">{update.content}</p><div className="flex justify-between items-center mt-2"><p className="text-xs text-gray-500">{new Date(update.created_at).toLocaleDateString()}</p>{isOwner && (<button onClick={() => handleEditUpdate(update)} className="text-xs text-kotoba-primary hover:underline">Edit</button>)}</div></>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 lg:mt-0">
          <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 sticky top-6">
            <div className="mb-6">
              <div className="flex justify-between text-base font-medium text-gray-900 mb-1"><span>{formatCurrency(project.current_funding)}</span><span className="text-gray-500">goal {formatCurrency(project.funding_goal)}</span></div>
              <div className="w-full bg-gray-200 rounded-full h-3"><div className="bg-kotoba-primary h-3 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }}></div></div>
              <p className="mt-2 text-sm text-gray-500 text-right">{Math.round(percentage)}% funded</p>
            </div>
            {project.is_series && project.num_videos && (
              <p className="text-sm text-gray-500 mb-3">Expected videos: {project.num_videos}</p>
            )}
            {project.status === 'funding' ? (token ? (<PledgeForm projectId={project.id} projectName={project.title} />) : (<div className="text-center"><p className="text-gray-600 mb-4">Log in to back this project.</p><Link to="/login" className="block w-full bg-kotoba-primary text-white text-center py-2 px-4 rounded-md hover:bg-kotoba-primary/90">Login to Pledge</Link></div>)) : (<div className="bg-gray-100 p-4 rounded text-center text-gray-600">This project is {project.status.replace(/_/g, ' ')}.</div>)}
            
            {['successful', 'completed', 'pending_confirmation'].includes(project.status) && project.teacher_stripe_account_id && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                {project.total_tipped_amount > 0 && (
                  <p className="text-sm text-gray-500 mb-3">Total tips received: {formatCurrency(project.total_tipped_amount)}</p>
                )}
                {!isOwner && <TipForm projectId={project.id} />}
              </div>
            )}

            {backers.length > 0 && (<div className="mt-6 pt-6 border-t border-gray-200"><h4 className="text-sm font-medium text-gray-900 mb-3">Backers ({backers.length})</h4><div className="flex flex-wrap gap-2">{backers.map(backer => (<Link key={backer.id} to={`/profile/${backer.id}`} title={backer.full_name}><img src={backer.avatar_url || `https://ui-avatars.com/api/?name=${backer.full_name}&background=random`} alt={backer.full_name} className="w-10 h-10 rounded-full object-cover" /></Link>))}</div></div>)}
            {project.deadline && (<div className="mt-6 pt-6 border-t border-gray-200"><p className="text-sm text-gray-500">Deadline: {new Date(project.deadline).toLocaleDateString()}</p></div>)}
            {deliveryText && (<div className="mt-6 pt-6 border-t border-gray-200"><p className="text-sm text-gray-500">{deliveryText}</p></div>)}
          </div>
        </div>
      </div>

      {relatedProjects.length > 0 && (<div className="mt-12 border-t border-gray-200 pt-12"><h2 className="text-2xl font-bold text-gray-900 mb-6">More Like This</h2><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">{relatedProjects.map(p => (<ProjectCard key={p.id} project={p} currentUser={currentUser} onFollow={handleFollow} />))}</div></div>)}
      {showVideoModal && (<LinkVideoModal projectId={id} onClose={() => setShowVideoModal(false)} onSuccess={handleVideoLinkSuccess} />)}
      {showResourceModal && (<AddResourceModal videoId={selectedVideoId} onClose={() => setShowResourceModal(false)} onSuccess={handleAddResourceSuccess} />)}
    </div>
  );
};

export default ProjectDetail;
