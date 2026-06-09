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
        const filters = filtersRes?.data;
        if (filters && Array.isArray(filters.languages)) {
          setAvailableFilters(filters);
        }
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

  const currentLevels = (availableFilters?.languages ?? [])
    .find(l => l.language === language)?.levels || [];

  if (error) return (
    <div className="font-sans max-w-3xl mx-auto px-4 py-16 text-center">
      <div className="bg-white rounded-3xl shadow-soft p-8 text-red-600 text-sm">{error}</div>
    </div>
  );

  const inputCls =
    'w-full px-4 py-2.5 border border-kotoba-text/15 rounded-2xl placeholder-kotoba-text/40 focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 text-sm transition-all bg-white';

  return (
    <div className="font-sans bg-kotoba-background min-h-screen text-kotoba-text">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
            Project archive
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold text-kotoba-primary leading-tight tracking-[-0.02em]">
            {teacher ? `${teacher.full_name}'s archive` : 'Project archive'}
          </h1>
          <p className="mt-4 text-lg text-kotoba-text/75 leading-relaxed">
            Browse all completed projects from this teacher.
          </p>
        </div>

        <div className="mb-10 p-5 bg-white rounded-3xl shadow-soft">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search projects…"
              className={inputCls}
            />
            <select value={language} onChange={handleLanguageChange} className={inputCls}>
              <option value="">All languages</option>
              {availableFilters.languages.map(lang => <option key={lang.language} value={lang.language}>{lang.language}</option>)}
            </select>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputCls} disabled={!language}>
              <option value="">All levels</option>
              {currentLevels.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-kotoba-text/60">Loading projects…</div>
        ) : projectData.projects.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl shadow-soft">
            <p className="text-kotoba-text/70">No completed projects found for the selected filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {projectData.projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherArchive;
