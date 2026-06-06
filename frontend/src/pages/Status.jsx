import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Minimal status page. Hits the public /healthz + /readyz endpoints from
// the user's own browser to confirm the API + DB are reachable.
// For a richer status page (uptime history, incident log) point at an
// external service like Statuspage or Better Stack — this is the launch-
// day MVP.

const Badge = ({ ok }) => (
  <span className={`px-3 py-1 rounded-md text-sm font-semibold ${
    ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
  }`}>
    {ok ? 'Operational' : 'Issue detected'}
  </span>
);

const Status = () => {
  const [api, setApi] = useState(null);
  const [db, setDb] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await client.get('/healthz');
        if (!cancelled) setApi(true);
      } catch {
        if (!cancelled) setApi(false);
      }
      try {
        await client.get('/readyz');
        if (!cancelled) setDb(true);
      } catch {
        if (!cancelled) setDb(false);
      }
      if (!cancelled) setCheckedAt(new Date());
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-kotoba-primary">Kotobaseed status</h1>
        <p className="text-sm text-kotoba-text/70 mt-2">
          Live status of the Kotobaseed platform. Refresh to recheck.
          {checkedAt && (
            <span className="block mt-1 text-xs text-kotoba-text/50">
              Last checked {checkedAt.toLocaleString()}
            </span>
          )}
        </p>
      </header>

      <section className="bg-white rounded-2xl shadow-sm divide-y divide-kotoba-text/10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-kotoba-primary">API</p>
            <p className="text-xs text-kotoba-text/60 mt-0.5">The backend that handles bookings, payments, content.</p>
          </div>
          <Badge ok={api === true} />
        </div>
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-kotoba-primary">Database</p>
            <p className="text-xs text-kotoba-text/60 mt-0.5">Read + write availability of user data, bookings, content.</p>
          </div>
          <Badge ok={db === true} />
        </div>
      </section>

      <p className="text-xs text-kotoba-text/60 text-center">
        Looking for past incidents or scheduled maintenance? Email <a className="underline text-kotoba-primary" href="mailto:hello@kotobaseed.net">hello@kotobaseed.net</a>.
      </p>
    </main>
  );
};

export default Status;
