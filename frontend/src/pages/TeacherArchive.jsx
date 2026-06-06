import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import ProjectCard from '../components/ProjectCard';
import { useToast } from '../context/ToastContext';

const TeacherArchive = () => {
  const { id } = useParams();
  const [projectData, setProjectData] = useState({ projects: [], total_count: 0 });
  const [teacher, setTeacher] = useState(null);
  const [availableFilters, setAvailableFilters] = useState({ languages: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [language, setLanguage] = useState(searchParams.get('language') || '');
  const [level, setLevel] = useState(searchParams.get('level') || '');
  
  const { addToast } = useToast();

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [teacherRes, filtersRes] = await Promise.all([
          client.get(`/users/${id}/profile`),
          client.get(`/users/${id}/completed-projects/filter-options`)
        ]);
        setTeacher(teacherRes.data);
        setAvailableFilters(filtersRes.data);
      } catch (err) {
        console.error("Failed to fetch initial data", err);
        setError("Could not load teacher's archive. Please try again later.");
        addToast("Failed to load page data.", "error");
      }
    };
    fetchInitialData();
  }, [id, addToast]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await client.get(`/users/${id}/completed-projects`, {
        params: {
          search: searchParams.get('search'),
          language: searchParams.get('language'),
          level: searchParams.get('level'),
          limit: 100, // Fetch all for this page
        },
      });
      setProjectData(response.data);
    } catch (err) {
      console.error("Failed to fetch teacher's projects", err);
      setError("Could not load projects. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [id, searchParams]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (language) params.set('language', language);
    if (level) params.set('level', level);
    setSearchParams(params);
  }, [searchTerm, language, level, setSearchParams]);

  const handleLanguageChange = (e) => {
    setLanguage(e.target.value);
    setLevel('');
  };

  const currentLevels = availableFilters.languages.find(l => l.language === language)?.levels || [];

  if (error) return <div className="text-center py-10 text-red-600">{error}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
          {teacher ? `Project Archive for ${teacher.full_name}` : 'Project Archive'}
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
          Browse all completed projects from this teacher.
        </p>
      </div>

      <div className="mb-8 p-4 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search projects..."
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
        <div className="text-center py-10">
          <p className="text-gray-500">No completed projects found for the selected filters.</p>
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

export default TeacherArchive;
