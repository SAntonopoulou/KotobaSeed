import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import MyBookings from '../../components/MyBookings';
import MyRecurringPlans from '../../components/MyRecurringPlans';
import PriorityCreditsCard from '../../components/PriorityCreditsCard';
import { formatDateShort } from '../../utils/dates';

const StudentDashboard = () => {
  const [pledges, setPledges] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const pledgesRes = await client.get('/pledges/me');
      setPledges(pledgesRes.data);
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
      addToast("Could not load your pledges.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // Depend on `location.search` (a string) instead of the whole
  // `location` object — the object identity changes on every in-page
  // navigation (hash, query) and previously caused the fetch to fire
  // repeatedly. The `paymentSuccessSeen` ref guarantees the toast +
  // URL-strip path runs at most once per success param.
  const paymentSuccessSeen = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('payment') === 'success' && !paymentSuccessSeen.current) {
      paymentSuccessSeen.current = true;
      addToast("Thank you for your pledge! It is being processed and will appear below shortly.", "info");
      navigate(location.pathname, { replace: true });
      const timer = setTimeout(() => {
        fetchData();
      }, 3000);
      return () => clearTimeout(timer);
    } else if (params.get('payment') !== 'success') {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, fetchData]);

  const handleConfirmCompletion = async (projectId) => {
    try {
      await client.post(`/projects/${projectId}/confirm-completion`);
      addToast("Project completion confirmed! You can now rate the project.", "success");
      fetchData();
    } catch (error) {
      console.error("Failed to confirm completion", error);
      addToast(error.response?.data?.detail || "Failed to confirm completion.", "error");
    }
  };

  const formatCurrency = (amountInCents) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amountInCents / 100);
  };

  const formatDate = (dateString) => {
    return formatDateShort(dateString);
  };

  if (loading) return <div className="p-10 text-center">Loading dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-kotoba-text mb-6">My dashboard</h1>

      <div className="mb-8">
        <PriorityCreditsCard />
      </div>

      <div className="mb-8">
        <MyRecurringPlans />
      </div>

      <section className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold text-kotoba-text mb-4">My lessons</h2>
        <MyBookings />
      </section>

      <h2 className="text-xl font-bold text-kotoba-text mb-4">My pledges</h2>
      
      {pledges.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-6 text-center">
          <p className="text-kotoba-text/60 mb-4">You haven't backed any projects yet.</p>
          <Link to="/" className="text-kotoba-primary hover:text-kotoba-primary font-medium">
            Browse Projects
          </Link>
        </div>
      ) : (
        <div className="bg-white shadow sm:rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-kotoba-text/10">
            <thead className="bg-kotoba-background/40">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">
                  Project
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">
                  Amount
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-kotoba-text/10">
              {pledges.map((pledge) => (
                <tr key={pledge.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link to={`/projects/${pledge.project_id}`} className="text-kotoba-primary hover:text-kotoba-primary font-medium">
                      {pledge.project_title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-kotoba-text">
                    {formatCurrency(pledge.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-kotoba-text/60">
                    {formatDate(pledge.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        pledge.status === 'captured' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                        Pledge: {pledge.status}
                        </span>
                        <span className="text-xs text-kotoba-text/40 mt-1">
                            Project: {pledge.project_status}
                        </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {pledge.project_status === 'pending_confirmation' && (
                      <button
                        onClick={() => handleConfirmCompletion(pledge.project_id)}
                        className="text-kotoba-primary hover:text-kotoba-primary"
                      >
                        Confirm Completion
                      </button>
                    )}
                    {pledge.project_status === 'completed' && !pledge.has_rated && (
                      <Link to={`/projects/${pledge.project_id}`} className="text-kotoba-primary hover:text-kotoba-primary">
                        Rate Project
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};

export default StudentDashboard;
