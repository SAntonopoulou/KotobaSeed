import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import { FaShieldAlt } from 'react-icons/fa';
import ProjectCard from '../components/ProjectCard';
import VideoPlayer from '../components/VideoPlayer';
import { useAuth } from '../context/AuthContext'; // Import useAuth

const VerifiedLanguageBadge = ({ language }) => (
  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-kotoba-secondary/20 text-kotoba-text">
    <FaShieldAlt className="mr-1.5" />
    {language}
  </span>
);

const SubscriptionBadge = ({ tier }) => {
  if (tier === 'none') return null;

  const getBadgeClasses = (subscriptionTier) => {
    switch (subscriptionTier) {
      case 'plus':
        return 'bg-green-100 text-green-800';
      case 'premium':
        return 'bg-purple-100 text-purple-800';
      case 'pro':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span
      className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium uppercase ${getBadgeClasses(tier)}`}
    >
      {tier}
    </span>
  );
};

const Profile = () => {
  const { id } = useParams();
  const { currentUser } = useAuth(); // Use the auth context
  const [profile, setProfile] = useState(null);
  const [projectData, setProjectData] = useState({ projects: [], total_count: 0 });
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ bio: '', languages: '', intro_video_url: '', sample_video_url: '', avatar_url: '' });
  const [followers, setFollowers] = useState([]);
  const [followerOffset, setFollowerOffset] = useState(0);
  const [hasMoreFollowers, setHasMoreFollowers] = useState(true);
  const [following, setFollowing] = useState([]);

  const fetchFollowers = async (offset = 0) => {
    try {
      const res = await client.get(`/users/${id}/followers`, { params: { limit: 10, offset } });
      if (res.data.length > 0) {
        setFollowers(prev => offset === 0 ? res.data : [...prev, ...res.data]);
      }
      if (res.data.length < 10) {
        setHasMoreFollowers(false);
      }
    } catch (error) {
      console.error("Failed to fetch followers", error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const profileRes = await client.get(`/users/${id}/profile`);
        setProfile(profileRes.data);
        setEditForm({ 
            bio: profileRes.data.bio || '', 
            languages: profileRes.data.languages || '',
            intro_video_url: profileRes.data.intro_video_url || '',
            sample_video_url: profileRes.data.sample_video_url || '',
            avatar_url: profileRes.data.avatar_url || ''
        });

        if (profileRes.data.role === 'creator') {
            const projectsRes = await client.get(`/users/${id}/completed-projects`, { params: { limit: 2 } });
            setProjectData(projectsRes.data);
            fetchFollowers();
        } else if (profileRes.data.role === 'student') {
            const followingRes = await client.get(`/users/${id}/following`);
            setFollowing(followingRes.data);
        } else if (profileRes.data.role === 'student') {
            const projectsRes = await client.get(`/users/${id}/backed-projects`, { params: { limit: 2 } });
            setProjectData(projectsRes.data);
        }

      } catch (error) {
        console.error("Failed to fetch profile", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleUpdate = async () => {
      try {
          await client.patch('/users/me', editForm);
          setProfile({ ...profile, ...editForm });
          setIsEditing(false);
      } catch (error) {
          console.error("Failed to update profile", error);
          alert("Failed to update profile");
      }
  };

  const handleFollow = async (teacherId) => {
    try {
      await client.post(`/users/${teacherId}/follow`);
      if (teacherId === parseInt(id)) {
        setProfile(prev => ({ ...prev, is_following: true, follower_count: prev.follower_count + 1 }));
      }
    } catch (error) {
      console.error("Failed to follow", error);
    }
  };

  const handleUnfollow = async (teacherId) => {
    try {
      await client.delete(`/users/${teacherId}/follow`);
      // If we are on the teacher's profile that we just unfollowed
      if (teacherId === parseInt(id)) {
        setProfile(prev => ({ ...prev, is_following: false, follower_count: prev.follower_count - 1 }));
      }
      // If we are on our own student profile, update the list of teachers we are following
      if (currentUser && currentUser.id === parseInt(id) && profile.role === 'student') {
        setFollowing(prev => prev.filter(t => t.id !== teacherId));
      }
    } catch (error) {
      console.error("Failed to unfollow", error);
    }
  };

  const loadMoreFollowers = () => {
    const newOffset = followerOffset + 10;
    setFollowerOffset(newOffset);
    fetchFollowers(newOffset);
  };

  const formatCurrency = (amountInCents) => new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amountInCents / 100);

  if (loading) return <div className="p-10 text-center">Loading profile...</div>;
  if (!profile) return <div className="p-10 text-center">User not found</div>;

  const isOwner = currentUser && currentUser.id === profile.id;
  const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';
  const hasVerifiedLanguages = profile.verified_languages && profile.verified_languages.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-start">
          <div className="flex items-center">
            {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name} className="h-16 w-16 rounded-full object-cover mr-4" onError={(e) => { e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${profile.full_name}&background=random`; }}/>
            ) : (
                <div className="h-16 w-16 rounded-full bg-kotoba-primary/10 flex items-center justify-center text-kotoba-primary font-bold text-xl mr-4">{getInitials(profile.full_name)}</div>
            )}
            <div>
                <div className="flex items-center gap-x-2">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">{profile.full_name}</h3>
                    {profile.subscription_tier && <SubscriptionBadge tier={profile.subscription_tier} />} {/* Subscription Badge */}
                    {hasVerifiedLanguages && <FaShieldAlt className="text-kotoba-primary" title="This teacher has verified languages" />}
                </div>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                    {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                    {profile.role === 'creator' && profile.average_rating != null && (
                        <span className="ml-3 inline-flex items-center">
                            <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                            <span className="ml-1 font-bold text-gray-700">{profile.average_rating}</span>
                            <Link to={`/teacher/${profile.id}/reviews`} className="ml-3 text-xs text-kotoba-primary hover:underline">See all reviews</Link>
                        </span>
                    )}
                </p>
            </div>
          </div>
          {isOwner ? (
            <button onClick={() => setIsEditing(!isEditing)} className="text-kotoba-primary hover:text-kotoba-primary text-sm font-medium">{isEditing ? 'Cancel' : 'Edit Profile'}</button>
          ) : currentUser && profile.role === 'creator' && (
            profile.is_following ? (
              <button onClick={() => handleUnfollow(profile.id)} className="bg-gray-200 text-gray-700 px-3 py-1 rounded-md text-sm font-medium">Unfollow</button>
            ) : (
              <button onClick={() => handleFollow(profile.id)} className="bg-kotoba-primary text-white px-3 py-1 rounded-md text-sm font-medium">Follow</button>
            )
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
          <dl className="sm:divide-y sm:divide-gray-200">
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Bio</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{isEditing ? <textarea className="w-full border border-gray-300 rounded-md p-2" rows={3} value={editForm.bio} onChange={(e) => setEditForm({...editForm, bio: e.target.value})} /> : (profile.bio || "No bio provided.")}</dd>
            </div>
            
            {profile.role === 'creator' && (
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Languages</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {isEditing ? (
                    <input type="text" className="w-full border border-gray-300 rounded-md p-2" value={editForm.languages} onChange={(e) => setEditForm({...editForm, languages: e.target.value})} placeholder="e.g. Japanese, Spanish" />
                  ) : (
                    <>
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500">Self-Reported</h4>
                        <p>{profile.languages || "None listed."}</p>
                      </div>
                      {hasVerifiedLanguages && (
                        <div className="mt-2">
                          <h4 className="text-xs font-semibold text-gray-500">Verified</h4>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {profile.verified_languages.map(lang => <VerifiedLanguageBadge key={lang} language={lang} />)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </dd>
              </div>
            )}

            {isEditing && (
                <>
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"><dt className="text-sm font-medium text-gray-500">Avatar URL</dt><dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2"><input type="url" className="w-full border border-gray-300 rounded-md p-2" value={editForm.avatar_url} onChange={(e) => setEditForm({...editForm, avatar_url: e.target.value})} placeholder="https://example.com/my-avatar.jpg" /></dd></div>
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"><dt className="text-sm font-medium text-gray-500">Intro Video URL</dt><dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2"><input type="url" className="w-full border border-gray-300 rounded-md p-2" value={editForm.intro_video_url} onChange={(e) => setEditForm({...editForm, intro_video_url: e.target.value})} placeholder="https://youtube.com/..." /></dd></div>
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"><dt className="text-sm font-medium text-gray-500">Sample Video URL</dt><dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2"><input type="url" className="w-full border border-gray-300 rounded-md p-2" value={editForm.sample_video_url} onChange={(e) => setEditForm({...editForm, sample_video_url: e.target.value})} placeholder="https://youtube.com/..." /></dd></div>
                </>
            )}
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Joined</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{new Date(profile.created_at).toLocaleDateString()}</dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Language Groups</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{profile.language_groups.join(', ') || 'Not a member of any groups.'}</dd>
            </div>
          </dl>
        </div>
        {isEditing && <div className="px-4 py-3 bg-gray-50 text-right sm:px-6"><button onClick={handleUpdate} className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none">Save</button></div>}
      </div>

      {profile.role === 'creator' && (
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Followers ({profile.follower_count})</h3>
          {followers.length > 0 ? (
            <div>
              <div className="flex flex-wrap gap-2">
                {followers.map(follower => (
                  <div key={follower.id} className="relative group">
                    <img 
                      src={follower.avatar_url || `https://ui-avatars.com/api/?name=${follower.full_name}&background=random`} 
                      alt={follower.full_name} 
                      className="h-12 w-12 rounded-full object-cover" 
                    />
                    <div className="absolute bottom-full mb-2 w-max px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      {follower.full_name}
                      <br />
                      Pledged: €{(follower.total_pledged / 100).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              {hasMoreFollowers && (
                <button onClick={loadMoreFollowers} className="w-full text-center text-kotoba-primary hover:underline mt-4">Show More</button>
              )}
            </div>
          ) : <p className="text-gray-500">No followers yet.</p>}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        {!isEditing && profile.intro_video_url && (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Introduction</h3>
                <VideoPlayer url={profile.intro_video_url} />
            </div>
        )}

        {!isEditing && profile.sample_video_url && (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Teaching Sample</h3>
                <VideoPlayer url={profile.sample_video_url} />
            </div>
        )}
      </div>

      {profile.role === 'student' && (
        <div className="mt-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Following</h3>
          {following.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {following.map(teacher => (
                <div key={teacher.id} className="relative bg-white p-4 rounded-lg shadow-md flex flex-col items-center text-center hover:shadow-lg transition-shadow group">
                  <Link to={`/profile/${teacher.id}`} className="contents">
                  <img 
                    src={teacher.avatar_url || `https://ui-avatars.com/api/?name=${teacher.full_name}&background=random`} 
                    alt={teacher.full_name} 
                    className="w-20 h-20 rounded-full object-cover mb-4"
                  />
                  <p className="font-semibold text-gray-800">{teacher.full_name}</p>
                  <div className="mt-2 text-sm text-gray-600">
                    <p>You Pledged:</p>
                    <p className="font-bold">{formatCurrency(teacher.total_pledged)}</p>
                  </div>
                  </Link>
                  {isOwner && (
                    <button onClick={() => handleUnfollow(teacher.id)} className="absolute top-1 right-1 bg-red-100 text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                      Unfollow
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Not following any teachers yet.</p>
          )}
        </div>
      )}

      {profile.role === 'creator' && (
          <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Completed Projects</h3>
                {projectData.total_count > 2 && (
                  <Link to={`/teacher/${id}/archive`} className="text-sm font-medium text-kotoba-primary hover:text-kotoba-primary">
                    See all projects &rarr;
                  </Link>
                )}
              </div>
              {projectData.projects.length > 0 ? (
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      {projectData.projects.map(project => (
                          <ProjectCard 
                            key={project.id} 
                            project={project} 
                            currentUser={currentUser}
                            onFollow={handleFollow}
                            onUnfollow={handleUnfollow}
                          />
                      ))}
                  </div>
              ) : (<p className="text-gray-500">This teacher has no completed projects yet.</p>)}
          </div>
      )}

      {profile.role === 'student' && (
          <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Backed Projects</h3>
                {projectData.total_count > 2 && (
                  <Link to={`/student/${id}/archive`} className="text-sm font-medium text-kotoba-primary hover:text-kotoba-primary">
                    See all projects &rarr;
                  </Link>
                )}
              </div>
              {projectData.projects.length > 0 ? (
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      {projectData.projects.map(project => (
                          <ProjectCard 
                            key={project.id} 
                            project={project} 
                            currentUser={currentUser}
                            onFollow={handleFollow}
                            onUnfollow={handleUnfollow}
                          />
                      ))}
                  </div>
              ) : (<p className="text-gray-500">This user has not backed any projects yet.</p>)}
          </div>
      )}
    </div>
  );
};

export default Profile;
