import React, { useEffect, useRef, useState } from 'react';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ModalContext';
import { getErrorMessage } from '../../utils/errors';
import MarkdownEditor from '../editor/MarkdownEditor';
import LessonHomeworkSection from './LessonHomeworkSection';

// Lesson editor: title + summary + duration + Lexical rich-text body +
// attachments (image / PDF uploads to R2) + embedded video URLs
// (YouTube / Vimeo / other). All fields auto-save on blur except the
// body, which saves through an explicit Save button so the round-trips
// don't get noisy.

const detectVideoProvider = (url) => {
  const u = (url || '').toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('vimeo.com')) return 'vimeo';
  return 'other';
};

const embedSrc = (url) => {
  const provider = detectVideoProvider(url);
  if (provider === 'youtube') {
    let id = null;
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
      else id = u.searchParams.get('v');
    } catch { /* ignore */ }
    if (id) return `https://www.youtube.com/embed/${id}`;
  }
  if (provider === 'vimeo') {
    const m = url.match(/vimeo\.com\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }
  return null;
};

const LessonEditor = ({ curriculumId, lessonId, onClose }) => {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const fileRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingBody, setSavingBody] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [newVideoUrl, setNewVideoUrl] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get(`/curriculum/${curriculumId}/lessons/${lessonId}`);
      setData(res.data);
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not load lesson.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [lessonId]);

  const patch = async (changes, silent = false) => {
    try {
      const res = await client.patch(`/curriculum/${curriculumId}/lessons/${lessonId}`, changes);
      setData(res.data);
      if (!silent) addToast('Saved.', 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Could not save.'), 'error');
    }
  };

  const saveBody = async (markdown) => {
    setSavingBody(true);
    await patch({ body_markdown: markdown }, true);
    setSavingBody(false);
    addToast('Lesson body saved.', 'success');
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await client.post(
        `/curriculum/${curriculumId}/lessons/${lessonId}/upload`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      const next = [
        ...(data.attachments || []),
        { kind: res.data.kind, name: res.data.name, url: res.data.url, size_bytes: res.data.size_bytes },
      ];
      await patch({ attachments: next }, true);
      addToast(`${res.data.kind === 'pdf' ? 'PDF' : 'Image'} added.`, 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Upload failed.'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (idx) => {
    const next = (data.attachments || []).filter((_, i) => i !== idx);
    await patch({ attachments: next });
  };

  const addVideo = async () => {
    const url = newVideoUrl.trim();
    if (!url) return;
    const next = [
      ...(data.embedded_videos || []),
      { url, provider: detectVideoProvider(url), title: null },
    ];
    await patch({ embedded_videos: next });
    setNewVideoUrl('');
  };

  const removeVideo = async (idx) => {
    const next = (data.embedded_videos || []).filter((_, i) => i !== idx);
    await patch({ embedded_videos: next });
  };

  if (loading || !data) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <p className="text-sm text-kotoba-text/60">Loading lesson…</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
      <div>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-kotoba-text/60 hover:text-kotoba-primary mb-3">
          ← Back to curriculum
        </button>
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Title</label>
          <input
            type="text"
            value={data.title}
            onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))}
            onBlur={(e) => patch({ title: e.target.value })}
            className="w-full px-3 py-2 text-xl font-bold text-kotoba-primary border border-kotoba-text/15 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 mt-3">
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">One-line summary</label>
            <input
              type="text"
              value={data.summary || ''}
              onChange={(e) => setData((d) => ({ ...d, summary: e.target.value }))}
              onBlur={(e) => patch({ summary: e.target.value || null })}
              placeholder="What the student will learn"
              className="w-full px-3 py-2 border border-kotoba-text/15 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-kotoba-text/70 mb-1">Duration (min)</label>
            <input
              type="number"
              min="5"
              max="600"
              value={data.estimated_duration_minutes}
              onChange={(e) => setData((d) => ({ ...d, estimated_duration_minutes: parseInt(e.target.value, 10) || 60 }))}
              onBlur={(e) => patch({ estimated_duration_minutes: parseInt(e.target.value, 10) || 60 })}
              className="w-24 px-3 py-2 border border-kotoba-text/15 rounded text-sm"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-base font-bold text-kotoba-text">Lesson body</h3>
          <p className="text-xs text-kotoba-text/60">Rich text — bold, italic, lists, links, headings. Markdown shortcuts work.</p>
        </div>
        <MarkdownEditor
          key={`lesson-${lessonId}-${editorKey}`}
          initialMarkdown={data.body_markdown || ''}
          enableVocab={false}
          minHeight={280}
          placeholder="Open with the goal, walk through the material, end with a recap…"
          onChange={({ markdown }) => setData((d) => d ? { ...d, body_markdown: markdown } : d)}
        />
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={() => saveBody(data.body_markdown || '')} disabled={savingBody} className="px-4 py-2 rounded-md bg-kotoba-primary text-white text-sm font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50">
            {savingBody ? 'Saving…' : 'Save lesson body'}
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-base font-bold text-kotoba-text">Attachments</h3>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" onChange={onFile} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="text-sm font-semibold text-kotoba-primary hover:underline disabled:opacity-50">
              {uploading ? 'Uploading…' : '+ Upload image or PDF'}
            </button>
          </div>
        </div>
        {(data.attachments || []).length === 0 ? (
          <p className="text-xs text-kotoba-text/60 italic">No attachments yet. Add images for diagrams or PDFs for worksheets.</p>
        ) : (
          <ul className="space-y-2">
            {data.attachments.map((a, i) => (
              <li key={i} className="flex items-center gap-3 border border-kotoba-text/10 rounded-md px-3 py-2">
                {a.kind === 'image' ? (
                  <img src={a.url} alt="" className="w-12 h-12 object-cover rounded" />
                ) : (
                  <div className="w-12 h-12 bg-kotoba-text/5 rounded flex items-center justify-center text-xs font-bold text-kotoba-text/60">PDF</div>
                )}
                <div className="flex-grow min-w-0">
                  <p className="text-sm font-medium text-kotoba-text truncate">{a.name}</p>
                  <p className="text-[10px] text-kotoba-text/50">{Math.round((a.size_bytes || 0) / 1024)} KB</p>
                </div>
                <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-kotoba-primary hover:underline">Open</a>
                <button type="button" onClick={() => removeAttachment(i)} className="text-xs text-red-600 hover:underline">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <LessonHomeworkSection curriculumId={curriculumId} lessonId={lessonId} />

      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-base font-bold text-kotoba-text">Embedded videos</h3>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newVideoUrl}
            onChange={(e) => setNewVideoUrl(e.target.value)}
            placeholder="Paste a YouTube or Vimeo URL"
            className="flex-grow px-3 py-2 border border-kotoba-text/15 rounded text-sm"
          />
          <button type="button" onClick={addVideo} disabled={!newVideoUrl.trim()} className="px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text text-sm font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-50">
            Add
          </button>
        </div>
        {(data.embedded_videos || []).length === 0 ? (
          <p className="text-xs text-kotoba-text/60 italic">No videos. Paste a YouTube or Vimeo URL to embed.</p>
        ) : (
          <ul className="space-y-3">
            {data.embedded_videos.map((v, i) => {
              const src = embedSrc(v.url);
              return (
                <li key={i} className="border border-kotoba-text/10 rounded-md p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <a href={v.url} target="_blank" rel="noreferrer" className="text-sm text-kotoba-primary hover:underline truncate min-w-0">{v.url}</a>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-kotoba-text/40">{v.provider}</span>
                    <button type="button" onClick={() => removeVideo(i)} className="text-xs text-red-600 hover:underline">Remove</button>
                  </div>
                  {src ? (
                    <div className="aspect-video rounded overflow-hidden bg-black">
                      <iframe src={src} title={v.url} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    </div>
                  ) : (
                    <p className="text-xs text-kotoba-text/50 italic">Unsupported provider — link only.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export default LessonEditor;
