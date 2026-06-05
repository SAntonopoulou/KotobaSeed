import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import client from '../api/client';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOT_MIN = 30;              // each cell = 30 minutes
const SLOTS_PER_DAY = 24 * (60 / SLOT_MIN); // 48
const VISIBLE_START_HOUR = 6;     // 6am — the top of the scroll
const VISIBLE_END_HOUR = 23;      // 11pm — the bottom

const fmtTime = (slotIndex) => {
  const totalMin = slotIndex * SLOT_MIN;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const newGrid = () => {
  // grid[day][slot] = boolean
  return Array.from({ length: 7 }, () => Array(SLOTS_PER_DAY).fill(false));
};

const windowsToGrid = (windows) => {
  const grid = newGrid();
  for (const w of windows || []) {
    const start = Math.max(0, Math.floor(w.start_minute / SLOT_MIN));
    const end = Math.min(SLOTS_PER_DAY, Math.ceil(w.end_minute / SLOT_MIN));
    for (let i = start; i < end; i++) {
      grid[w.weekday][i] = true;
    }
  }
  return grid;
};

const gridToWindows = (grid) => {
  const windows = [];
  for (let day = 0; day < 7; day++) {
    let i = 0;
    while (i < SLOTS_PER_DAY) {
      if (!grid[day][i]) {
        i++;
        continue;
      }
      const start = i;
      while (i < SLOTS_PER_DAY && grid[day][i]) i++;
      const end = i;
      windows.push({
        weekday: day,
        start_minute: start * SLOT_MIN,
        end_minute: end * SLOT_MIN,
      });
    }
  }
  return windows;
};

const AvailabilityEditor = () => {
  const [grid, setGrid] = useState(newGrid);
  const [original, setOriginal] = useState(newGrid);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const dragRef = useRef(null);  // {painting: bool, mode: 'add'|'remove'}

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/availability');
      const g = windowsToGrid(res.data || []);
      setGrid(g);
      setOriginal(JSON.parse(JSON.stringify(g)));
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load availability.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Cell paint logic: pointerdown sets mode based on the cell you started on
  // (so dragging across an "on" cell removes; dragging across an "off" cell
  // adds). pointermove repeats the same operation across whichever cell you
  // hover.
  const beginPaint = (day, slot, e) => {
    e.preventDefault();
    const willTurnOn = !grid[day][slot];
    dragRef.current = { painting: true, mode: willTurnOn ? 'add' : 'remove' };
    setGrid((g) => {
      const copy = g.map((row) => row.slice());
      copy[day][slot] = willTurnOn;
      return copy;
    });
  };

  const continuePaint = (day, slot) => {
    if (!dragRef.current?.painting) return;
    setGrid((g) => {
      const target = dragRef.current.mode === 'add';
      if (g[day][slot] === target) return g;
      const copy = g.map((row) => row.slice());
      copy[day][slot] = target;
      return copy;
    });
  };

  const endPaint = () => {
    dragRef.current = null;
  };

  useEffect(() => {
    window.addEventListener('pointerup', endPaint);
    return () => window.removeEventListener('pointerup', endPaint);
  }, []);

  const dirty = useMemo(() => JSON.stringify(grid) !== JSON.stringify(original), [grid, original]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const windows = gridToWindows(grid);
      await client.put('/tutor/availability', { windows });
      setOriginal(JSON.parse(JSON.stringify(grid)));
      setInfo('Availability saved.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setGrid(newGrid());
  };

  if (loading) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Availability</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Availability</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Click or drag to mark when you can teach. Students only see lesson slots that fall inside these blocks.
            Times shown in your account timezone.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-kotoba-text/70 hover:text-kotoba-text"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save availability'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="mb-3 bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm">
          {info}
        </div>
      )}

      <div className="overflow-x-auto select-none">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-12"></th>
              {DAYS.map((d) => (
                <th key={d} className="px-2 py-1 text-kotoba-text/70 font-semibold">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SLOTS_PER_DAY }).map((_, slot) => {
              const hour = Math.floor(slot * SLOT_MIN / 60);
              if (hour < VISIBLE_START_HOUR || hour > VISIBLE_END_HOUR) return null;
              const onHour = slot % (60 / SLOT_MIN) === 0;
              return (
                <tr key={slot} className={onHour ? 'border-t border-kotoba-text/15' : ''}>
                  <td className="text-kotoba-text/50 pr-2 text-right font-mono align-top">
                    {onHour ? fmtTime(slot) : ''}
                  </td>
                  {DAYS.map((_, day) => {
                    const on = grid[day][slot];
                    return (
                      <td key={day} className="p-0">
                        <button
                          type="button"
                          onPointerDown={(e) => beginPaint(day, slot, e)}
                          onPointerEnter={() => continuePaint(day, slot)}
                          className={`block w-10 h-4 ${
                            on
                              ? 'bg-kotoba-primary hover:bg-green-800'
                              : 'bg-kotoba-background hover:bg-kotoba-primary/20'
                          } border border-kotoba-text/10 transition-colors`}
                          aria-label={`${DAYS[day]} ${fmtTime(slot)} ${on ? 'available' : 'unavailable'}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-kotoba-text/60">
        Tip: hold and drag to paint a whole stretch — much faster than clicking each cell.
      </p>
    </section>
  );
};

export default AvailabilityEditor;
