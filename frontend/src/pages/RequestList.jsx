import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import ConfirmationModal from '../components/ConfirmationModal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext'; // Import useAuth

const RequestList = () => {
  const [requests, setRequests] = useState([]);
  const [myOpenRequests, setMyOpenRequests] = useState([]);
  const [myAcceptedRequests, setMyAcceptedRequests] = useState([]);
  const [communityRequests, setCommunityRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newRequest, setNewRequest] = useState({
    title: '',
    description: '',
    language: '',
    level: '',
    budget: 0,
    target_teacher_id: null,
    is_private: false,
    is_series: false,
    num_videos: null
  });
  const [usePriorityCredit, setUsePriorityCredit] = useState(false); // New state for priority credit
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherResults, setTeacherResults] = useState([]);
  const [selectedTeacherName, setSelectedTeacherName] = useState('');
  const [availableFilters, setAvailableFilters] = useState({ languages: [] });
  
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [requestToCancel, setRequestToCancel] = useState(null);

  const navigate = useNavigate();
  const { addToast } = useToast();
  const { currentUser } = useAuth(); // Get currentUser from AuthContext

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [requestsRes, filtersRes] = await Promise.all([
        client.get('/requests/'),
        client.get('/projects/filter-options')
      ]);
      
      setRequests(requestsRes.data);
      // Defensive: a partial filter-options payload would otherwise blow
      // up the .map / .flatMap reads further down.
      if (filtersRes?.data && Array.isArray(filtersRes.data.languages)) {
        setAvailableFilters(filtersRes.data);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      addToast('Error fetching data', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    if (!currentUser || !requests) return;

    const myOpen = requests.filter(req => 
      req.user_id === currentUser.id && (req.status === 'open' || req.status === 'negotiating')
    );
    const myAccepted = requests.filter(req => 
      req.user_id === currentUser.id && req.status === 'accepted'
    );
    const community = requests.filter(req => 
      req.user_id !== currentUser.id && 
      (req.status === 'open' || req.status === 'negotiating') &&
      (req.is_private === false || (currentUser.role === 'creator' && req.target_teacher_id === currentUser.id))
    );

    setMyOpenRequests(myOpen);
    setMyAcceptedRequests(myAccepted);
    setCommunityRequests(community);

  }, [requests, currentUser]);

  useEffect(() => {
    const searchTeachers = async () => {
      if (teacherSearch.length > 0) {
        try {
          const response = await client.get('/users/teachers', { params: { query: teacherSearch } });
          setTeacherResults(response.data);
        } catch (error) { console.error("Failed to search teachers", error); }
      } else {
        setTeacherResults([]);
      }
    };
    const timeoutId = setTimeout(searchTeachers, 300);
    return () => clearTimeout(timeoutId);
  }, [teacherSearch]);

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    try {
      const payload = { 
        ...newRequest, 
        budget: Math.round(newRequest.budget * 100),
        num_videos: newRequest.is_series ? newRequest.num_videos : null,
        use_priority_credit: usePriorityCredit, // Include priority credit flag
      };
      await client.post('/requests/', payload);
      setShowModal(false);
      setNewRequest({ title: '', description: '', language: '', level: '', budget: 0, target_teacher_id: null, is_private: false, is_series: false, num_videos: null });
      setUsePriorityCredit(false); // Reset priority credit checkbox
      setSelectedTeacherName('');
      setTeacherSearch('');
      addToast('Request created successfully!', 'success');
      const response = await client.get('/requests/');
      setRequests(response.data);
    } catch (error) {
      console.error("Failed to create request", error);
      addToast(error.response?.data?.detail || 'Failed to create request', 'error');
    }
  };

  const handleDiscussWithStudent = async (requestId) => {
    try {
      const response = await client.post('/conversations/', { request_id: requestId });
      addToast('Conversation started!', 'success');
      navigate(`/messages/${response.data.id}`);
    } catch (error) {
      console.error("Failed to start conversation", error);
      addToast(error.response?.data?.detail || 'Failed to start conversation', 'error');
    }
  };

  const confirmCancelRequest = (requestId) => {
      setRequestToCancel(requestId);
      setConfirmModalOpen(true);
  };

  const handleCancelRequest = async () => {
      setConfirmModalOpen(false);
      if (!requestToCancel) return;
      try {
          await client.post(`/requests/${requestToCancel}/cancel`);
          addToast('Request cancelled', 'success');
          const response = await client.get('/requests/');
          setRequests(response.data);
      } catch (error) {
          console.error("Failed to cancel request", error);
          addToast(error.response?.data?.detail || "Failed to cancel request", 'error');
      }
  };

  const formatCurrency = (amountInCents) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amountInCents / 100);

  const allLanguages = (availableFilters?.languages ?? []).map(l => l.language);
  const allLevels = [...new Set((availableFilters?.languages ?? []).flatMap(l => l.levels))];
  const userHasRequests = myOpenRequests.length > 0 || myAcceptedRequests.length > 0;
  const isPremiumStudent = currentUser && currentUser.subscription_tier === 'premium';

  const renderEmptyState = () => (
    <div className="text-center py-16 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-kotoba-text/90">Don't see the content you need?</h2>
      <p className="mt-2 text-kotoba-text/70">Request it directly from our community of teachers.</p>
      <button onClick={() => setShowModal(true)} className="mt-6 inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none">
        Post Your First Request
      </button>
    </div>
  );

  const renderRequestHeader = () => (
    <div className="mb-8 p-6 bg-white rounded-lg shadow-md">
        <div className="flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold text-kotoba-text/90">Have another great idea?</h2>
                <p className="mt-1 text-kotoba-text/70">Let our teachers know what you'd like to see next.</p>
            </div>
            <button onClick={() => setShowModal(true)} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none">
                Post a Request
            </button>
        </div>
    </div>
  );

  const renderRequestCard = (req) => {
    const isAccepted = req.status === 'accepted';
    const title = isAccepted ? req.project_title : req.title;
    const description = isAccepted ? req.project_description : req.description;
    const budget = isAccepted ? req.project_funding_goal : req.budget;

    return (
      <div key={req.id} className={`bg-white overflow-hidden shadow rounded-lg border ${req.target_teacher_id ? 'border-kotoba-primary/30 ring-1 ring-kotoba-primary' : 'border-kotoba-text/10'}`}>
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-between items-start">
              <h3 className="text-lg leading-6 font-medium text-kotoba-text mb-2">{title}</h3>
              <div className="flex flex-col items-end space-y-1">
                  {req.target_teacher_id && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-kotoba-primary/10 text-kotoba-primary">Targeted</span>}
                  {req.is_private && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-kotoba-background/60 text-kotoba-text/90">Private</span>}
              </div>
          </div>
          <div className="flex space-x-2 mb-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-kotoba-secondary/20 text-kotoba-text">{req.language}</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">{req.level}</span>
          </div>
          {req.is_series && (
            <div className="mb-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Series: {req.num_videos} videos
              </span>
            </div>
          )}
          <p className="text-sm text-kotoba-text/60 mb-4 line-clamp-3">{description}</p>
          <div className="mb-4">
              <p className="text-sm font-medium text-kotoba-text">Budget: {formatCurrency(budget)}</p>
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-kotoba-text/5">
            <span className="text-xs text-kotoba-text/40">Requested by {req.user_name}</span>
            {currentUser && currentUser.role === 'creator' && req.user_id !== currentUser.id && (req.status === 'open' || req.status === 'negotiating') && (
              <button onClick={() => handleDiscussWithStudent(req.id)} className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-kotoba-primary hover:bg-kotoba-primary/90">Discuss with Student</button>
            )}
            {currentUser && currentUser.id === req.user_id && (req.status === 'open' || req.status === 'negotiating') && (
              <button onClick={() => confirmCancelRequest(req.id)} className="inline-flex items-center px-2 py-1 border border-kotoba-text/20 text-xs font-medium rounded text-kotoba-text/60 bg-white hover:bg-kotoba-background/40">Cancel Request</button>
            )}
            {currentUser && currentUser.id === req.user_id && req.status === 'accepted' && req.associated_project_id && (
              <Link to={`/projects/${req.associated_project_id}`} className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700">View Project</Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {loading || !currentUser ? <div className="text-center py-10">Loading...</div> : (
        <>
          {!userHasRequests && renderEmptyState()}
          {userHasRequests && renderRequestHeader()}
          
          {myOpenRequests.length > 0 && (
            <div className="mt-8">
              <h2 className="text-2xl font-bold text-kotoba-text mb-4">My Open Requests</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {myOpenRequests.map(renderRequestCard)}
              </div>
            </div>
          )}

          {myAcceptedRequests.length > 0 && (
            <div className="mt-12">
              <h2 className="text-2xl font-bold text-kotoba-text mb-4">My Accepted Projects</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {myAcceptedRequests.map(renderRequestCard)}
              </div>
            </div>
          )}

          {communityRequests.length > 0 && (
            <div className="mt-12">
              <h2 className="text-2xl font-bold text-kotoba-text mb-4">Community Requests</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {communityRequests.map(renderRequestCard)}
              </div>
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto"><div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true"><div className="absolute inset-0 bg-gray-500 opacity-75"></div></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleCreateRequest}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-kotoba-text mb-4">What content do you want to see?</h3>
                  <p className="text-sm text-kotoba-text/60 mb-4">Describe the video you'd like a teacher to create. Be as specific as you can!</p>
                  <div className="space-y-4">
                    <div><label className="block text-sm font-medium text-kotoba-text/80">Title</label><input type="text" required className="mt-1 block w-full border border-kotoba-text/20 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm" value={newRequest.title} onChange={(e) => setNewRequest({...newRequest, title: e.target.value})} /></div>
                    <div><label className="block text-sm font-medium text-kotoba-text/80">Description</label><textarea required rows={3} className="mt-1 block w-full border border-kotoba-text/20 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm" value={newRequest.description} onChange={(e) => setNewRequest({...newRequest, description: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-kotoba-text/80">Language</label>
                        <input type="text" list="languages" required className="mt-1 block w-full border border-kotoba-text/20 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm" value={newRequest.language} onChange={(e) => setNewRequest({...newRequest, language: e.target.value})} />
                        <datalist id="languages">{allLanguages.map(lang => <option key={lang} value={lang} />)}</datalist>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-kotoba-text/80">Level</label>
                        <input type="text" list="levels" required className="mt-1 block w-full border border-kotoba-text/20 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm" value={newRequest.level} onChange={(e) => setNewRequest({...newRequest, level: e.target.value})} />
                        <datalist id="levels">{allLevels.map(lvl => <option key={lvl} value={lvl} />)}</datalist>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <input id="is_series" name="is_series" type="checkbox" className="h-4 w-4 text-kotoba-primary border-kotoba-text/20 rounded" checked={newRequest.is_series} onChange={(e) => setNewRequest({...newRequest, is_series: e.target.checked, num_videos: e.target.checked ? 1 : null})} />
                      <label htmlFor="is_series" className="ml-2 block text-sm text-kotoba-text">Is this a series?</label>
                    </div>
                    {newRequest.is_series && (
                      <div>
                        <label className="block text-sm font-medium text-kotoba-text/80">Number of Videos</label>
                        <input type="number" min="1" required className="mt-1 block w-full border border-kotoba-text/20 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm" value={newRequest.num_videos || ''} onChange={(e) => setNewRequest({...newRequest, num_videos: parseInt(e.target.value, 10)})} />
                      </div>
                    )}
                    <div><label className="block text-sm font-medium text-kotoba-text/80">Budget (EUR)</label><input type="number" min="0" className="mt-1 block w-full border border-kotoba-text/20 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm" value={newRequest.budget} onChange={(e) => setNewRequest({...newRequest, budget: e.target.value})} /></div>
                    <div className="relative">
                        <label className="block text-sm font-medium text-kotoba-text/80">Target Teacher (Optional)</label>
                        <input type="text" placeholder="Search by name..." className="mt-1 block w-full border border-kotoba-text/20 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary sm:text-sm" value={selectedTeacherName || teacherSearch} onChange={(e) => { setTeacherSearch(e.target.value); setSelectedTeacherName(''); setNewRequest({...newRequest, target_teacher_id: null}); }} />
                        {teacherResults.length > 0 && !selectedTeacherName && (
                            <ul className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                                {teacherResults.map((teacher) => <li key={teacher.id} className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-kotoba-primary/90 hover:text-white" onClick={() => { setNewRequest({...newRequest, target_teacher_id: teacher.id}); setSelectedTeacherName(teacher.full_name); setTeacherResults([]); }}>{teacher.full_name}</li>)}
                            </ul>
                        )}
                    </div>
                    {newRequest.target_teacher_id && <div className="flex items-center"><input id="is_private" name="is_private" type="checkbox" className="h-4 w-4 text-kotoba-primary focus:ring-kotoba-primary border-kotoba-text/20 rounded" checked={newRequest.is_private} onChange={(e) => setNewRequest({...newRequest, is_private: e.target.checked})} /><label htmlFor="is_private" className="ml-2 block text-sm text-kotoba-text">Private Request (Only visible to target teacher)</label></div>}
                    
                    {isPremiumStudent && (
                      <div className="flex items-center mt-4">
                        <input
                          id="use_priority_credit"
                          name="use_priority_credit"
                          type="checkbox"
                          className="h-4 w-4 text-kotoba-primary border-kotoba-text/20 rounded"
                          checked={usePriorityCredit}
                          onChange={(e) => setUsePriorityCredit(e.target.checked)}
                        />
                        <label htmlFor="use_priority_credit" className="ml-2 block text-sm text-kotoba-text">
                          Use my monthly Priority Credit (€5 instant funding)
                        </label>
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-kotoba-background/40 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button type="submit" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-kotoba-primary text-base font-medium text-white hover:bg-kotoba-primary/90 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm">Post Request</button>
                  <button type="button" onClick={() => setShowModal(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-kotoba-text/20 shadow-sm px-4 py-2 bg-white text-base font-medium text-kotoba-text/80 hover:bg-kotoba-background/40 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal isOpen={confirmModalOpen} onClose={() => setConfirmModalOpen(false)} onConfirm={handleCancelRequest} title="Cancel Request" message="Are you sure you want to cancel this request? This cannot be undone." confirmText="Cancel Request" isDanger={true} />
    </div>
  );
};

export default RequestList;
