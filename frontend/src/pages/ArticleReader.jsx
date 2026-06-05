import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import client from '../api/client';
import { apexUrl } from '../hooks/useTenant';

// Public article reader. We render from body_markdown via react-markdown
// for now — it handles the standard markdown (headings, lists, links,
// code, tables) and our custom :::vocab block is rendered with a custom
// `p` plugin below.

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
};

// Walk strings inside react-markdown's render tree, replacing
// `:::vocab[term|gloss]` with a span that shows the gloss on hover.
// remark-gfm doesn't know about our custom block so we post-process text.
const renderWithVocab = (text) => {
  if (typeof text !== 'string') return text;
  const re = /:::vocab\[([^|\]]+)\|([^\]]+)\]/g;
  const parts = [];
  let last = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <span
        key={`${match.index}-${match[1]}`}
        title={match[2].trim()}
        className="inline-flex items-baseline gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-kotoba-secondary/40 text-kotoba-text cursor-help border-b border-dashed border-kotoba-primary/50"
      >
        {match[1].trim()}
      </span>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
};

// Recursively map every text child through renderWithVocab.
const mapChildren = (children) => {
  if (Array.isArray(children)) {
    return children.flatMap((c, i) =>
      typeof c === 'string' ? renderWithVocab(c) : [<React.Fragment key={i}>{c}</React.Fragment>]
    );
  }
  if (typeof children === 'string') return renderWithVocab(children);
  return children;
};

const components = {
  p: ({ children }) => <p>{mapChildren(children)}</p>,
  li: ({ children }) => <li>{mapChildren(children)}</li>,
  td: ({ children }) => <td>{mapChildren(children)}</td>,
  a: ({ href, children }) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="text-kotoba-primary underline hover:text-kotoba-primary/80"
    >
      {mapChildren(children)}
    </a>
  ),
};

const ArticleReader = () => {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [tutor, setTutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [a, t] = await Promise.all([
          client.get(`/articles/${slug}`),
          client.get('/tutor/me'),
        ]);
        if (cancelled) return;
        setArticle(a.data);
        setTutor(t.data || null);
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || 'Article not found.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="bg-kotoba-background min-h-screen">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a
              href={apexUrl('/')}
              className="text-xs uppercase tracking-wider text-kotoba-text/50 hover:text-kotoba-primary"
            >
              Kotobaseed
            </a>
            <span className="text-kotoba-text/30">·</span>
            <Link to="/" className="text-xl font-semibold text-kotoba-primary hover:underline">
              {tutor?.display_name || 'Tutor'}
            </Link>
          </div>
          <Link to="/articles" className="text-sm text-kotoba-text/70 hover:text-kotoba-primary">
            ← All articles
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {loading && !error && <p className="text-kotoba-text">Loading…</p>}

        {article && (
          <article className="bg-white rounded-2xl shadow-sm p-8 prose prose-lg max-w-none">
            <header className="mb-6 not-prose">
              {article.published_at && (
                <p className="text-xs uppercase tracking-wider text-kotoba-text/60">
                  {formatDate(article.published_at)}
                </p>
              )}
              <h1 className="text-4xl font-extrabold text-kotoba-primary mt-1">
                {article.title}
              </h1>
              {article.summary && (
                <p className="mt-3 text-lg text-kotoba-text/80">{article.summary}</p>
              )}
            </header>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {article.body_markdown}
            </ReactMarkdown>
          </article>
        )}
      </main>
    </div>
  );
};

export default ArticleReader;
