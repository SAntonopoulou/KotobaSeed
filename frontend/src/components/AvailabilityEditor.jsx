import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import client from '../api/client';
import { SkeletonCard } from './Skeleton';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOT_MIN = 30;              // each cell = 30 minutes
const SLOTS_PER_DAY = 24 * (60 / SLOT_MIN); // 48
const VISIBLE_START_HOUR = 6;     // 6am — the top of the scroll
const VISIBLE_END_HOUR = 23;      // 11pm — the bottom

// Cell states. Trial implies regular underneath — never trial without regular.
const STATE_OFF = 0;
const STATE_REGULAR = 1;
const STATE_TRIAL = 2;

const fmtTime = (slotIndex) => {
  const totalMin = slotIndex * SLOT_MIN;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const newGrid = () =>
  Array.from({ length: 7 }, () => Array(SLOTS_PER_DAY).fill(STATE_OFF));

const windowsToGrid = (windows) => {
  const grid = newGrid();
  for (const w of windows || []) {
    const start = Math.max(0, Math.floor(w.start_minute / SLOT_MIN));
    const end = Math.min(SLOTS_PER_DAY, Math.ceil(w.end_minute / SLOT_MIN));
    const state = w.allow_trial ? STATE_TRIAL : STATE_REGULAR;
    for (let i = start; i < end; i++) {
      grid[w.weekday][i] = state;
    }
  }
  return grid;
};

const gridToWindows = (grid) => {
  // Group contiguous runs of the same state into windows. Switching from
  // regular to trial (or vice-versa) ends one window and starts another so
  // each window has a single allow_trial value.
  const windows = [];
  for (let day = 0; day < 7; day++) {
    let i = 0;
    while (i < SLOTS_PER_DAY) {
      if (grid[day][i] === STATE_OFF) {
        i++;
        continue;
      }
      const state = grid[day][i];
      const start = i;
      while (i < SLOTS_PER_DAY && grid[day][i] === state) i++;
      const end = i;
      windows.push({
        weekday: day,
        start_minute: start * SLOT_MIN,
        end_minute: end * SLOT_MIN,
        allow_trial: state === STATE_TRIAL,
      });
    }
  }
  return windows;
};

const AvailabilityEditor = () => {
  const [grid, setGrid] = useState(newGrid);
  const [original, setOriginal] = useState(newGrid);
  const [mode, setMode] = useState('regular'); // 'regular' | 'trial'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // dragRef: { painting: bool, targetState: 0|1|2 }
  const dragRef = useRef(null);

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

  // Decide what state a click should set the cell to, given the current mode
  // and the cell's existing state. Each click cycles between two states:
  //   Regular mode: OFF <-> REGULAR  (clicking a TRIAL cell turns it off)
  //   Trial mode:   REGULAR <-> TRIAL (you can't turn a cell trial unless it
  //                                    was already regular — clicks on OFF
  //                                    cells set it to TRIAL, implying regular)
  const nextStateForClick = (cur) => {
    if (mode === 'regular') {
      return cur === STATE_OFF ? STATE_REGULAR : STATE_OFF;
    }
    // mode === 'trial'
    return cur === STATE_TRIAL ? STATE_REGULAR : STATE_TRIAL;
  };

  const beginPaint = (day, slot, e) => {
    e.preventDefault();
    const target = nextStateForClick(grid[day][slot]);
    dragRef.current = { painting: true, targetState: target };
    setGrid((g) => {
      const copy = g.map((row) => row.slice());
      copy[day][slot] = target;
      return copy;
    });
  };

  const continuePaint = (day, slot) => {
    if (!dragRef.current?.painting) return;
    const target = dragRef.current.targetState;
    setGrid((g) => {
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

  const dirty = useMemo(
    () => JSON.stringify(grid) !== JSON.stringify(original),
    [grid, original]
  );

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
    return <SkeletonCard />;
  }

  const cellClass = (state) => {
    if (state === STATE_REGULAR) return 'bg-kotoba-primary hover:bg-green-800';
    if (state === STATE_TRIAL) {
      return 'bg-kotoba-primary ring-2 ring-inset ring-kotoba-secondary hover:bg-green-800';
    }
    return 'bg-kotoba-background hover:bg-kotoba-primary/20';
  };

  const cellLabel = (state) => {
    if (state === STATE_TRIAL) return 'available (regular + trial)';
    if (state === STATE_REGULAR) return 'available (regular)';
    return 'unavailable';
  };

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

      <div className="flex items-center gap-4 flex-wrap mb-4 text-sm">
        <span className="text-kotoba-text/70 font-medium">Painting:</span>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="paint-mode"
            value="regular"
            checked={mode === 'regular'}
            onChange={() => setMode('regular')}
            className="text-kotoba-primary focus:ring-kotoba-primary"
          />
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-4 bg-kotoba-primary rounded-sm" aria-hidden />
            Regular
          </span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="paint-mode"
            value="trial"
            checked={mode === 'trial'}
            onChange={() => setMode('trial')}
            className="text-kotoba-primary focus:ring-kotoba-primary"
          />
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 h-4 bg-kotoba-primary ring-2 ring-inset ring-kotoba-secondary rounded-sm"
              aria-hidden
            />
            Regular + trial
          </span>
        </label>
        <span className="text-xs text-kotoba-text/60 ml-auto">
          Trial windows are also bookable for paid lessons — they only widen what's open.
        </span>
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
                    const state = grid[day][slot];
                    return (
                      <td key={day} className="p-0">
                        <button
                          type="button"
                          onPointerDown={(e) => beginPaint(day, slot, e)}
                          onPointerEnter={() => continuePaint(day, slot)}
                          className={`block w-10 h-4 ${cellClass(state)} border border-kotoba-text/10 transition-colors`}
                          aria-label={`${DAYS[day]} ${fmtTime(slot)} ${cellLabel(state)}`}
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
        Tip: hold and drag to paint a whole stretch. Trial mode adds the trial overlay on top of regular availability — toggle the mode at the top of the grid to switch.
      </p>
    </section>
  );
};

export default AvailabilityEditor;
