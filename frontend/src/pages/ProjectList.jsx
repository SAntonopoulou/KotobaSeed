import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import ProjectCard from '../components/ProjectCard';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const ProjectList = () => {
  const [projectData, setProjectData] = useState({ projects: [], total_count: 0 });
  const [availableFilters, setAvailableFilters] = useState({ languages: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Single source of truth for who's signed in — works under SSO cookie.
  const { currentUser } = useAuth();

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [language, setLanguage] = useState(searchParams.get('language') || '');
  const [level, setLevel] = useState(searchParams.get('level') || '');

  const { addToast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const filtersRes = await client.get('/projects/filter-options');
        // Defensive: only adopt the response if it actually carries the
        // `languages` array. A partial / unexpected payload (empty body,
        // proxy intermediary, etc.) would otherwise overwrite the
        // initial `{ languages: [] }` state with something that has no
        // `.languages` field, and `currentLevels` below would crash.
        const data = filtersRes?.data;
        if (data && Array.isArray(data.languages)) {
          setAvailableFilters(data);
        }
      } catch (err) {
        console.error("Failed to fetch initial data", err);
      }
    })();
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
      // Only adopt the response when the shape matches. A partial payload
      // (e.g. backend hiccup, intermediary, or future endpoint drift) would
      // otherwise wipe the initial `{ projects: [], total_count: 0 }` shape
      // and crash the render path below.
      const data = response?.data;
      if (data && Array.isArray(data.projects)) {
        setProjectData(data);
      } else {
        setProjectData({ projects: [], total_count: 0 });
      }
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
        projects: (prevData?.projects ?? []).map(p =>
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
        projects: (prevData?.projects ?? []).map(p =>
          p.teacher_id === teacherId ? { ...p, is_following_teacher: false } : p
        )
      }));
      addToast("Unfollowed teacher.", "success");
    } catch (error) {
      console.error("Failed to unfollow", error);
      addToast("Failed to unfollow teacher.", "error");
    }
  };

  const currentLevels = (availableFilters?.languages ?? [])
    .find(l => l.language === language)?.levels || [];

  if (error) return (
    <div className="font-sans max-w-3xl mx-auto px-4 py-16 text-center">
      <div className="bg-white rounded-3xl shadow-soft p-8">
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    </div>
  );

  const inputCls =
    'w-full px-4 py-2.5 border border-kotoba-text/15 rounded-2xl placeholder-kotoba-text/40 focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 text-sm transition-all bg-white';

  return (
    <div className="font-sans max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
          Marketplace
        </p>
        <h1 className="mt-2 font-display text-5xl sm:text-6xl font-bold text-kotoba-primary leading-[1.05] tracking-[-0.02em]">
          Discover projects
        </h1>
        <p className="mt-4 text-lg text-kotoba-text/75 leading-relaxed">
          Fund the next great piece of comprehensible input, or find a completed project to enjoy.
        </p>
      </div>

      <div className="mb-10 p-5 bg-white rounded-3xl shadow-soft">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by keyword, tag, teacher…"
            className={inputCls}
          />
          <select value={language} onChange={handleLanguageChange} className={inputCls}>
            <option value="">All languages</option>
            {(availableFilters?.languages ?? []).map(lang => <option key={lang.language} value={lang.language}>{lang.language}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputCls} disabled={!language}>
            <option value="">All levels</option>
            {currentLevels.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-kotoba-text/60">Loading projects…</div>
      ) : (projectData?.projects?.length ?? 0) === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl shadow-soft">
          <p className="text-kotoba-text/70 text-lg mb-5">No projects found matching your criteria.</p>
          <Link
            to="/requests"
            className="group inline-flex items-center px-6 py-3 rounded-2xl bg-kotoba-primary text-white font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-soft"
          >
            Request a video instead
            <span
              className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            >
              →
            </span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {(projectData?.projects ?? []).map((project) => (
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
