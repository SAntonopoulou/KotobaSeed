import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../utils/errors';
import ConfirmationModal from '../../components/ConfirmationModal';

// Admin-only staff management — list current staff, search any user by
// email/name and promote them. Demoting to student is just selecting
// "student" from the role dropdown.

const ROLE_LABELS = {
  student: 'Student',
  creator: 'Creator / Tutor',
  moderator: 'Moderator (legacy)',
  support: 'Support',
  manager: 'Manager',
  admin: 'Admin',
};

const ROLE_OPTIONS = ['student', 'creator', 'support', 'manager', 'admin'];

const RoleBadge = ({ role }) => {
  const tone =
    role === 'admin'
      ? 'bg-kotoba-primary text-white'
      : role === 'manager'
        ? 'bg-kotoba-secondary text-kotoba-text'
        : role === 'support'
          ? 'bg-kotoba-secondary/40 text-kotoba-text'
          : 'bg-kotoba-text/10 text-kotoba-text/70';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${tone}`}>
      {ROLE_LABELS[role] || role}
    </span>
  );
};

const AdminStaff = () => {
  const { addToast } = useToast();
  const { currentUser } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  // Role-change confirmation — guards against accidental admin
  // promotion/demotion via dropdown misclick. The select's onChange
  // stashes the intended change here; doConfirmedRoleChange runs only
  // after the admin explicitly clicks through.
  const [pending, setPending] = useState(null);

  const loadStaff = async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/staff');
      setStaff(res.data || []);
    } catch {
      addToast('Could not load staff list.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const requestRoleChange = (user, newRole) => {
    if (user.role === newRole) return;
    setPending({
      userId: user.id,
      userLabel: user.full_name || user.email,
      currentRole: user.role,
      newRole,
    });
  };

  const doConfirmedRoleChange = async () => {
    if (!pending) return;
    const { userId, newRole } = pending;
    setPending(null);
    setBusyId(userId);
    try {
      await client.put(`/admin/users/${userId}/role`, { role: newRole });
      addToast('Role updated.', 'success');
      await loadStaff();
      // Re-run the search so the moved row's badge updates inline.
      if (query.trim().length >= 2) {
        const sres = await client.get(`/admin/users/search?q=${encodeURIComponent(query)}`);
        setSearchResults(sres.data || []);
      }
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not change role.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const runSearch = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await client.get(`/admin/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.data || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Search failed.'), 'error');
    } finally {
      setSearching(false);
    }
  };

  const Row = ({ user }) => (
    <tr key={user.id} className="border-t border-kotoba-text/10">
      <td className="px-4 py-3">
        <div className="font-medium text-kotoba-text">{user.full_name || '—'}</div>
        <div className="text-xs text-kotoba-text/60">{user.email}</div>
      </td>
      <td className="px-4 py-3">
        <RoleBadge role={user.role} />
      </td>
      <td className="px-4 py-3 text-right">
        <select
          value={user.role}
          onChange={(e) => requestRoleChange(user, e.target.value)}
          disabled={busyId === user.id}
          className="px-2 py-1 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              Change to {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-kotoba-primary">Staff users</h1>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Promote regular users into support / manager / admin roles. Every change is recorded in the audit log.
          </p>
        </div>
        <Link
          to="/admin/dashboard"
          className="text-sm text-kotoba-text/70 hover:text-kotoba-primary"
        >
          ← Back to dashboard
        </Link>
      </div>

      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-3">Find a user</h2>
        <form onSubmit={runSearch} className="flex gap-2 flex-wrap mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email or name (min 2 chars)…"
            className="flex-grow min-w-[200px] px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 rounded-md bg-kotoba-primary text-white text-sm font-medium hover:bg-kotoba-primary/90 disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {searchResults.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="text-xs uppercase text-kotoba-text/50 text-left">
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Current role</th>
                <th className="px-4 py-2 text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((u) => (
                <Row key={u.id} user={u} />
              ))}
            </tbody>
          </table>
        )}
        {query.trim().length >= 2 && searchResults.length === 0 && !searching && (
          <p className="text-sm text-kotoba-text/60">No users matched that query.</p>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-3">Current staff</h2>
        {loading ? (
          <p className="text-sm text-kotoba-text/70">Loading…</p>
        ) : staff.length === 0 ? (
          <p className="text-sm text-kotoba-text/70">
            No staff yet — promote someone from the search above.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs uppercase text-kotoba-text/50 text-left">
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2 text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <Row key={u.id} user={u} />
              ))}
            </tbody>
          </table>
        )}
      </section>
      <ConfirmationModal
        isOpen={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={doConfirmedRoleChange}
        title={
          pending?.newRole === 'admin'
            ? 'Promote to admin'
            : pending?.currentRole === 'admin'
              ? 'Demote from admin'
              : 'Change user role'
        }
        message={
          pending
            ? pending.newRole === 'admin'
              ? `Make ${pending.userLabel} an admin? They'll have full access including the ability to demote you. Only do this for people you trust.`
              : pending.currentRole === 'admin' && currentUser && pending.userId === currentUser.id
                ? `You're about to demote yourself out of the admin role. You won't be able to undo this without another admin. Continue?`
                : pending.currentRole === 'admin'
                  ? `Remove admin access from ${pending.userLabel}? They'll lose access to the admin panel immediately.`
                  : `Change ${pending.userLabel}'s role to "${pending.newRole}"?`
            : ''
        }
        confirmText={
          pending?.newRole === 'admin' ? 'Promote to admin' : 'Change role'
        }
        isDanger={
          pending?.newRole === 'admin' || pending?.currentRole === 'admin'
        }
      />
    </div>
  );
};

export default AdminStaff;
