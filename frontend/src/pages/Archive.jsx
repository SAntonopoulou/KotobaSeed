import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';
import ProjectCard from '../components/ProjectCard';
import { useToast } from '../context/ToastContext';

const Archive = () => {
  const [projectData, setProjectData] = useState({ projects: [], total_count: 0 });
  const [availableFilters, setAvailableFilters] = useState({ languages: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [language, setLanguage] = useState(searchParams.get('language') || '');
  const [level, setLevel] = useState(searchParams.get('level') || '');
  
  const { addToast } = useToast();

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const response = await client.get('/projects/filter-options');
        const data = response?.data;
        if (data && Array.isArray(data.languages)) {
          setAvailableFilters(data);
        }
      } catch (err) {
        console.error("Failed to fetch filter options", err);
      }
    };
    fetchFilterOptions();
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await client.get('/projects/archive', {
        params: {
          search: searchParams.get('search'),
          language: searchParams.get('language'),
          level: searchParams.get('level'),
        },
      });
      setProjectData(response.data);
    } catch (err) {
      console.error("Failed to fetch archived projects", err);
      setError("Could not load the project archive. Please try again later.");
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

  const currentLevels = (availableFilters?.languages ?? [])
    .find(l => l.language === language)?.levels || [];

  if (error) return <div className="text-center py-10 text-red-600">{error}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-kotoba-text sm:text-5xl">Project Archive</h1>
        <p className="mt-4 max-w-2xl mx-auto text-xl text-kotoba-text/60">
          Browse all the successfully completed projects on the platform.
        </p>
      </div>

      <div className="mb-8 p-4 bg-kotoba-background/40 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by keyword, tag, teacher..."
            className="p-2 border border-kotoba-text/20 rounded-md md:col-span-1 focus:ring-kotoba-primary focus:border-kotoba-primary"
          />
          <select value={language} onChange={handleLanguageChange} className="p-2 border border-kotoba-text/20 rounded-md focus:ring-kotoba-primary focus:border-kotoba-primary">
            <option value="">All Languages</option>
            {availableFilters.languages.map(lang => <option key={lang.language} value={lang.language}>{lang.language}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="p-2 border border-kotoba-text/20 rounded-md focus:ring-kotoba-primary focus:border-kotoba-primary" disabled={!language}>
            <option value="">All Levels</option>
            {currentLevels.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">Loading projects...</div>
      ) : projectData.projects.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-kotoba-text/60">No completed projects found for the selected filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {projectData.projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Archive;
