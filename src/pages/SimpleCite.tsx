import { createSignal, Show, onMount, For } from 'solid-js';
import type { Component } from 'solid-js';
import { db } from '../db';
import type { Citation } from '../db';
import styles from './SimpleCite.module.css';

type Guideline = 'apa7' | 'mla9' | 'ieee' | 'chicago17';
type CiteEngine = 'simplecite' | 'manual';

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

const guidelineOptions: { value: Guideline; label: string; helper: string }[] = [
  {
    value: 'apa7',
    label: 'APA (7th)',
    helper: 'Best for psychology, education, and other social sciences.',
  },
  {
    value: 'mla9',
    label: 'MLA (9th)',
    helper: 'Humanities, language arts, and cultural studies.',
  },
  {
    value: 'ieee',
    label: 'IEEE',
    helper: 'Engineering and technical documentation.',
  },
  {
    value: 'chicago17',
    label: 'Chicago (17th)',
    helper: 'History, journalism, and publishing.',
  },
];

const engineOptions: { value: CiteEngine; label: string; helper: string }[] = [
  {
    value: 'simplecite',
    label: 'SimpleCite AI',
    helper: 'Paste a URL and let SimpleCite pull structured metadata.',
  },
  {
    value: 'manual',
    label: 'Manual entry',
    helper: 'Type it yourself just like Scribbr or MyBib manual mode.',
  },
];

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const formatAccessedDate = (value?: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${monthNames[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
};

const MAX_CONTEXT_CHARS = 1200;

const sanitizeContext = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clampContext = (value: string) =>
  value.length > MAX_CONTEXT_CHARS ? value.slice(0, MAX_CONTEXT_CHARS) : value;

const tryParseJson = (payload: string) => {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

const parseMetadataPayload = (payload: string): Partial<Metadata> | null => {
  const trimmed = payload.trim();
  const candidates: string[] = [];
  const codeBlock = trimmed.match(/```json([\s\S]*?)```/i) || trimmed.match(/```([\s\S]*?)```/i);
  if (codeBlock?.[1]) candidates.push(codeBlock[1]);
  const braces = trimmed.match(/\{[\s\S]*\}/);
  if (braces?.[0]) candidates.push(braces[0]);
  candidates.push(trimmed);
  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (parsed && typeof parsed === 'object') {
      return parsed as Partial<Metadata>;
    }
  }
  return null;
};

const normalizeMetadata = (data: Partial<Metadata> | null | undefined): Partial<Metadata> => {
  if (!data) return {};
  const cleaned: Partial<Metadata> = {};
  (['title', 'author', 'year', 'publisher', 'site', 'url', 'accessed'] as (keyof Metadata)[]).forEach(
    (key) => {
      const value = data[key];
      if (typeof value === 'string') {
        cleaned[key] = value.trim();
      } else if (value != null) {
        cleaned[key] = String(value).trim();
      }
    },
  );
  return cleaned;
};

const buildMetadataPrompt = (context: string, url: string) =>
  [
    'You are a meticulous citation metadata extractor.',
    'Return ONLY strict JSON with keys "title","author","year","publisher","site","accessed". Empty or missing values must be null.',
    'Never include prose, explanations, or markdown fences—respond with JSON only.',
    `Context: ${context}`,
    `URL: ${url}`,
  ].join('\n');

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const joinCitationParts = (parts: string[], fallback = '') => {
  const combined = normalizeWhitespace(parts.filter(Boolean).join(' ').trim());
  return combined || fallback;
};

const parseAuthors = (raw: string) => {
  if (!raw) return [];
  return raw
    .replace(/\s+&\s+/g, ';')
    .replace(/\sand\s/gi, ';')
    .split(/[\n;]+/)
    .map((name) => name.trim())
    .filter(Boolean);
};

const decomposeName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return { first: '', last: '' };
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map((part) => part.trim());
    return { first: first || '', last: last || '' };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first: '', last: parts[0] };
  const last = parts.pop() || '';
  return { first: parts.join(' '), last };
};

