import { createSignal, Show, onMount, For } from 'solid-js';
import type { Component } from 'solid-js';
import { db } from '../db';
import type { Citation } from '../db';
import styles from './SimpleCite.module.css';

type CiteStyle = 'simple' | 'apa7' | 'mla9' | 'ieee';
type Mode = 'smart' | 'manual';

interface Metadata {
  title: string;
  author: string;
  year: string;
  site: string;
  publisher: string;
  url: string;
  accessed: string;
}

const emptyMeta: Metadata = {
  title: '',
  author: '',
  year: '',
  site: '',
  publisher: '',
  url: '',
  accessed: '',
};

const formatCitation = (meta: Metadata, style: CiteStyle) => {
  const author = meta.author || '';
  const year = meta.year || '';
  const title = meta.title || '';
  const site = meta.site || meta.publisher || '';
  const url = meta.url || '';
  const accessed = meta.accessed || '';
  if (!title && !url) return '';
  if (style === 'ieee') {
    const parts = [];
    if (author) parts.push(author);
    if (title) parts.push(`"${title}"`);
    if (site) parts.push(site);
    if (year) parts.push(year);
    if (url) parts.push(url);
    if (accessed) parts.push(`accessed ${accessed}`);
    return parts.join(', ') + '.';
  }
  if (style === 'apa7') {
    const parts = [];
    if (author) parts.push(`${author}.`);
    if (year) parts.push(`(${year}).`);
    if (title) parts.push(`${title}.`);
    if (site) parts.push(`${site}.`);
    if (url) parts.push(url);
    if (accessed) parts.push(`Accessed ${accessed}.`);
    return parts.join(' ');
  }
  if (style === 'mla9') {
    const parts = [];
    if (author) parts.push(`${author}.`);
    if (title) parts.push(`"${title}."`);
    if (site) parts.push(site + ',');
    if (year) parts.push(year + ',');
    if (url) parts.push(url + '.');
    if (accessed) parts.push(`Accessed ${accessed}.`);
    return parts.join(' ');
  }
  const parts = [];
  if (author) parts.push(author);
  if (title) parts.push(`“${title}”`);
  if (site) parts.push(site);
  if (year) parts.push(year);
  if (url) parts.push(url);
  if (accessed) parts.push(`accessed ${accessed}`);
  return parts.join(' • ');
};

const parseHtmlMetadata = (html: string, url: string): Partial<Metadata> => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const getMeta = (selector: string) =>
    doc.querySelector(selector)?.getAttribute('content') || '';
  const title =
    getMeta('meta[property="og:title"]') ||
    getMeta('meta[name="citation_title"]') ||
    doc.querySelector('title')?.textContent ||
    '';
  const author =
    getMeta('meta[name="author"]') ||
    getMeta('meta[name="citation_author"]') ||
    '';
  const site =
    getMeta('meta[property="og:site_name"]') || new URL(url).hostname;
  const publisher =
    getMeta('meta[name="publisher"]') ||
    getMeta('meta[name="citation_journal_title"]') ||
    '';
  const dateRaw =
    getMeta('meta[name="date"]') ||
    getMeta('meta[property="article:published_time"]') ||
    '';
  const year = dateRaw ? dateRaw.slice(0, 4) : '';
  return {
    title: title.trim(),
    author: author.trim(),
    site: site.trim(),
    publisher: publisher.trim(),
    year,
  };
};

