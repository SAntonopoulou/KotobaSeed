import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { getErrorMessage } from '../../utils/errors';

// In-classroom presenter side-panel. Only renders for tutors. Pulls the
// active lesson plan's "next up" lesson and shows its body, attachments,
// and embedded videos in tabs. The tutor can screen-share their browser
// tab to bring the student along; PDFs open in a clean new tab for
// fullscreen presenting.
//
// "Mark this lesson taught" records a LessonDelivery, auto-spawns any
// attached homework templates for THIS student, advances the plan
// position by one, and refreshes the panel.

const detectVideoEmbed = (url) => {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) {
    let id = null;
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtu.be')) id = parsed.pathname.slice(1);
      else id = parsed.searchParams.get('v');
    } catch { /* ignore */ }
    if (id) return `https://www.youtube.com/embed/${id}`;
  }
  if (u.includes('vimeo.com')) {
    const m = url.match(/vimeo\.com\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }
  return null;
};

const TabButton = ({ active, label, count, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
      active
        ? 'bg-kotoba-primary text-white'
        : 'text-kotoba-text/70 hover:bg-kotoba-text/5'
    }`}
  >
    {label}
    {count != null && (
      <span className={`ml-1.5 text-[10px] ${active ? 'opacity-80' : 'text-kotoba-text/40'}`}>
        {count}
      </span>
    )}
  </button>
);

const ClassroomLessonPanel = ({ bookingId, onClose }) => {
  const { addToast } = useToast();
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('body');
  const [marking, setMarking] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get(`/lesson-plans/booking/${bookingId}/classroom-context`);
      setCtx(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load lesson plan.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [bookingId]);

  const markTaught = async () => {
    if (!ctx?.next_lesson) return;
    setMarking(true);
    try {
      const res = await client.post('/lesson-plans/deliveries', {
        student_user_id: ctx.student_user_id,
        lesson_id: ctx.next_lesson.id,
        booking_id: bookingId,
        advance_plan: true,
      });
      const hwCount = (res.data?.homework_assignment_ids || []).length;
      addToast(
        hwCount
          ? `Lesson taught — ${hwCount} homework auto-assigned.`
          : 'Lesson taught.',
        'success',
      );
      load();
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not record delivery.'), 'error');
    } finally {
      setMarking(false);
    }
  };

  return (
    <aside className="w-[420px] max-w-full bg-white text-kotoba-text flex flex-col border-l border-kotoba-text/10 shadow-xl">
      <header className="px-4 py-3 border-b border-kotoba-text/10 bg-kotoba-background flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-bold text-kotoba-secondary-dark">Lesson plan</p>
          {ctx?.student_name && (
            <p className="text-sm font-bold text-kotoba-primary truncate">{ctx.student_name}</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-kotoba-text/60 hover:text-kotoba-text px-2 py-1">
          Hide
        </button>
      </header>

      {loading && (
        <div className="p-4 text-sm text-kotoba-text/60">Loading lesson…</div>
      )}

      {error && (
        <div className="p-4 text-sm text-red-700 bg-red-50">{error}</div>
      )}

      {ctx && !loading && !error && (
        <>
          {ctx.next_lesson ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-kotoba-text/10">
                <p className="text-[10px] uppercase tracking-wider font-bold text-kotoba-secondary-dark">
                  Lesson {ctx.plan_position + 1} of {ctx.plan_total_lessons}
                </p>
                <h3 className="text-base font-bold text-kotoba-primary leading-tight mt-0.5">
                  {ctx.next_lesson.title}
                </h3>
                {ctx.next_lesson.summary && (
                  <p className="text-xs text-kotoba-text/60 mt-1">{ctx.next_lesson.summary}</p>
                )}
              </div>

              <div className="px-3 py-2 border-b border-kotoba-text/10 flex flex-wrap gap-1.5 bg-kotoba-background/50">
                <TabButton active={tab === 'body'} label="Body" onClick={() => setTab('body')} />
                <TabButton active={tab === 'attachments'} label="Files" count={ctx.next_lesson.attachments.length} onClick={() => setTab('attachments')} />
                <TabButton active={tab === 'videos'} label="Videos" count={ctx.next_lesson.embedded_videos.length} onClick={() => setTab('videos')} />
                <TabButton active={tab === 'homework'} label="Homework" count={ctx.homework_templates.length} onClick={() => setTab('homework')} />
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                {tab === 'body' && (
                  ctx.next_lesson.body_markdown ? (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {ctx.next_lesson.body_markdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-kotoba-text/55 italic">This lesson has no body text yet.</p>
                  )
                )}
                {tab === 'attachments' && (
                  ctx.next_lesson.attachments.length === 0 ? (
                    <p className="text-sm text-kotoba-text/55 italic">No files attached. Open the lesson in the dashboard to add images or PDFs.</p>
                  ) : (
                    <ul className="space-y-2">
                      {ctx.next_lesson.attachments.map((a, i) => (
                        <li key={i} className="border border-kotoba-text/10 rounded-md p-2">
                          {a.kind === 'image' ? (
                            <a href={a.url} target="_blank" rel="noreferrer">
                              <img src={a.url} alt={a.name} className="w-full rounded-md" />
                            </a>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-12 bg-kotoba-text/5 rounded flex items-center justify-center text-[10px] font-bold text-kotoba-text/60">PDF</div>
                              <div className="flex-grow min-w-0">
                                <p className="text-sm font-medium truncate">{a.name}</p>
                              </div>
                              <a href={a.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-kotoba-primary hover:underline">
                                Open
                              </a>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
                )}
                {tab === 'videos' && (
                  ctx.next_lesson.embedded_videos.length === 0 ? (
                    <p className="text-sm text-kotoba-text/55 italic">No videos. Add YouTube/Vimeo URLs from the lesson editor.</p>
                  ) : (
                    <ul className="space-y-3">
                      {ctx.next_lesson.embedded_videos.map((v, i) => {
                        const src = detectVideoEmbed(v.url);
                        return (
                          <li key={i}>
                            {src ? (
                              <div className="aspect-video rounded overflow-hidden bg-black mb-1">
                                <iframe src={src} title={v.url} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                              </div>
                            ) : null}
                            <a href={v.url} target="_blank" rel="noreferrer" className="text-xs text-kotoba-primary hover:underline break-all">
                              {v.url}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  )
                )}
                {tab === 'homework' && (
                  ctx.homework_templates.length === 0 ? (
                    <p className="text-sm text-kotoba-text/55 italic">No homework attached to this lesson. Marking it taught won't create any assignments.</p>
                  ) : (
                    <ul className="space-y-3">
                      {ctx.homework_templates.map((h) => (
                        <li key={h.id} className="border border-kotoba-text/10 rounded-md p-3">
                          <p className="text-sm font-bold text-kotoba-primary">{h.title}</p>
                          <p className="text-[10px] text-kotoba-text/50 mb-2">Due {h.due_days_after_lesson} day{h.due_days_after_lesson === 1 ? '' : 's'} after the lesson</p>
                          {h.body_markdown && (
                            <div className="prose prose-xs max-w-none text-xs">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{h.body_markdown}</ReactMarkdown>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>

              <footer className="px-4 py-3 border-t border-kotoba-text/10 bg-kotoba-background flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] text-kotoba-text/55">
                  Marks taught + spawns {ctx.homework_templates.length} homework
                </p>
                <button
                  type="button"
                  onClick={markTaught}
                  disabled={marking}
                  className="px-4 py-2 rounded-md bg-kotoba-primary text-white font-semibold text-sm hover:bg-kotoba-primary/90 disabled:opacity-60"
                >
                  {marking ? 'Recording…' : 'Mark lesson taught'}
                </button>
              </footer>
            </div>
          ) : ctx.plan_total_lessons === 0 ? (
            <div className="p-4 text-sm text-kotoba-text/70">
              No lessons in this student's plan yet. Open the dashboard to assign a curriculum or build a custom plan.
            </div>
          ) : (
            <div className="p-4 text-sm text-kotoba-text/70">
              You've taught every lesson in this plan. Open the dashboard to extend the plan or switch curriculum.
            </div>
          )}
        </>
      )}
    </aside>
  );
};

export default ClassroomLessonPanel;