const initialsFrom = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() || ''}.`)
    .join(' ')
    .trim();

const formatAuthorsAPA = (authors: string[]) => {
  if (!authors.length) return '';
  const formatted = authors.map((name) => {
    const { first, last } = decomposeName(name);
    const initials = initialsFrom(first);
    if (!last) return name;
    return initials ? `${last}, ${initials}` : last;
  });
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
};

const formatMlaName = (name: string, invert: boolean) => {
  const { first, last } = decomposeName(name);
  if (!last) return name;
  if (!invert || !first) return `${first ? `${first} ` : ''}${last}`.trim();
  return `${last}, ${first}`;
};

const formatAuthorsMLA = (authors: string[]) => {
  if (!authors.length) return '';
  if (authors.length === 1) return formatMlaName(authors[0], true);
  if (authors.length === 2) return `${formatMlaName(authors[0], true)}, and ${formatMlaName(authors[1], false)}`;
  return `${formatMlaName(authors[0], true)}, et al.`;
};

const formatAuthorsIEEE = (authors: string[]) => {
  if (!authors.length) return '';
  return authors
    .map((name) => {
      const { first, last } = decomposeName(name);
      const initials = initialsFrom(first);
      return `${initials} ${last || ''}`.trim() || name;
    })
    .join(', ');
};

const formatAuthorsChicago = (authors: string[]) => {
  if (!authors.length) return '';
  if (authors.length === 1) return formatMlaName(authors[0], true);
  if (authors.length === 2) return `${formatMlaName(authors[0], true)} and ${formatMlaName(authors[1], false)}`;
  return `${formatMlaName(authors[0], true)} et al.`;
};

const formatCitation = (meta: Metadata, guideline: Guideline) => {
  const authors = parseAuthors(meta.author);
  const fallbackTitle = meta.title || meta.site || meta.publisher || meta.url || 'Untitled work';
  const accessed = formatAccessedDate(meta.accessed);
  const year = meta.year?.trim();

  if (guideline === 'apa7') {
    const authorSegment = formatAuthorsAPA(authors);
    const parts = [
      authorSegment ? `${authorSegment}.` : '',
      year ? `(${year}).` : '(n.d.).',
      `${fallbackTitle}.`,
      meta.site ? `${meta.site}.` : '',
      meta.publisher && meta.publisher !== meta.site ? `${meta.publisher}.` : '',
      meta.url
        ? meta.accessed
          ? `Retrieved ${accessed} from ${meta.url}.`
          : `Retrieved from ${meta.url}.`
        : '',
    ];
    return joinCitationParts(parts, meta.url);
  }

  if (guideline === 'mla9') {
    const authorSegment = formatAuthorsMLA(authors);
    const parts = [
      authorSegment ? `${authorSegment}.` : '',
      `"${fallbackTitle}."`,
      meta.site ? `${meta.site},` : '',
      meta.publisher ? `${meta.publisher},` : '',
      year ? `${year},` : '',
      meta.url ? `${meta.url}.` : '',
      accessed ? `Accessed ${accessed}.` : '',
    ];
    return joinCitationParts(parts, meta.url);
  }

  if (guideline === 'ieee') {
    const authorSegment = formatAuthorsIEEE(authors);
    const parts = [
      authorSegment ? `${authorSegment},` : '',
      `"${fallbackTitle},"`,
      meta.site ? `${meta.site},` : '',
      year ? `${year}.` : '',
      '[Online].',
      meta.url ? `Available: ${meta.url}.` : '',
      accessed ? `Accessed: ${accessed}.` : '',
    ];
    return joinCitationParts(parts, meta.url);
  }

  const authorSegment = formatAuthorsChicago(authors);
  const parts = [
    authorSegment ? `${authorSegment}.` : '',
    year ? `${year}.` : '',
    `"${fallbackTitle}."`,
    meta.site ? `${meta.site}.` : '',
    meta.publisher ? `${meta.publisher}.` : '',
    meta.url ? (accessed ? `${meta.url} (accessed ${accessed}).` : `${meta.url}.`) : '',
  ];
  return joinCitationParts(parts, meta.url);
};

const guidelineLabel = (value: string) =>
  guidelineOptions.find((option) => option.value === value)?.label || value;

const SimpleCite: Component = () => {
  const [engine, setEngine] = createSignal<CiteEngine>('simplecite');
  const [guideline, setGuideline] = createSignal<Guideline>('apa7');
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
    setStatus('');
  };

  const handleEngineChange = (next: CiteEngine) => {
    setEngine(next);
    setStatus('');
  };

  const startNewCitation = () => {
    setMeta({ ...emptyMeta });
    setUrl('');
    setGuideline('apa7');
    setEngine('simplecite');
    setStatus('');
    setModalOpen(true);
  };

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      setStatus('Copied citation to clipboard.');
    } catch {
      setStatus('Clipboard permissions blocked—select the text manually.');
    }
  };

  const runSimpleCite = async () => {
    const value = url().trim();
    if (!value) {
      setStatus('Paste a URL to let SimpleCite fetch metadata.');
      return;
    }
    const targetUrl = /^(https?:)?\/\//i.test(value) ? value : `https://${value}`;
    if (targetUrl !== value) {
      setUrl(targetUrl);
    }
    setLoading(true);
    setStatus('Pulling a readable version of the page…');
    try {
      let metaResult: Partial<Metadata> | null = null;
      let markdown: string | null = null;
      const encodedTarget = encodeURIComponent(targetUrl);

      const jinaUrls = [
        `https://r.jina.ai/${targetUrl}`,
        `https://r.jina.ai/https://anything.rhenrywarren.workers.dev/?url=${encodedTarget}`,
        `https://r.jina.ai/http://anything.rhenrywarren.workers.dev/?url=${encodedTarget}`,
      ];

      for (const jurl of jinaUrls) {
        try {
          const jina = await fetch(jurl);
          if (jina.ok) {
            const md = await jina.text();
            if (md) {
              markdown = md;
              break;
            }
          }
        } catch {
        }
      }

      if (markdown) {
        const snippet = clampContext(sanitizeContext(markdown));
        if (!snippet) {
          setStatus('Could not find readable content. Try the manual option.');
        } else {
          setStatus('Extracting metadata with SimpleCite…');
          const prompt = buildMetadataPrompt(snippet, targetUrl);
          try {
            const llm = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`, {
              headers: {
                Accept: 'text/plain',
              },
            });
            if (llm.ok) {
              const raw = await llm.text();
              const parsed = normalizeMetadata(parseMetadataPayload(raw));
              if (Object.keys(parsed).length) {
                metaResult = parsed;
              } else {
                setStatus('SimpleCite could not understand the response. Try again or switch to manual.');
              }
            } else {
              setStatus('Pollinations is unavailable right now. Try again in a bit.');
            }
          } catch (error) {
            console.error('SimpleCite metadata fetch failed', error);
            setStatus('Could not reach the metadata service.');
          }
        }
      }

      if (!metaResult || (!metaResult.title && !metaResult.site)) {
        setStatus('Could not auto-extract. Try the manual option like on MyBib.');
        setEngine('manual');
        return;
      }

      const now = new Date();
      const accessed = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;
      const merged: Metadata = {
        ...emptyMeta,
        ...metaResult,
        url: targetUrl,
        year: metaResult.year || now.getFullYear().toString(),
        accessed: metaResult.accessed || accessed,
      };
      setMeta(merged);
      setStatus('Metadata loaded. Double-check the fields before saving.');
      setEngine('simplecite');
    } finally {
      setLoading(false);
    }
  };

  const citation = () => formatCitation(meta(), guideline());

  const handleSave = async () => {
    const text = citation();
    if (!text) {
      setStatus('Fill in at least a title or URL before saving.');
      return;
    }
    await db.citations.add({
      style: guideline(),
      text,
      meta: JSON.stringify(meta()),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await loadCitations();
    setModalOpen(false);
    setStatus('Citation saved—use Copy whenever you need it.');
  };

  const selectedGuideline = () =>
    guidelineOptions.find((option) => option.value === guideline()) || guidelineOptions[0];

  return (
    <div class={styles.container}>
      <div class={styles.header}>
        <div>
          <div class={styles.eyebrow}>Research-ready in seconds</div>
          <div class={styles.titleRow}>
            <div class={styles.title}>SimpleCite</div>
            <span class={styles.betaPill}>revamped</span>
          </div>
          <p class={styles.subtitle}>
            Works like Scribbr or MyBib—pick a guideline, gather metadata with SimpleCite, and copy
            the finished reference without bouncing to another tab.
          </p>
        </div>
        <div class={styles.actions}>
          <button class={`${styles.button} ${styles.buttonPrimary}`} onClick={startNewCitation}>
            <span class="material-symbols-outlined" aria-hidden="true">add</span>
            <span>New citation</span>
          </button>
          <button
            class={styles.button}
            disabled={!citations().length}
            onClick={async () => {
              if (!citations().length) return;
              if (confirm('Clear all citations?')) {
                await db.citations.clear();
                await loadCitations();
                setStatus('History cleared.');
              }
            }}
          >
            <span class="material-symbols-outlined" aria-hidden="true">delete</span>
            <span>Clear history</span>
          </button>
        </div>
      </div>
      <div class={styles.content}>
        <div class={styles.board}>
          <div class={styles.listHeader}>
            <div>
              <div class={styles.label}>Saved citations</div>
              <div class={styles.helperText}>
                {citations().length
                  ? 'Click any card or the copy button to reuse it.'
                  : 'Once you save a cite it will live here for quick copy/paste.'}
              </div>
            </div>
          </div>
          <Show
            when={citations().length > 0}
            fallback={
              <div class={styles.listEmpty}>
                <div>Nothing saved yet.</div>
                <button class={styles.button} onClick={startNewCitation}>
                  <span class="material-symbols-outlined" aria-hidden="true">rocket_launch</span>
                  <span>Build your first citation</span>
                </button>
              </div>
            }
          >
            <div class={styles.list}>
              <For each={citations()}>
                {(c) => (
                  <div class={styles.listItem} onClick={() => copyToClipboard(c.text)}>
                    <div class={styles.listInfo}>
                      <div class={styles.listStyle}>{guidelineLabel(c.style)}</div>
                      <div class={styles.listText}>{c.text}</div>
                    </div>
                    <button
                      class={styles.copyButton}
                      onClick={(event) => {
                        event.stopPropagation();
                        copyToClipboard(c.text);
                      }}
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
                      <span>Copy</span>
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <div class={styles.status}>{status()}</div>
        </div>
        <div class={styles.quickPanel}>
          <div class={styles.quickCard}>
            <div class={styles.cardTitle}>Just need the cite?</div>
            <p class={styles.cardBody}>
              Choose a guideline, let SimpleCite grab the details, or flip to manual mode when you
              already know them.
            </p>
            <div class={styles.pills}>
              <For each={guidelineOptions}>
                {(option) => (
                  <span class={styles.pill}>{option.label}</span>
                )}
              </For>
            </div>
            <button class={`${styles.button} ${styles.buttonPrimary}`} onClick={startNewCitation}>
              <span class="material-symbols-outlined" aria-hidden="true">auto_fix_high</span>
              <span>Launch builder</span>
            </button>
          </div>
        </div>
      </div>
      {modalOpen() && (
        <div class={styles.overlay} onClick={() => setModalOpen(false)}>
          <div class={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div class={styles.modalHeader}>
              <div>
                <div class={styles.modalTitle}>Create a citation</div>
                <div class={styles.helperText}>Pick your citing engine and guideline.</div>
              </div>
              <button class={styles.closeButton} onClick={() => setModalOpen(false)}>
                  <span class="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
            <div class={styles.modalBody}>
              <div class={styles.modalColumn}>
                <div class={styles.label}>Citing option</div>
                <div class={styles.engineSelector}>
                  <For each={engineOptions}>
                    {(option) => (
                      <button
                        class={`${styles.engineOption} ${
                          engine() === option.value ? styles.engineActive : ''
                        }`}
                        onClick={() => handleEngineChange(option.value)}
                      >
                        <div class={styles.engineLabel}>{option.label}</div>
                        <div class={styles.engineDescription}>{option.helper}</div>
                      </button>
                    )}
                  </For>
                </div>
                <Show
                  when={engine() === 'simplecite'}
                  fallback={
                    <div class={styles.manualForm}>
                      <div class={styles.row}>
                        <div>
                          <div class={styles.label}>Author(s)</div>
                          <input
                            class={styles.input}
                            value={meta().author}
                            placeholder="Separate authors with commas"
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
                            placeholder="2024"
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
                            placeholder="Article or page name"
                            onInput={(e) =>
                              handleManualChange('title', (e.target as HTMLInputElement).value)
                            }
                          />
                        </div>
                      </div>
                      <div class={styles.row}>
                        <div>
                          <div class={styles.label}>Site / Container</div>
                          <input
                            class={styles.input}
                            value={meta().site}
                            placeholder="Website or journal"
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
                            placeholder="Publisher"
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
                            placeholder="https://example.com"
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
                            placeholder="YYYY-MM-DD"
                            onInput={(e) =>
                              handleManualChange('accessed', (e.target as HTMLInputElement).value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  }
                >
                  <div class={styles.simpleCiteBox}>
                    <input
                      class={styles.input}
                      value={url()}
                      placeholder="https://example.com/article"
                      onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
                    />
                    <div class={styles.helperText}>
                      SimpleCite fetches readable markdown via jina.ai so it behaves like Scribbr's
                      auto-cite.
                    </div>
                    <div class={styles.actions}>
                      <button
                        class={`${styles.button} ${styles.buttonPrimary}`}
                        disabled={loading()}
                        onClick={runSimpleCite}
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">
                          {loading() ? 'hourglass_empty' : 'travel_explore'}
                        </span>
                        <span>{loading() ? 'Working…' : 'Fetch metadata'}</span>
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
              <div class={styles.modalColumn}>
                <div class={styles.label}>Guideline</div>
                <select
                  class={styles.select}
                  value={guideline()}
                  onInput={(e) => setGuideline((e.target as HTMLSelectElement).value as Guideline)}
                >
                  <For each={guidelineOptions}>
                    {(option) => (
                      <option value={option.value}>{option.label}</option>
                    )}
                  </For>
                </select>
                <div class={styles.helperText}>{selectedGuideline().helper}</div>
                <div class={styles.previewBox}>
                  <div class={styles.previewTitle}>Formatted citation</div>
                  <div class={styles.citationLine}>{citation() || 'Start typing to see the cite.'}</div>
                  <div class={styles.previewActions}>
                    <button
                      class={styles.button}
                      disabled={!citation()}
                      onClick={() => copyToClipboard(citation())}
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
                      <span>Copy preview</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class={styles.modalFooter}>
              <button class={styles.button} onClick={() => setModalOpen(false)}>
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
                <span>Cancel</span>
              </button>
              <button class={`${styles.button} ${styles.buttonPrimary}`} onClick={handleSave}>
                <span class="material-symbols-outlined" aria-hidden="true">save</span>
                <span>Save citation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleCite;


