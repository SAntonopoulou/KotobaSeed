import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import ProjectCard from '../components/ProjectCard';
import { useToast } from '../context/ToastContext';

const ProjectList = () => {
  const [projectData, setProjectData] = useState({ projects: [], total_count: 0 });
  const [availableFilters, setAvailableFilters] = useState({ languages: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentUser, setCurrentUser] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [language, setLanguage] = useState(searchParams.get('language') || '');
  const [level, setLevel] = useState(searchParams.get('level') || '');
  
  const { addToast } = useToast();

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const userRes = await client.get('/users/me');
          setCurrentUser(userRes.data);
        }
        const filtersRes = await client.get('/projects/filter-options');
        setAvailableFilters(filtersRes.data);
      } catch (err) {
        console.error("Failed to fetch initial data", err);
      }
    };
    fetchInitialData();
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await client.get('/projects/', {
        params: {
          search: searchParams.get('search'),
          language: searchParams.get('language'),
          level: searchParams.get('level'),
        },
      });
      setProjectData(response.data);
    } catch (err) {
      console.error("Failed to fetch projects", err);
      setError("Could not load projects. Please try again later.");
      addToast("Failed to load projects.", "error");
    } finally {
      setLoading(false);
    }
  }, [searchParams, addToast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    setLevel('');
  };

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (language) params.set('language', language);
    if (level) params.set('level', level);
    setSearchParams(params);
  }, [searchTerm, language, level, setSearchParams]);

  const handleFollow = async (teacherId) => {
    try {
      await client.post(`/users/${teacherId}/follow`);
      setProjectData(prevData => ({
        ...prevData,
        projects: prevData.projects.map(p => 
          p.teacher_id === teacherId ? { ...p, is_following_teacher: true } : p
        )
      }));
      addToast("Followed teacher!", "success");
    } catch (error) {
      console.error("Failed to follow", error);
      addToast("Failed to follow teacher.", "error");
    }
  };

  const handleUnfollow = async (teacherId) => {
    try {
      await client.delete(`/users/${teacherId}/follow`);
      setProjectData(prevData => ({
        ...prevData,
        projects: prevData.projects.map(p => 
          p.teacher_id === teacherId ? { ...p, is_following_teacher: false } : p
        )
      }));
      addToast("Unfollowed teacher.", "success");
    } catch (error) {
      console.error("Failed to unfollow", error);
      addToast("Failed to unfollow teacher.", "error");
    }
  };

  const currentLevels = availableFilters.languages.find(l => l.language === language)?.levels || [];

  if (error) return <div className="text-center py-10 text-red-600">{error}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">Discover Projects</h1>
        <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
          Fund the next great piece of comprehensible input, or find a completed project to enjoy.
        </p>
      </div>

      <div className="mb-8 p-4 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by keyword, tag, teacher..."
            className="p-2 border border-gray-300 rounded-md md:col-span-1 focus:ring-kotoba-primary focus:border-kotoba-primary"
          />
          <select value={language} onChange={handleLanguageChange} className="p-2 border border-gray-300 rounded-md focus:ring-kotoba-primary focus:border-kotoba-primary">
            <option value="">All Languages</option>
            {availableFilters.languages.map(lang => <option key={lang.language} value={lang.language}>{lang.language}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="p-2 border border-gray-300 rounded-md focus:ring-kotoba-primary focus:border-kotoba-primary" disabled={!language}>
            <option value="">All Levels</option>
            {currentLevels.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">Loading projects...</div>
      ) : projectData.projects.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-lg shadow">
          <p className="text-gray-500 text-lg mb-4">No projects found matching your criteria.</p>
          <Link
            to="/requests"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none"
          >
            Request a video instead!
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {projectData.projects.map((project) => (
            <ProjectCard 
              key={project.id} 
              project={project}
              currentUser={currentUser}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectList;
