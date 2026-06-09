import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import ProjectCard from '../../components/ProjectCard';
import { useToast } from '../../context/ToastContext';

const StudentArchive = () => {
  const { id } = useParams();
  const [projectData, setProjectData] = useState({ projects: [], total_count: 0 });
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const { addToast } = useToast();

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const studentRes = await client.get(`/users/${id}/profile`);
        setStudent(studentRes.data);
      } catch (err) {
        console.error("Failed to fetch student data", err);
        setError("Could not load student's archive. Please try again later.");
        addToast("Failed to load page data.", "error");
      }
    };
    fetchInitialData();
  }, [id, addToast]);

  const fetchProjects = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await client.get(`/users/${id}/backed-projects`, {
        params: {
          limit: 100, // Fetch all for this page
        },
      });
      if (response?.data && Array.isArray(response.data.projects)) {
        setProjectData(response.data);
      }
    } catch (err) {
      console.error("Failed to fetch student's backed projects", err);
      setError("Could not load projects. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (error) return <div className="text-center py-10 text-red-600">{error}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-kotoba-text sm:text-5xl">
          {student ? `Projects Backed by ${student.full_name}` : 'Backed Projects'}
        </h1>
      </div>

      {loading ? (
        <div className="text-center py-10">Loading projects...</div>
      ) : (projectData?.projects?.length ?? 0) === 0 ? (
        <div className="text-center py-10">
          <p className="text-kotoba-text/60">This user has not backed any projects yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {(projectData?.projects ?? []).map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentArchive;
