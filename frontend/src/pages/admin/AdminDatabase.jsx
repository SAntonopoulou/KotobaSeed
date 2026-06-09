import React, { useEffect, useState } from 'react';
import client from '../../api/client';
import { useConfirm } from '../../context/ModalContext';
import { useToast } from '../../context/ToastContext';
import { SkeletonCard } from '../../components/Skeleton';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/dates';

// Admin → Database controls: list + trigger backups, see migration
// status, run pending migrations.
//
// We deliberately don't add a Restore button. Restoring a backup is
// destructive (overwrites the live DB), can't be undone, and should
// always be a deliberate SSH operation. The list shows filenames so an
// admin who needs to restore knows exactly which file to feed pg_restore.

const formatBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
};

const formatTime = (iso) => {
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
};

const AdminDatabase = () => {
  const confirm = useConfirm();
  const { addToast } = useToast();
  const [backups, setBackups] = useState(null);
  const [migration, setMigration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // 'backup' | 'upgrade' | null

  const load = async () => {
    setLoading(true);
    try {
      const [b, m] = await Promise.all([
        client.get('/admin/db/backups'),
        client.get('/admin/db/migrations'),
      ]);
      setBackups(b.data);
      setMigration(m.data);
    } catch (err) {
      addToast(
        getErrorMessage(err, 'Could not load database controls.'),
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const triggerBackup = async () => {
    if (
      !(await confirm({
        title: 'Take a backup now',
        message:
          'Run a manual database backup right now? It will land in /data/backups and be available alongside the scheduled snapshots.',
        confirmText: 'Take backup',
      }))
    )
      return;
    setBusy('backup');
    try {
      const res = await client.post('/admin/db/backups');
      addToast(`Backup written: ${res.data.filename}`, 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Backup failed.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const runUpgrade = async () => {
    if (
      !(await confirm({
        title: 'Apply pending migrations',
        message:
          "Run any pending Alembic migrations against the live database? Migrations also run automatically on every container start; only use this if you've just pushed a new migration file without restarting.",
        confirmText: 'Run upgrade',
      }))
    )
      return;
    setBusy('upgrade');
    try {
      const res = await client.post('/admin/db/migrations/upgrade');
      addToast(`Now at revision ${res.data.upgraded_to}.`, 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Upgrade failed.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-kotoba-text">Database</h1>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Backups + migration status for the live database. Scheduled
          backups still run automatically every day at 02:00 UTC.
        </p>
      </header>

      {/* Migration status */}
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-lg font-bold text-kotoba-primary">Migrations</h2>
            <p className="text-sm text-kotoba-text/70 mt-1">
              Alembic is the single source of truth for the schema.
            </p>
          </div>
          {migration && !migration.is_up_to_date && (
            <button
              type="button"
              onClick={runUpgrade}
              disabled={busy === 'upgrade'}
              className="px-4 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
            >
              {busy === 'upgrade' ? 'Running…' : 'Apply pending'}
            </button>
          )}
        </div>
        {migration ? (
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-kotoba-text/50">
                Current
              </dt>
              <dd className="mt-1 font-mono text-kotoba-text">
                {migration.current_revision || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-kotoba-text/50">
                Head
              </dt>
              <dd className="mt-1 font-mono text-kotoba-text">
                {migration.head_revision || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-kotoba-text/50">
                Status
              </dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                    migration.is_up_to_date
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {migration.is_up_to_date ? 'Up to date' : 'Pending'}
                </span>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-kotoba-text/60">
            Alembic state unreadable — check the backend logs.
          </p>
        )}
      </section>

      {/* Backups */}
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-lg font-bold text-kotoba-primary">Backups</h2>
            <p className="text-sm text-kotoba-text/70 mt-1">
              Driver: <span className="font-mono">{backups?.driver || 'unknown'}</span> ·
              Retention: {backups?.retention_days ?? '?'} days ·{' '}
              <span className="font-mono">{backups?.backup_dir}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={triggerBackup}
            disabled={busy === 'backup'}
            className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-50"
          >
            {busy === 'backup' ? 'Backing up…' : 'Take backup now'}
          </button>
        </div>

        {backups?.backups?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-kotoba-text/10">
              <thead className="bg-kotoba-background/40">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">
                    Filename
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-kotoba-text/60 uppercase tracking-wider">
                    Taken
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-kotoba-text/10">
                {backups.backups.map((row) => (
                  <tr key={row.filename}>
                    <td className="px-4 py-2 text-sm font-mono text-kotoba-text">
                      {row.filename}
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-kotoba-text/70">
                      {formatBytes(row.size_bytes)}
                    </td>
                    <td className="px-4 py-2 text-sm text-kotoba-text/70">
                      {formatTime(row.modified_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-kotoba-text/60 bg-kotoba-background/40 rounded-md p-4">
            No backups yet. The first scheduled run is 02:00 UTC; click
            "Take backup now" to create one immediately.
          </p>
        )}

        <p className="text-xs text-kotoba-text/50 mt-4">
          Restoring a backup is a deliberate, manual operation done over
          SSH with <span className="font-mono">pg_restore</span> (Postgres)
          or by replacing the database file (SQLite). Restore is{' '}
          <strong>not</strong> exposed here on purpose.
        </p>
      </section>
    </div>
  );
};

export default AdminDatabase;
