import React, { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import ConfirmationModal from '../../components/ConfirmationModal';
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
      title: "Delete User",
      message: "Are you sure? This will anonymize their data and remove their login access.",
      confirmText: "Delete User",
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

  const handleReject = async (id) => {
    const notes = prompt("Reason for rejection (optional):");
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
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="flex gap-2">
          <Link to="/admin/audit-log">
            <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded">
              Audit log
            </button>
          </Link>
          <Link to="/admin/settings">
            <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded">
              Platform settings
            </button>
          </Link>
          <Link to="/admin/staff">
            <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded">
              Staff
            </button>
          </Link>
          <Link to="/staff/support">
            <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded">
              Support queue
            </button>
          </Link>
          <Link to="/admin/affiliates">
            <button className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded">
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
        <div className="bg-white overflow-hidden shadow rounded-lg"><div className="px-4 py-5 sm:p-6"><dt className="text-sm font-medium text-gray-500 truncate">Total Users</dt><dd className="mt-1 text-3xl font-semibold text-gray-900">{stats?.user_count}</dd></div></div>
        <div className="bg-white overflow-hidden shadow rounded-lg"><div className="px-4 py-5 sm:p-6"><dt className="text-sm font-medium text-gray-500 truncate">Total Projects</dt><dd className="mt-1 text-3xl font-semibold text-gray-900">{stats?.project_count}</dd></div></div>
        <div className="bg-white overflow-hidden shadow rounded-lg"><div className="px-4 py-5 sm:p-6"><dt className="text-sm font-medium text-gray-500 truncate">Total Pledges</dt><dd className="mt-1 text-3xl font-semibold text-gray-900">{stats?.pledge_count}</dd></div></div>
        <div className="bg-white overflow-hidden shadow rounded-lg"><div className="px-4 py-5 sm:p-6"><dt className="text-sm font-medium text-gray-500 truncate">Funds Raised</dt><dd className="mt-1 text-3xl font-semibold text-green-600">{formatCurrency(stats?.total_funds_raised)}</dd></div></div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Verification Requests</h2>
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teacher</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Language</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {verifications.map((v) => (
                  <tr key={v.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{v.teacher_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{v.language}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"><a href={v.document_url} target="_blank" rel="noopener noreferrer" className="text-kotoba-primary hover:underline">View Document</a></td>
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
        <h2 className="text-xl font-bold text-gray-900 mb-4">Users</h2>
        <div className="bg-white shadow overflow-hidden sm:rounded-lg"><ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">{users.map((user) => (<li key={user.id} className="px-4 py-4 flex items-center justify-between hover:bg-gray-50"><div><p className="text-sm font-medium text-kotoba-primary truncate">{user.full_name}</p><p className="text-sm text-gray-500">{user.email} - <span className="capitalize">{user.role}</span></p></div>{user.role !== 'admin' && (<button onClick={() => confirmDeleteUser(user.id)} className="text-red-600 hover:text-red-900 text-sm font-medium">Delete</button>)}</li>))}</ul></div>
      </div>

      <ConfirmationModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onConfirm={modalConfig.onConfirm} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText} isDanger={modalConfig.isDanger} />
    </div>
  );
};

export default AdminDashboard;
