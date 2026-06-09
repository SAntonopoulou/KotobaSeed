import React, { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import ConfirmationModal from '../../components/ConfirmationModal';
import PromptModal from '../../components/PromptModal';
import { useToast } from '../../context/ToastContext';
import { Link } from 'react-router-dom'; // Import Link

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({});
  // Reject-verification prompt — replaces window.prompt with a styled
  // dialog that matches the rest of the admin surface.
  const [rejectState, setRejectState] = useState({ open: false, id: null });
  
  const { addToast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, projectsRes, verificationsRes] = await Promise.all([
        client.get('/admin/stats'),
        client.get('/admin/users'),
        client.get('/projects/'),
        client.get('/admin/verifications')
      ]);
      
      setStats(statsRes.data);
      setUsers(usersRes.data);
      setProjects(projectsRes.data);
      setVerifications(verificationsRes.data);

    } catch (error) {
      console.error("Failed to fetch admin data", error);
      addToast("Failed to load admin dashboard", 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const confirmDeleteUser = (userId) => {
    setModalConfig({
      title: "Delete user",
      message: "Anonymise this user's data and revoke their login access? This can't be undone.",
      confirmText: "Delete user",
      isDanger: true,
      onConfirm: () => handleDeleteUser(userId)
    });
    setModalOpen(true);
  };

  const handleDeleteUser = async (userId) => {
      setModalOpen(false);
      try {
          await client.delete(`/admin/users/${userId}`);
          setUsers(users.filter(u => u.id !== userId));
          addToast("User deleted successfully", 'success');
      } catch (error) {
          console.error("Failed to delete user", error);
          addToast("Failed to delete user", 'error');
      }
  };

  const handleApprove = async (id) => {
    try {
      await client.post(`/admin/verifications/${id}/approve`);
      addToast("Verification approved.", "success");
      fetchData();
    } catch (error) {
      addToast("Failed to approve verification.", "error");
    }
  };

  const handleReject = (id) => {
    setRejectState({ open: true, id });
  };

  const submitReject = async (notes) => {
    const { id } = rejectState;
    setRejectState({ open: false, id: null });
    if (!id) return;
    try {
      await client.post(`/admin/verifications/${id}/reject`, { admin_notes: notes });
      addToast("Verification rejected.", "success");
      fetchData();
    } catch (error) {
      addToast("Failed to reject verification.", "error");
    }
  };

  const formatCurrency = (amountInCents) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amountInCents / 100);

  if (loading) return <div className="p-10 text-center">Loading admin dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-start sm:items-center gap-4 mb-8 flex-wrap">
        <h1 className="text-3xl font-bold text-kotoba-text">Admin Dashboard</h1>
        <div className="flex gap-2 flex-wrap">
          <Link to="/admin/audit-log">
            <button className="bg-white border border-kotoba-text/20 hover:bg-kotoba-background/40 text-kotoba-text/80 font-medium py-2 px-4 rounded">
              Audit log
            </button>
          </Link>
          <Link to="/admin/database">
            <button className="bg-white border border-kotoba-text/20 hover:bg-kotoba-background/40 text-kotoba-text/80 font-medium py-2 px-4 rounded">
              Database
            </button>
          </Link>
          <Link to="/admin/grants">
            <button className="bg-white border border-kotoba-text/20 hover:bg-kotoba-background/40 text-kotoba-text/80 font-medium py-2 px-4 rounded">
              Comps &amp; grants
            </button>
          </Link>
          <Link to="/admin/custom-themes">
            <button className="bg-white border border-kotoba-text/20 hover:bg-kotoba-background/40 text-kotoba-text/80 font-medium py-2 px-4 rounded">
              Custom themes
            </button>
          </Link>
          <Link to="/admin/settings">
            <button className="bg-white border border-kotoba-text/20 hover:bg-kotoba-background/40 text-kotoba-text/80 font-medium py-2 px-4 rounded">
              Platform settings
            </button>
          </Link>
          <Link to="/admin/staff">
            <button className="bg-white border border-kotoba-text/20 hover:bg-kotoba-background/40 text-kotoba-text/80 font-medium py-2 px-4 rounded">
              Staff
            </button>
          </Link>
          <Link to="/admin/reports">
            <button className="bg-white border border-kotoba-text/20 hover:bg-kotoba-background/40 text-kotoba-text/80 font-medium py-2 px-4 rounded">
              DSA notices
            </button>
          </Link>
          <Link to="/admin/announcements">
            <button className="bg-white border border-kotoba-text/20 hover:bg-kotoba-background/40 text-kotoba-text/80 font-medium py-2 px-4 rounded">
              Announcements
            </button>
          </Link>
          <Link to="/staff/support">
            <button className="bg-white border border-kotoba-text/20 hover:bg-kotoba-background/40 text-kotoba-text/80 font-medium py-2 px-4 rounded">
              Support queue
            </button>
          </Link>
          <Link to="/admin/affiliates">
            <button className="bg-white border border-kotoba-text/20 hover:bg-kotoba-background/40 text-kotoba-text/80 font-medium py-2 px-4 rounded">
              Affiliates
            </button>
          </Link>
          <Link to="/admin/projects">
            <button className="bg-kotoba-primary hover:bg-kotoba-primary/90 text-white font-bold py-2 px-4 rounded">
              Project Management
            </button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg"><div className="px-4 py-5 sm:p-6"><dt className="text-sm font-medium text-kotoba-text/60 truncate">Total Users</dt><dd className="mt-1 text-3xl font-semibold text-kotoba-text">{stats?.user_count}</dd></div></div>
        <div className="bg-white overflow-hidden shadow rounded-lg"><div className="px-4 py-5 sm:p-6"><dt className="text-sm font-medium text-kotoba-text/60 truncate">Total Projects</dt><dd className="mt-1 text-3xl font-semibold text-kotoba-text">{stats?.project_count}</dd></div></div>
        <div className="bg-white overflow-hidden shadow rounded-lg"><div className="px-4 py-5 sm:p-6"><dt className="text-sm font-medium text-kotoba-text/60 truncate">Total Pledges</dt><dd className="mt-1 text-3xl font-semibold text-kotoba-text">{stats?.pledge_count}</dd></div></div>
        <div className="bg-white overflow-hidden shadow rounded-lg"><div className="px-4 py-5 sm:p-6"><dt className="text-sm font-medium text-kotoba-text/60 truncate">Funds Raised</dt><dd className="mt-1 text-3xl font-semibold text-green-600">{formatCurrency(stats?.total_funds_raised)}</dd></div></div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-bold text-kotoba-text mb-4">Verification Requests</h2>
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="max-h-96 overflow-auto">
            <table className="min-w-full divide-y divide-kotoba-text/10">
              <thead className="bg-kotoba-background/40 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase">Teacher</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase">Language</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase">Document</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-kotoba-text/60 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-kotoba-text/10">
                {verifications.map((v) => (
                  <tr key={v.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-kotoba-text">{v.teacher_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-kotoba-text/60">{v.language}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-kotoba-text/60"><a href={v.document_url} target="_blank" rel="noopener noreferrer" className="text-kotoba-primary hover:underline">View Document</a></td>
                    <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${v.status === 'approved' ? 'bg-green-100 text-green-800' : v.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{v.status}</span></td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {v.status === 'pending' && (
                        <div className="flex space-x-2">
                          <button onClick={() => handleApprove(v.id)} className="text-green-600 hover:text-green-900">Approve</button>
                          <button onClick={() => handleReject(v.id)} className="text-red-600 hover:text-red-900">Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-bold text-kotoba-text mb-4">Users</h2>
        <div className="bg-white shadow overflow-hidden sm:rounded-lg"><ul className="divide-y divide-kotoba-text/10 max-h-96 overflow-y-auto">{users.map((user) => (<li key={user.id} className="px-4 py-4 flex items-center justify-between hover:bg-kotoba-background/40"><div><p className="text-sm font-medium text-kotoba-primary truncate">{user.full_name}</p><p className="text-sm text-kotoba-text/60">{user.email} - <span className="capitalize">{user.role}</span></p></div>{user.role !== 'admin' && (<button onClick={() => confirmDeleteUser(user.id)} className="text-red-600 hover:text-red-900 text-sm font-medium">Delete</button>)}</li>))}</ul></div>
      </div>

      <ConfirmationModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onConfirm={modalConfig.onConfirm} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} isDanger={modalConfig.isDanger} />
      <PromptModal
        open={rejectState.open}
        title="Reject verification"
        description="Reason for rejection — sent to the tutor's notification so they can fix it."
        placeholder="e.g. ID image is blurry, please re-upload"
        submitLabel="Reject"
        isDanger
        onCancel={() => setRejectState({ open: false, id: null })}
        onSubmit={submitReject}
      />
    </div>
  );
};

export default AdminDashboard;
