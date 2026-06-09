import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';

// Visible to anyone on a TutorTeam. Owners see the management controls;
// members see roster + a Leave button.
//
// Owner controls:
//   - Invite by email (creates pending row, fires Resend email)
//   - Revoke pending invite
//   - Remove member (triggers school non-compete on past students)
//   - Adjust poaching_protection_days (slider 0-365)
//   - Add extra seats (POST to /tutor/team/seats — Stripe subscription
//     item with proration)
//
// Member-only:
//   - Leave team (same non-compete applies)

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
};

const TeamPanel = () => {
  const confirm = useConfirm();
  const { addToast } = useToast();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [protectionDays, setProtectionDays] = useState(90);
  const [seatTarget, setSeatTarget] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/team');
      setTeam(res.data);
      if (res.data) {
        setProtectionDays(res.data.poaching_protection_days ?? 90);
        setSeatTarget(Math.max(0, (res.data.max_seats || 5) - 5));
      }
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load team.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const invite = async (e) => {
    e?.preventDefault?.();
    if (!inviteEmail.trim()) return;
    setBusy('invite');
    try {
      await client.post('/tutor/team/invites', { email: inviteEmail.trim() });
      setInviteEmail('');
      addToast('Invite sent.', 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Invite failed.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const revokeInvite = async (id) => {
    if (!(await confirm({
      title: 'Revoke invite',
      message: 'Revoke this invite? The link in their email will stop working.',
      confirmText: 'Revoke',
      destructive: true,
    }))) return;
    setBusy(`invite-${id}`);
    try {
      await client.delete(`/tutor/team/invites/${id}`);
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not revoke.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const removeMember = async (member) => {
    if (!(await confirm({
      title: `Remove ${member.full_name}`,
      message:
        `${member.full_name} will no longer be on the team. Students they taught here ` +
        `can't book them directly for ${team.poaching_protection_days} days (the protection ` +
        `window you set). This protects your client list.`,
      confirmText: 'Remove',
      destructive: true,
    }))) return;
    setBusy(`member-${member.tutor_id}`);
    try {
      await client.delete(`/tutor/team/members/${member.tutor_id}`);
      addToast(`${member.full_name} removed from the team.`, 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not remove.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const saveProtection = async () => {
    setBusy('protection');
    try {
      await client.patch('/tutor/team/protection', {
        poaching_protection_days: protectionDays,
      });
      addToast(`Protection set to ${protectionDays} days for future leavers.`, 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not save.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const purchaseSeats = async () => {
    if (
      !(await confirm({
        title: 'Update seat count',
        message:
          `You'll have ${5 + seatTarget} seats total (${seatTarget} extra). Stripe ` +
          `will prorate any change to your next invoice — €29/seat/month or €319/seat/year.`,
        confirmText: 'Update',
      }))
    ) return;
    setBusy('seats');
    try {
      const res = await client.post('/tutor/team/seats', {
        quantity: seatTarget,
        billing: 'monthly',
      });
      addToast(`Seats updated. New cap: ${res.data.new_max_seats}.`, 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Seat update failed.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const selfLeave = async () => {
    if (
      !(await confirm({
        title: 'Leave the team',
        message:
          `You'll lose Business features and the team's shared theme. ` +
          `You won't be able to teach students from this school directly for ` +
          `${team.poaching_protection_days} days (the school's non-compete window). ` +
          `Are you sure?`,
        confirmText: 'Leave',
        destructive: true,
      }))
    ) return;
    setBusy('leave');
    try {
      await client.post('/tutor/team/leave');
      addToast('You left the team. Your site theme reverted to default.', 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not leave.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <SkeletonCard />;
  if (!team) return null; // Not on a team — panel hides itself.

  const seatsUsed = team.seats_used;
  const seatsAvail = team.seats_available;

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Team</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            {team.name} · {seatsUsed} of {team.max_seats} seats filled
          </p>
        </div>
        {team.is_owner ? (
          <span className="px-3 py-1 rounded-md bg-kotoba-secondary/30 text-kotoba-text text-sm font-medium">
            Owner
          </span>
        ) : (
          <button
            type="button"
            onClick={selfLeave}
            disabled={busy === 'leave'}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            Leave team
          </button>
        )}
      </header>

      {/* Roster */}
      <div>
        <h3 className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60 mb-2">
          Members ({team.members.length})
        </h3>
        <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
          {team.members.map((m) => (
            <li
              key={m.tutor_id}
              className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0">
                <p className="font-medium text-kotoba-text">
                  {m.full_name}
                  {m.is_owner && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-kotoba-secondary/20 text-kotoba-text/80">
                      owner
                    </span>
                  )}
                </p>
                <p className="text-xs text-kotoba-text/60 truncate">
                  {m.email} · <span className="font-mono">{m.tutor_slug}</span>
                </p>
              </div>
              {team.is_owner && !m.is_owner && (
                <button
                  type="button"
                  onClick={() => removeMember(m)}
                  disabled={busy === `member-${m.tutor_id}`}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Pending invites */}
      {team.pending_invites.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60 mb-2">
            Pending invites ({team.pending_invites.length})
          </h3>
          <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
            {team.pending_invites.map((inv) => (
              <li key={inv.id} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium text-kotoba-text">{inv.email}</p>
                  <p className="text-xs text-kotoba-text/60">
                    Expires {formatDate(inv.expires_at)}
                  </p>
                </div>
                {team.is_owner && (
                  <button
                    type="button"
                    onClick={() => revokeInvite(inv.id)}
                    disabled={busy === `invite-${inv.id}`}
                    className="text-sm text-red-600 hover:underline disabled:opacity-50"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {team.is_owner && (
        <>
          {/* Invite form */}
          <form onSubmit={invite} className="border border-kotoba-text/10 rounded-md p-4 space-y-2">
            <h3 className="text-sm font-semibold text-kotoba-text">Invite a tutor</h3>
            <p className="text-xs text-kotoba-text/60">
              They'll receive an email with an accept link. Seats fill on acceptance.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="newhire@example.com"
                disabled={seatsAvail <= 0 || busy === 'invite'}
                className="flex-grow min-w-[200px] px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
              />
              <button
                type="submit"
                disabled={!inviteEmail.trim() || seatsAvail <= 0 || busy === 'invite'}
                className="px-4 py-2 rounded-md bg-kotoba-primary text-white text-sm font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
              >
                {busy === 'invite' ? 'Sending…' : 'Send invite'}
              </button>
            </div>
            {seatsAvail <= 0 && (
              <p className="text-xs text-amber-700">
                No seats left. Add more below to invite another tutor.
              </p>
            )}
          </form>

          {/* Extra seats */}
          <div className="border border-kotoba-text/10 rounded-md p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-kotoba-text">Extra seats</h3>
              <p className="text-xs text-kotoba-text/60">
                Your Business plan includes 5 seats. Add more at €29/seat/month — Stripe
                prorates the change to your next invoice.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="number"
                min={0}
                max={20}
                value={seatTarget}
                onChange={(e) => setSeatTarget(Math.max(0, parseInt(e.target.value || '0', 10)))}
                className="w-24 px-3 py-2 border border-kotoba-text/20 rounded text-sm"
              />
              <span className="text-sm text-kotoba-text/70">
                extra seats · total {5 + seatTarget} · €{29 * seatTarget}/month
              </span>
              <button
                type="button"
                onClick={purchaseSeats}
                disabled={busy === 'seats'}
                className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text text-sm font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-50"
              >
                {busy === 'seats' ? 'Updating…' : 'Update seats'}
              </button>
            </div>
          </div>

          {/* Protection days */}
          <div className="border border-kotoba-text/10 rounded-md p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-kotoba-text">Non-compete protection</h3>
              <p className="text-xs text-kotoba-text/60">
                When a tutor leaves the team, students they taught while in the team can't
                book them directly for this many days. Protects your client list. 0 = no
                protection. Applies only to future leavers.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="range"
                min={0}
                max={365}
                step={15}
                value={protectionDays}
                onChange={(e) => setProtectionDays(parseInt(e.target.value, 10))}
                className="flex-grow min-w-[150px]"
              />
              <span className="text-sm font-mono text-kotoba-text w-16 text-right">
                {protectionDays} d
              </span>
              <button
                type="button"
                onClick={saveProtection}
                disabled={busy === 'protection' || protectionDays === team.poaching_protection_days}
                className="px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary text-sm font-semibold hover:bg-kotoba-primary hover:text-white disabled:opacity-50"
              >
                {busy === 'protection' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default TeamPanel;