const SimpleCite: Component = () => {
  const [mode, setMode] = createSignal<Mode>('smart');
  const [style, setStyle] = createSignal<CiteStyle>('simple');
  const [url, setUrl] = createSignal('');
  const [meta, setMeta] = createSignal<Metadata>({ ...emptyMeta });
  const [status, setStatus] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [citations, setCitations] = createSignal<Citation[]>([]);
  const [modalOpen, setModalOpen] = createSignal(false);

  const loadCitations = async () => {
    const items = await db.citations.orderBy('createdAt').reverse().toArray();
    setCitations(items);
  };

  onMount(() => {
    loadCitations();
  });

  const handleManualChange = (field: keyof Metadata, value: string) => {
    setMeta({ ...meta(), [field]: value });
  };

  const runSmart = async () => {
    const value = url().trim();
    if (!value) return;
    setLoading(true);
    setStatus('Fetching metadata…');
    try {
      let metaResult: Partial<Metadata> = {};
      let markdown: string | null = null;

      const jinaUrls = [
        'https://r.jina.ai/' + value,
        'https://r.jina.ai/https://anything.rhenrywarren.workers.dev/?url=' +
          encodeURIComponent(value),
      ];

      for (const jurl of jinaUrls) {
        try {
          const jina = await fetch(jurl);
          if (jina.ok) {
            const md = await jina.text();
            if (md && md.length > 0) {
              markdown = md;
              break;
            }
          }
        } catch {
        }
      }

      if (markdown) {
        setStatus('Asking SimpleCite AI for metadata…');
        const prompt =
          'You are a citation metadata extractor. Given markdown and URL, return ONLY JSON with keys "title","author","year","publisher","site","accessed". If unknown use null. ' +
          'Markdown: ' +
          markdown.slice(0, 6000) +
          ' URL: ' +
          value;
        try {
          const llm = await fetch(
            'https://text.pollinations.ai/' + encodeURIComponent(prompt),
          );
          if (llm.ok) {
            const raw = await llm.text();
            try {
              const parsed = JSON.parse(raw) as Partial<Metadata>;
              metaResult = {
                title: parsed.title || '',
                author: parsed.author || '',
                year: parsed.year || '',
                publisher: parsed.publisher || '',
                site: parsed.site || '',
                accessed: parsed.accessed || '',
              };
            } catch {
            }
          }
        } catch {
        }
      }
      if (!metaResult.title) {
        setStatus('Oops! You have to use Manual on that one.');
        setMode('manual');
        setLoading(false);
        return;
      }
      const now = new Date();
      const isoYear = now.getFullYear().toString();
      const accessed = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;
      const merged: Metadata = {
        ...emptyMeta,
        ...metaResult,
        url: value,
        year: metaResult.year || isoYear,
        accessed: metaResult.accessed || accessed,
      };
      setMeta(merged);
      setStatus('Metadata loaded. You can tweak fields if you like.');
      setMode('smart');
    } finally {
      setLoading(false);
    }
  };

  const citation = () => formatCitation(meta(), style());

  return (
    <div class={styles.container}>
      <div class={styles.header}>
        <div class={styles.title}>SimpleCite</div>
        <div class={styles.actions}>
          <button
            class={`${styles.button} ${styles.buttonPrimary}`}
            onClick={() => {
              setMeta({ ...emptyMeta });
              setUrl('');
              setStatus('');
              setMode('smart');
              setStyle('simple');
              setModalOpen(true);
            }}
          >
            New citation
          </button>
          <button
            class={styles.button}
            onClick={async () => {
              if (confirm('Clear all citations?')) {
                await db.citations.clear();
                await loadCitations();
              }
            }}
          >
            Clear citations
          </button>
        </div>
      </div>
      <div class={styles.content}>
        <div class={styles.column}>
          <div class={styles.label}>Saved citations (click to copy)</div>
          <div class={styles.list}>
            <For each={citations()}>
              {(c) => (
                <div
                  class={styles.listItem}
                  onClick={() => {
                    navigator.clipboard?.writeText(c.text);
                    setStatus('Copied citation to clipboard.');
                  }}
                >
                  <div class={styles.listStyle}>{c.style}</div>
                  <div class={styles.listText}>{c.text}</div>
                </div>
              )}
            </For>
          </div>
          <div class={styles.status}>{status()}</div>
        </div>
      </div>
      {modalOpen() && (
        <div class={styles.overlay} onClick={() => setModalOpen(false)}>
          <div class={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div class={styles.modalHeader}>
              <div class={styles.modalTitle}>New citation</div>
              <div
                class={styles.modeToggle}
                onClick={() => setMode(mode() === 'smart' ? 'manual' : 'smart')}
              >
                {mode() === 'smart' ? 'or Cite Manually' : 'back to SimpleCite'}
              </div>
            </div>
            <div class={styles.modalBody}>
              <div class={styles.column}>
                <Show
                  when={mode() === 'smart'}
                  fallback={
                    <>
                      <div class={styles.label}>Manual citation</div>
                      <div class={styles.row}>
                        <div>
                          <div class={styles.label}>Author</div>
                          <input
                            class={styles.input}
                            value={meta().author}
                            onInput={(e) =>
                              handleManualChange('author', (e.target as HTMLInputElement).value)
                            }
                          />
                        </div>
                        <div>
                          <div class={styles.label}>Year</div>
                          <input
                            class={styles.input}
                            value={meta().year}
                            onInput={(e) =>
                              handleManualChange('year', (e.target as HTMLInputElement).value)
                            }
                          />
                        </div>
                      </div>
                      <div class={styles.row}>
                        <div>
                          <div class={styles.label}>Title</div>
                          <input
                            class={styles.input}
                            value={meta().title}
                            onInput={(e) =>
                              handleManualChange('title', (e.target as HTMLInputElement).value)
                            }
                          />
                        </div>
                      </div>
                      <div class={styles.row}>
                        <div>
                          <div class={styles.label}>Site or container</div>
                          <input
                            class={styles.input}
                            value={meta().site}
                            onInput={(e) =>
                              handleManualChange('site', (e.target as HTMLInputElement).value)
                            }
                          />
                        </div>
                        <div>
                          <div class={styles.label}>Publisher</div>
                          <input
                            class={styles.input}
                            value={meta().publisher}
                            onInput={(e) =>
                              handleManualChange('publisher', (e.target as HTMLInputElement).value)
                            }
                          />
                        </div>
                      </div>
                      <div class={styles.row}>
                        <div>
                          <div class={styles.label}>URL</div>
                          <input
                            class={styles.input}
                            value={meta().url}
                            onInput={(e) =>
                              handleManualChange('url', (e.target as HTMLInputElement).value)
                            }
                          />
                        </div>
                      </div>
                      <div class={styles.row}>
                        <div>
                          <div class={styles.label}>Accessed</div>
                          <input
                            class={styles.input}
                            value={meta().accessed}
                            onInput={(e) =>
                              handleManualChange('accessed', (e.target as HTMLInputElement).value)
                            }
                            placeholder="YYYY-MM-DD"
                          />
                        </div>
                      </div>
                    </>
                  }
                >
                  <>
                    <div class={styles.label}>Paste URL</div>
                    <input
                      class={styles.input}
                      value={url()}
                      onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
                      placeholder="https://example.com/article"
                    />
                    <div class={styles.actions}>
                      <button
                        class={`${styles.button} ${styles.buttonPrimary}`}
                        disabled={loading()}
                        onClick={runSmart}
                      >
                        {loading() ? 'Working…' : 'SimpleCite'}
                      </button>
                    </div>
                  </>
                </Show>
              </div>
              <div class={styles.column}>
                <div class={styles.row}>
                  <div>
                    <div class={styles.label}>Style</div>
                    <select
                      class={styles.select}
                      value={style()}
                      onInput={(e) => setStyle((e.target as HTMLSelectElement).value as CiteStyle)}
                    >
                      <option value="simple">SimpleCite</option>
                      <option value="apa7">APA 7</option>
                      <option value="mla9">MLA 9</option>
                      <option value="ieee">IEEE</option>
                    </select>
                  </div>
                </div>
                <div class={styles.previewBox}>
                  <div class={styles.previewTitle}>Formatted citation</div>
                  <div class={styles.citationLine}>{citation()}</div>
                </div>
              </div>
            </div>
            <div class={styles.modalFooter}>
              <button
                class={styles.button}
                onClick={() => {
                  setModalOpen(false);
                  setStatus('');
                }}
              >
                Cancel
              </button>
              <button
                class={`${styles.button} ${styles.buttonPrimary}`}
                onClick={async () => {
                  const text = citation();
                  if (!text) {
                    setStatus('Fill in enough fields to build a citation.');
                    return;
                  }
                  await db.citations.add({
                    style: style(),
                    text,
                    meta: JSON.stringify(meta()),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  });
                  await loadCitations();
                  setModalOpen(false);
                  setStatus('Citation saved.');
                }}
              >
                Save citation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleCite;


