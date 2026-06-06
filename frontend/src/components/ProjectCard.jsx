import React from 'react';
import { Link } from 'react-router-dom';
import { getVideoThumbnail } from '../utils/video';
import VerifiedBadge from './VerifiedBadge';
import defaultProjectImage from '../assets/default_project_image.svg';

const ProjectCard = ({ project, currentUser, onFollow, onUnfollow }) => {
  const percentage = project.funding_goal > 0 ? (project.current_funding / project.funding_goal) * 100 : 0;

  let imageUrl = defaultProjectImage;
  if (project.project_image_url) {
    imageUrl = project.project_image_url;
  } else if (!project.is_series && project.videos && project.videos.length > 0) {
    imageUrl = getVideoThumbnail(project.videos[0]);
  }

  const isFollowing = project.is_following_teacher;
  const canFollow = currentUser && currentUser.id !== project.teacher_id;

  const handleFollowClick = (e) => {
    e.preventDefault();
    onFollow(project.teacher_id);
  };

  const handleUnfollowClick = (e) => {
    e.preventDefault();
    onUnfollow(project.teacher_id);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col h-full">
      <Link to={`/projects/${project.id}`}>
        <div className="h-48 bg-gray-200 flex items-center justify-center overflow-hidden">
          <img src={imageUrl} alt={project.title} className="w-full h-full object-cover" />
        </div>
      </Link>
      <div className="p-6 flex flex-col flex-grow">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          <Link to={`/projects/${project.id}`} className="hover:text-kotoba-primary">{project.title}</Link>
        </h3>
        <p className="text-sm text-gray-600 mb-4 flex-grow">{project.description.substring(0, 100)}...</p>
        
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-kotoba-primary">
              €{(project.current_funding / 100).toFixed(2)}
            </span>
            <span className="text-sm text-gray-500">
              raised of €{(project.funding_goal / 100).toFixed(2)}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-kotoba-primary h-2.5 rounded-full" 
              style={{ width: `${percentage > 100 ? 100 : percentage}%` }}
            ></div>
          </div>
          <div className="text-right text-sm font-medium text-gray-700 mt-1">
            {Math.round(percentage)}% funded
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-gray-200">
          <div className="flex items-center">
            <Link to={`/profile/${project.teacher_id}`} className="w-10 h-10 bg-gray-300 rounded-full mr-3 overflow-hidden">
              {project.teacher_avatar_url ? (
                <img src={project.teacher_avatar_url} alt={project.teacher_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-200"></div>
              )}
            </Link>
            <div className="flex-grow">
              <div className="flex items-center">
                <Link to={`/profile/${project.teacher_id}`} className="text-sm font-medium text-gray-900 hover:text-kotoba-primary">{project.teacher_name}</Link>
                <VerifiedBadge languages={project.teacher_verified_languages} />
              </div>
              <p className="text-sm text-gray-500">{project.language} - {project.level}</p>
            </div>
            {canFollow && (
              isFollowing ? (
                <button onClick={handleUnfollowClick} className="bg-gray-200 text-gray-700 px-3 py-1 rounded-md text-sm font-medium">Unfollow</button>
              ) : (
                <button onClick={handleFollowClick} className="bg-kotoba-primary text-white px-3 py-1 rounded-md text-sm font-medium">Follow</button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
