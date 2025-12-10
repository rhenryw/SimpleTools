import { createSignal, Show, onMount, For } from 'solid-js';
import type { Component } from 'solid-js';
import { db } from '../db';
import type { Citation } from '../db';
import styles from './SimpleCite.module.css';

type Guideline = 'apa7' | 'mla9' | 'ieee' | 'chicago17';
type CiteEngine = 'simplecite' | 'manual';
type LoadingStage = 'idle' | 'metadata' | 'metadataProxy' | 'ai';
type MetadataSource = 'manual' | 'simplecite' | 'simplecite-ai';

interface Metadata {
  title: string;
  author: string;
  year: string;
  site: string;
  publisher: string;
  url: string;
  accessed: string;
  source?: MetadataSource;
}

const metadataStringKeys: (keyof Omit<Metadata, 'source'>)[] = [
  'title',
  'author',
  'year',
  'publisher',
  'site',
  'url',
  'accessed',
];

interface CitationResult {
  text: string;
  html: string;
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

const formatPublishedDate = (value?: string) => {
  if (!value) return '';
  const trimmed = value.trim();
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    if (/^\d{4}$/.test(trimmed)) {
      return `${parsed.getFullYear()}`;
    }
    const month = monthNames[parsed.getMonth()];
    const day = parsed.getDate();
    return `${month} ${day}, ${parsed.getFullYear()}`;
  }
  return trimmed;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttribute = (value: string) => escapeHtml(value);

const linkHtml = (url: string) =>
  `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`;

const buildCitationResult = (
  textParts: string[],
  htmlParts: string[],
  fallbackText: string,
  fallbackHtml?: string,
): CitationResult => {
  const text = joinCitationParts(textParts, fallbackText);
  const html = joinCitationParts(htmlParts, fallbackHtml || escapeHtml(fallbackText));
  return { text, html };
};

const sanitizeContext = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const POLLINATIONS_CHUNK_SIZE = 4999;

const splitContextIntoChunks = (value: string, size = POLLINATIONS_CHUNK_SIZE) => {
  const sanitized = sanitizeContext(value);
  if (!sanitized) return [];
  if (sanitized.length <= size) return [sanitized];
  const first = sanitized.slice(0, size);
  const last = sanitized.slice(-size);
  if (first === last) return [first];
  return [first, last];
};

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
  metadataStringKeys.forEach((key) => {
    const value = data[key];
    if (typeof value === 'string') {
      cleaned[key] = value.trim();
    } else if (value != null) {
      cleaned[key] = String(value).trim();
    }
  });
  return cleaned;
};

const hasMeaningfulMetadata = (data: Partial<Metadata> | null | undefined) => {
  if (!data) return false;
  return Boolean(data.title || data.author || data.site || data.publisher);
};

const mergeMetadataValues = (
  current: Partial<Metadata> | null,
  incoming: Partial<Metadata> | null,
): Partial<Metadata> | null => {
  if (!incoming) return current;
  const merged: Partial<Metadata> = { ...(current || {}) };
  metadataStringKeys.forEach((key) => {
    const value = incoming[key];
    if (typeof value === 'string' && value.trim()) {
      merged[key] = value.trim();
    }
  });
  if (incoming.source) {
    merged.source = incoming.source;
  }
  return merged;
};

const metadataIsSufficient = (
  data: Partial<Metadata> | null | undefined,
  options?: { requireAuthor?: boolean },
) => {
  if (!data) return false;
  const hasTitle = Boolean(data.title);
  const hasOrigin = Boolean(data.site || data.publisher || data.url);
  const hasAuthor = Boolean(data.author);
  if (options?.requireAuthor) {
    return hasTitle && hasOrigin && hasAuthor;
  }
  return hasTitle && hasOrigin;
};

const hostnameFromUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
};

const domainPattern = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

const looksLikeHostname = (value?: string, url?: string) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (domainPattern.test(normalized)) return true;
  if (url) {
    const host = hostnameFromUrl(url).toLowerCase();
    if (host && host === normalized) return true;
  }
  return false;
};

const promoteOriginFields = (data: Metadata) => {
  const next = { ...data };
  const hostname = next.url ? hostnameFromUrl(next.url) : '';
  const siteIsHostname = looksLikeHostname(next.site, next.url);
  const publisherIsHostname = looksLikeHostname(next.publisher, next.url);

  if ((!next.site || siteIsHostname) && next.publisher) {
    next.site = next.publisher;
  } else if (!next.site && hostname) {
    next.site = hostname;
  }

  if (next.publisher && ((publisherIsHostname && next.site) || next.publisher.toLowerCase() === (next.site || '').toLowerCase())) {
    next.publisher = '';
  }

  return next;
};

const scrubOrganizationalAuthor = (data: Metadata) => {
  if (!data.author) return data;
  const conflicts = [data.site, data.publisher];
  if (data.url) conflicts.push(hostnameFromUrl(data.url));
  const normalized = data.author.trim().toLowerCase();
  const normalizedConflicts = conflicts.filter((value): value is string => Boolean(value));
  const clash = normalizedConflicts.some((value) => value.trim().toLowerCase() === normalized);
  if (clash) {
    return { ...data, author: '' };
  }
  return data;
};

const finalizeMetadata = (data: Metadata) => scrubOrganizationalAuthor(promoteOriginFields(data));

type JsonLdEntry = Record<string, unknown>;

const flattenJsonLdNodes = (value: unknown): JsonLdEntry[] => {
  const entries: JsonLdEntry[] = [];
  const visit = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'object') {
      const record = node as JsonLdEntry;
      entries.push(record);
      if (record['@graph']) {
        visit(record['@graph']);
      }
    }
  };
  visit(value);
  return entries;
};

const extractJsonLdText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const extractJsonLdAuthors = (value: unknown): string => {
  const nodes = Array.isArray(value) ? value : value ? [value] : [];
  return nodes
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        const node = entry as JsonLdEntry;
        if (typeof node.name === 'string') return node.name;
        if (typeof node['@name'] === 'string') return node['@name'] as string;
      }
      return '';
    })
    .filter(Boolean)
    .join('; ');
};

const parseJsonLdMetadata = (doc: Document, originalUrl: string): Partial<Metadata> => {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  const articleTypes = ['article', 'newsarticle', 'blogposting', 'webpage', 'creativework'];
  for (const script of scripts) {
    const content = script.textContent?.trim();
    if (!content) continue;
    try {
      const parsed = JSON.parse(content);
      const entries = flattenJsonLdNodes(parsed);
      const candidate = entries.find((entry) => {
        const typeField = entry['@type'];
        const typeValues = Array.isArray(typeField) ? typeField : typeField ? [typeField] : [];
        return typeValues.some(
          (value) => typeof value === 'string' && articleTypes.includes(value.toLowerCase()),
        );
      });
      if (!candidate) continue;

      const title =
        extractJsonLdText(candidate.headline) ||
        extractJsonLdText(candidate.name) ||
        extractJsonLdText(candidate.alternativeHeadline);

      const author = extractJsonLdAuthors(candidate.author || candidate.creator);

      let publisher = '';
      if (typeof candidate.publisher === 'string') {
        publisher = candidate.publisher;
      } else if (candidate.publisher && typeof candidate.publisher === 'object') {
        const pub = candidate.publisher as JsonLdEntry;
        publisher = extractJsonLdText(pub.name) || extractJsonLdText(pub.legalName);
      }

      let site = publisher;
      if (!site && candidate.isPartOf && typeof candidate.isPartOf === 'object') {
        const part = candidate.isPartOf as JsonLdEntry;
        site = extractJsonLdText(part.name);
      }

      const year =
        extractJsonLdText(candidate.datePublished) ||
        extractJsonLdText(candidate.dateModified) ||
        '';

      const jsonMeta: Partial<Metadata> = {
        title,
        author,
        publisher,
        site: site || hostnameFromUrl(originalUrl),
        year,
        url: extractJsonLdText(candidate.url) || originalUrl,
      };

      return normalizeMetadata(jsonMeta);
    } catch {
      // ignore invalid JSON-LD blocks and continue
    }
  }
  return {};
};

const parseHtmlMetadata = (html: string, originalUrl: string): Partial<Metadata> => {
  if (typeof DOMParser === 'undefined') return {};
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const getMeta = (selectors: string[]) => {
    for (const selector of selectors) {
      const node = doc.querySelector(selector);
      const content = node?.getAttribute('content') || node?.getAttribute('value');
      if (content && content.trim()) return content.trim();
    }
    return '';
  };
  const getText = (selectors: string[]) => {
    for (const selector of selectors) {
      const text = doc.querySelector(selector)?.textContent?.trim();
      if (text) return text;
    }
    return '';
  };

  const title =
    getMeta([
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]',
      'meta[itemprop="headline"]',
    ]) || getText(['title', 'h1']);

  const author = getMeta([
    'meta[name="author"]',
    'meta[property="article:author"]',
    'meta[name="article:author"]',
    'meta[name="byl"]',
    'meta[name="dc.creator"]',
    'meta[name="citation_author"]',
  ]);

  const publisher =
    getMeta([
      'meta[name="publisher"]',
      'meta[property="article:publisher"]',
      'meta[name="citation_publisher"]',
      'meta[name="organization"]',
    ]) || getMeta(['meta[name="application-name"]']);

  const site =
    getMeta([
      'meta[property="og:site_name"]',
      'meta[name="application-name"]',
    ]) || hostnameFromUrl(originalUrl);

  const publishedRaw =
    getMeta([
      'meta[property="article:published_time"]',
      'meta[name="pubdate"]',
      'meta[name="date"]',
      'meta[name="dcterms.created"]',
      'meta[itemprop="datePublished"]',
    ]) || doc.querySelector('time[datetime]')?.getAttribute('datetime')?.trim() || '';

  const result: Partial<Metadata> = {
    title,
    author,
    publisher,
    site,
    year: publishedRaw,
    url: originalUrl,
  };
  const jsonLd = parseJsonLdMetadata(doc, originalUrl);
  const mergedResult = mergeMetadataValues(result, jsonLd) || result;
  return normalizeMetadata(mergedResult);
};

const proxiedUrl = (target: string) =>
  `https://anything.rhenrywarren.workers.dev/?url=${encodeURIComponent(target)}`;

const fetchPageHtml = async (target: string) => {
  try {
    const response = await fetch(target, {
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type');
    if (contentType && !/text\/(html|plain)/i.test(contentType)) return null;
    return await response.text();
  } catch (error) {
    console.warn('Metadata fetch failed for', target, error);
    return null;
  }
};

const gatherMetadataFromSource = async (targetUrl: string, useProxy = false) => {
  const source = useProxy ? proxiedUrl(targetUrl) : targetUrl;
  const html = await fetchPageHtml(source);
  if (!html) {
    return { meta: null as Partial<Metadata> | null, blocked: true };
  }
  const parsed = parseHtmlMetadata(html, targetUrl);
  return {
    meta: hasMeaningfulMetadata(parsed) ? parsed : null,
    blocked: false,
  };
};

const buildMetadataPrompt = (context: string, url: string) =>
  [
    'You are a meticulous citation metadata extractor.',
    'Return ONLY strict JSON with keys "title","author","year","publisher","site","accessed". Empty or missing values must be null.',
    'Never include prose, explanations, or markdown fences—respond with JSON only.',
    `Context: ${context}`,
    `URL: ${url}`,
  ].join('\n');

const fetchReadableMarkdown = async (targetUrl: string) => {
  const encodedTarget = encodeURIComponent(targetUrl);
  const jinaUrls = [
    `https://r.jina.ai/${targetUrl}`,
    `https://r.jina.ai/https://anything.rhenrywarren.workers.dev/?url=${encodedTarget}`,
    `https://r.jina.ai/http://anything.rhenrywarren.workers.dev/?url=${encodedTarget}`,
  ];
  for (const jurl of jinaUrls) {
    try {
      const response = await fetch(jurl);
      if (response.ok) {
        const markdown = await response.text();
        if (markdown) return markdown;
      }
    } catch {
      // Ignore and try the next mirror
    }
  }
  return null;
};

const fetchMetadataViaAi = async (
  targetUrl: string,
  onProgress?: (message: string) => void,
  options?: { requireAuthor?: boolean },
): Promise<{ meta: Partial<Metadata> | null; error?: string }> => {
  const markdown = await fetchReadableMarkdown(targetUrl);
  if (!markdown) {
    return { meta: null, error: 'Could not load a readable version of the page. Try the manual option.' };
  }
  const promptChunks = splitContextIntoChunks(markdown);
  if (!promptChunks.length) {
    return { meta: null, error: 'Could not find readable content. Try the manual option.' };
  }

  let metaResult: Partial<Metadata> | null = null;
  let lastError = '';
  for (let i = 0; i < promptChunks.length; i += 1) {
    const chunk = promptChunks[i];
    const chunkLabel = promptChunks.length > 1 ? ` (${i + 1}/${promptChunks.length})` : '';
    onProgress?.(`Extracting metadata with SimpleCite…${chunkLabel}`);
    try {
      const prompt = buildMetadataPrompt(chunk, targetUrl);
      const llm = await fetch(
        `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai-fast`,
        {
          headers: { Accept: 'text/plain' },
        },
      );
      if (!llm.ok) {
        lastError = 'Pollinations is unavailable right now. Try again in a bit.';
        continue;
      }
      const raw = await llm.text();
      const parsed = normalizeMetadata(parseMetadataPayload(raw));
      if (Object.keys(parsed).length) {
        metaResult = mergeMetadataValues(metaResult, parsed);
        if (metadataIsSufficient(metaResult, { requireAuthor: options?.requireAuthor })) {
          break;
        }
        continue;
      }
      lastError = 'SimpleCite could not understand the response. Try again or switch to manual.';
    } catch (error) {
      console.error('SimpleCite metadata fetch failed', error);
      lastError = 'Could not reach the metadata service.';
    }
  }

  if (metaResult) {
    return { meta: metaResult, error: lastError || undefined };
  }

  return { meta: null, error: lastError || 'Could not find readable content. Try the manual option.' };
};

const mergeMetadataWithDefaults = (data: Partial<Metadata>, targetUrl: string): Metadata => {
  const merged: Metadata = {
    ...emptyMeta,
    ...data,
    url: data.url || targetUrl,
    year: data.year || '',
    accessed: data.accessed || '',
  };
  return finalizeMetadata(merged);
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const ensureTrailingPeriod = (value: string) => (value.trim().endsWith('.') ? value.trim() : `${value.trim()}.`);

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

const formatCitation = (meta: Metadata, guideline: Guideline): CitationResult => {
  const authors = parseAuthors(meta.author);
  const fallbackTitle = meta.title || meta.site || meta.publisher || meta.url || 'Untitled work';
  const accessed = formatAccessedDate(meta.accessed);
  const published = formatPublishedDate(meta.year);
  const fallbackText = meta.url || fallbackTitle;
  const fallbackHtml = meta.url ? linkHtml(meta.url) : escapeHtml(fallbackTitle);
  const textParts: string[] = [];
  const htmlParts: string[] = [];
  const push = (text: string, html?: string) => {
    if (!text || !text.trim()) return;
    textParts.push(text.trim());
    htmlParts.push(html || escapeHtml(text.trim()));
  };

  if (guideline === 'apa7') {
    const authorSegment = formatAuthorsAPA(authors);
    if (authorSegment) push(ensureTrailingPeriod(authorSegment));
    push(published ? `(${published}).` : '(n.d.).');
    push(
      `${fallbackTitle}.`,
      fallbackTitle ? `<i>${escapeHtml(fallbackTitle)}</i>.` : undefined,
    );
    if (meta.site) push(`${meta.site}.`);
    if (meta.publisher && meta.publisher !== meta.site) push(`${meta.publisher}.`);
    if (meta.url) {
      if (accessed) {
        const text = `Retrieved ${accessed} from ${meta.url}.`;
        const html = `Retrieved ${escapeHtml(accessed)} from ${linkHtml(meta.url)}.`;
        push(text, html);
      } else {
        push(meta.url, linkHtml(meta.url));
      }
    }
    return buildCitationResult(textParts, htmlParts, fallbackText, fallbackHtml);
  }

  if (guideline === 'mla9') {
    const authorSegment = formatAuthorsMLA(authors);
    if (authorSegment) push(`${authorSegment}.`);
    push(
      `"${fallbackTitle}."`,
      fallbackTitle ? `&ldquo;${escapeHtml(fallbackTitle)}.&rdquo;` : undefined,
    );
    if (meta.site) {
      push(`${meta.site},`, `<i>${escapeHtml(meta.site)}</i>,`);
    }
    if (meta.publisher) push(`${meta.publisher},`);
    if (published) push(`${published},`);
    if (meta.url) push(`${meta.url}.`, `${linkHtml(meta.url)}.`);
    if (accessed) push(`Accessed ${accessed}.`, `Accessed ${escapeHtml(accessed)}.`);
    return buildCitationResult(textParts, htmlParts, fallbackText, fallbackHtml);
  }

  if (guideline === 'ieee') {
    const authorSegment = formatAuthorsIEEE(authors);
    if (authorSegment) push(`${authorSegment},`);
    push(
      `"${fallbackTitle},"`,
      fallbackTitle ? `&ldquo;${escapeHtml(fallbackTitle)},&rdquo;` : undefined,
    );
    if (meta.site) push(`${meta.site},`, `<i>${escapeHtml(meta.site)}</i>,`);
    if (published) push(`${published}.`);
    push('[Online].');
    if (meta.url) push(`Available: ${meta.url}.`, `Available: ${linkHtml(meta.url)}.`);
    if (accessed) push(`Accessed: ${accessed}.`, `Accessed: ${escapeHtml(accessed)}.`);
    return buildCitationResult(textParts, htmlParts, fallbackText, fallbackHtml);
  }

  const authorSegment = formatAuthorsChicago(authors);
  if (authorSegment) push(`${authorSegment},`);
  push(
    `"${fallbackTitle},"`,
    fallbackTitle ? `&ldquo;${escapeHtml(fallbackTitle)},&rdquo;` : undefined,
  );
  if (meta.site) {
    push(`${meta.site},`, `<i>${escapeHtml(meta.site)}</i>,`);
  }
  if (published) push(`${published}.`);
  if (meta.publisher) push(`${meta.publisher},`);
  if (meta.url) {
    const urlSegment = `${meta.url}`;
    push(urlSegment, linkHtml(meta.url));
  }
  if (accessed) push(`Accessed ${accessed}.`, `Accessed ${escapeHtml(accessed)}.`);
  return buildCitationResult(textParts, htmlParts, fallbackText, fallbackHtml);
};

const guidelineLabel = (value: string) =>
  guidelineOptions.find((option) => option.value === value)?.label || value;

const SimpleCite: Component = () => {
  const [engine, setEngine] = createSignal<CiteEngine>('simplecite');
  const [guideline, setGuideline] = createSignal<Guideline>('apa7');
  const [url, setUrl] = createSignal('');
  const [meta, setMeta] = createSignal<Metadata>({ ...emptyMeta, source: 'simplecite' });
  const [status, setStatus] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [loadingStage, setLoadingStage] = createSignal<LoadingStage>('idle');
  const [citations, setCitations] = createSignal<Citation[]>([]);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [metaSource, setMetaSource] = createSignal<MetadataSource>('simplecite');
  const [editingCitationId, setEditingCitationId] = createSignal<number | null>(null);
  const [aiRedoLoadingId, setAiRedoLoadingId] = createSignal<number | null>(null);

  const closeModal = () => {
    setModalOpen(false);
    setEditingCitationId(null);
  };

  const loadingLabel = () => {
    if (!loading()) return 'Fetch metadata';
    const stage = loadingStage();
    if (stage === 'metadata') return 'Getting metadata…';
    if (stage === 'metadataProxy') return 'Retrying via worker…';
    if (stage === 'ai') return 'Oops! Metadata unavailable—asking AI…';
    return 'Working…';
  };

  const loadingIcon = () => {
    if (!loading()) return 'travel_explore';
    return loadingStage() === 'ai' ? 'auto_fix_high' : 'hourglass_empty';
  };

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
    setMetaSource(next === 'manual' ? 'manual' : 'simplecite');
    setStatus('');
  };

  const startNewCitation = () => {
    setMeta({ ...emptyMeta, source: 'simplecite' });
    setUrl('');
    setGuideline('apa7');
    setEngine('simplecite');
    setMetaSource('simplecite');
    setEditingCitationId(null);
    setStatus('');
    setModalOpen(true);
  };

  const copyCitationPayload = async (payload: CitationResult | string) => {
    const text = typeof payload === 'string' ? payload : payload.text;
    const html = typeof payload === 'string' ? '' : payload.html;
    if (!text) return;
    try {
      if (typeof ClipboardItem !== 'undefined' && html && navigator.clipboard?.write) {
        const item = new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard?.writeText(text);
      }
      setStatus('Copied citation to clipboard.');
    } catch {
      setStatus('Clipboard permissions blocked—select the text manually.');
    }
  };

  const parseCitationMeta = (payload?: string): (Metadata & { source?: MetadataSource }) | null => {
    if (!payload) return null;
    try {
      return JSON.parse(payload) as Metadata & { source?: MetadataSource };
    } catch {
      return null;
    }
  };

  const decodeGuideline = (value: string): Guideline => {
    const match = guidelineOptions.find((option) => option.value === value);
    return (match?.value as Guideline) || 'apa7';
  };

  const citationSupportsAiRedo = (citation: Citation) => {
    const metaPayload = parseCitationMeta(citation.meta);
    if (!metaPayload?.url) return false;
    const source = metaPayload.source || 'simplecite';
    return source !== 'manual';
  };

  const openCitationForEdit = (citation: Citation) => {
    const metaPayload = parseCitationMeta(citation.meta);
    if (metaPayload) {
      const inferredSource = metaPayload.source || (metaPayload.url ? 'simplecite' : 'manual');
      setMeta({ ...emptyMeta, ...metaPayload, source: inferredSource });
      setUrl(metaPayload.url || '');
      setMetaSource(inferredSource);
      setEngine(inferredSource === 'manual' ? 'manual' : 'simplecite');
    } else {
      setMeta({ ...emptyMeta, source: 'manual' });
      setUrl('');
      setMetaSource('manual');
      setEngine('manual');
    }
    setGuideline(decodeGuideline(citation.style));
    setEditingCitationId(citation.id ?? null);
    setStatus('Loaded citation into the builder. Make edits and hit Save.');
    setModalOpen(true);
  };

  const handleRedoWithAi = async (citation: Citation) => {
    const metaPayload = parseCitationMeta(citation.meta);
    if (!metaPayload?.url || !citation.id) {
      setStatus('Need a saved URL to redo this citation with AI.');
      return;
    }
    setAiRedoLoadingId(citation.id);
    setStatus('Forcing SimpleCite AI to refresh metadata…');
    try {
      let metaResult: Partial<Metadata> | null = { ...metaPayload };
      const adoptMetadata = (candidate: Partial<Metadata> | null) => {
        metaResult = mergeMetadataValues(metaResult, candidate);
      };

      const aiResult = await fetchMetadataViaAi(
        metaPayload.url,
        (message) => setStatus(message),
        { requireAuthor: true },
      );
      adoptMetadata(aiResult.meta);

      if (!metadataIsSufficient(metaResult, { requireAuthor: true })) {
        setStatus(aiResult.error || 'SimpleCite AI could not refresh this citation.');
        return;
      }

      const finalized = mergeMetadataWithDefaults(metaResult || {}, metaPayload.url);
      const enhancedMeta: Metadata = { ...finalized, source: 'simplecite-ai' };
      const refreshedCitation = formatCitation(enhancedMeta, decodeGuideline(citation.style));
      await db.citations.update(citation.id, {
        text: refreshedCitation.text,
        meta: JSON.stringify(enhancedMeta),
        updatedAt: new Date(),
      });
      await loadCitations();
      if (editingCitationId() === citation.id) {
        setMeta(enhancedMeta);
        setMetaSource('simplecite-ai');
      }
      setStatus('Citation refreshed with SimpleCite AI.');
    } catch (error) {
      console.error('SimpleCite AI redo failed', error);
      setStatus('SimpleCite AI ran into a problem. Try again in a bit.');
    } finally {
      setAiRedoLoadingId(null);
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
    setLoadingStage('metadata');
    setStatus('Getting metadata…');
    try {
      let metaResult: Partial<Metadata> | null = null;

      const adoptMetadata = (candidate: Partial<Metadata> | null) => {
        metaResult = mergeMetadataValues(metaResult, candidate);
      };

      const finishIfReady = (
        message: string,
        options?: { requireAuthor?: boolean; source?: MetadataSource },
      ) => {
        const { requireAuthor, source } = options || {};
        if (!metadataIsSufficient(metaResult, { requireAuthor })) return false;
        const merged = mergeMetadataWithDefaults(metaResult || {}, targetUrl);
        const finalMeta: Metadata = { ...merged, source: source || 'simplecite' };
        setMeta(finalMeta);
        setStatus(message);
        setEngine('simplecite');
        setMetaSource(source || 'simplecite');
        return true;
      };

      const directAttempt = await gatherMetadataFromSource(targetUrl);
      adoptMetadata(directAttempt.meta);

      if (
        finishIfReady('Metadata loaded. Double-check the fields before saving.', {
          requireAuthor: true,
          source: 'simplecite',
        })
      ) {
        return;
      }

      setLoadingStage('metadataProxy');
      setStatus(
        directAttempt.meta
          ? 'Metadata looked incomplete—retrying via anything.rhenrywarren.workers.dev…'
          : directAttempt.blocked
              ? 'Metadata blocked by CORS—retrying via anything.rhenrywarren.workers.dev…'
              : 'Metadata looked empty—retrying via anything.rhenrywarren.workers.dev…',
      );

      const proxyAttempt = await gatherMetadataFromSource(targetUrl, true);
      adoptMetadata(proxyAttempt.meta);

      if (
        finishIfReady('Metadata loaded. Double-check the fields before saving.', {
          requireAuthor: true,
          source: 'simplecite',
        })
      ) {
        return;
      }

      setLoadingStage('ai');
      setStatus(
        'Metadata still missing key details—asking AI… Pulling a readable version of the page…',
      );
      const aiResult = await fetchMetadataViaAi(
        targetUrl,
        (message) => setStatus(message),
        { requireAuthor: true },
      );
      adoptMetadata(aiResult.meta);

      if (
        finishIfReady('Metadata loaded via SimpleCite AI. Double-check the fields before saving.', {
          source: 'simplecite-ai',
          requireAuthor: true,
        })
      ) {
        return;
      }

      if (aiResult.error) {
        setStatus(aiResult.error);
      } else {
        setStatus('Could not auto-extract. Try the manual option like on MyBib.');
      }
      const fallbackMeta: Partial<Metadata> = metaResult ?? {};
      setMeta({
        ...emptyMeta,
        ...fallbackMeta,
        url: fallbackMeta.url || targetUrl,
        source: 'manual',
      });
      setMetaSource('manual');
      setEngine('manual');
      return;
    } finally {
      setLoading(false);
      setLoadingStage('idle');
    }
  };

  const citation = () => formatCitation(meta(), guideline());

  const handleSave = async () => {
    const cite = citation();
    if (!cite.text) {
      setStatus('Fill in at least a title or URL before saving.');
      return;
    }
    const payload = JSON.stringify({ ...meta(), source: metaSource() });
    const now = new Date();
    const existingId = editingCitationId();
    if (existingId) {
      await db.citations.update(existingId, {
        style: guideline(),
        text: cite.text,
        meta: payload,
        updatedAt: now,
      });
    } else {
      await db.citations.add({
        style: guideline(),
        text: cite.text,
        meta: payload,
        createdAt: now,
        updatedAt: now,
      });
    }
    await loadCitations();
    closeModal();
    setStatus(existingId ? 'Citation updated and ready to copy.' : 'Citation saved—use Copy whenever you need it.');
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
            Super fast citation generator with AI-powered metadata extraction. If it can't get the metadata it sends it to an LLM to get it for you!
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
                  <div class={styles.listItem} onClick={() => copyCitationPayload(c.text)}>
                    <div class={styles.listInfo}>
                      <div class={styles.listStyle}>{guidelineLabel(c.style)}</div>
                      <div class={styles.listText}>{c.text}</div>
                    </div>
                    <div class={styles.listActions}>
                      <button
                        class={styles.copyButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          copyCitationPayload(c.text);
                        }}
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
                        <span>Copy</span>
                      </button>
                      <button
                        class={styles.iconButton}
                        title="Edit in builder"
                        aria-label="Edit in builder"
                        onClick={(event) => {
                          event.stopPropagation();
                          openCitationForEdit(c);
                        }}
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">edit</span>
                      </button>
                      <Show when={citationSupportsAiRedo(c)}>
                        <button
                          class={styles.iconButton}
                          title="Redo With AI"
                          aria-label="Redo With AI"
                          disabled={aiRedoLoadingId() === (c.id ?? -1)}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRedoWithAi(c);
                          }}
                        >
                          <span class="material-symbols-outlined" aria-hidden="true">{aiRedoLoadingId() === (c.id ?? -1) ? 'progress_activity' : 'wand_stars'}</span>
                        </button>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
            <button class={`${styles.button} ${styles.buttonPrimary}`} onClick={startNewCitation}>
              <span class="material-symbols-outlined" aria-hidden="true">auto_fix_high</span>
              <span>Launch builder</span>
            </button>
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
        <div class={styles.overlay} onClick={closeModal}>
          <div class={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div class={styles.modalHeader}>
              <div>
                <div class={styles.modalTitle}>Create a citation</div>
                <div class={styles.helperText}>Pick your citing engine and guideline.</div>
              </div>
              <button class={styles.closeButton} onClick={closeModal}>
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
                      SimpleCite can fetch metadata for most webpages. Some older websites (or poorly made) may not have this tag, so our LLM fetches it from the page content directly (this takes longer).
                    </div>
                    <div class={styles.actions}>
                      <button
                        class={`${styles.button} ${styles.buttonPrimary}`}
                        disabled={loading()}
                        onClick={runSimpleCite}
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">
                          {loadingIcon()}
                        </span>
                        <span>{loadingLabel()}</span>
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
                  <div
                    class={styles.citationLine}
                    innerHTML={citation().html || 'Start typing to see the cite.'}
                  />
                  <div class={styles.previewActions}>
                    <button
                      class={styles.button}
                      disabled={!citation().text}
                      onClick={() => copyCitationPayload(citation())}
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>
                      <span>Copy preview</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class={styles.modalFooter}>
              <button class={styles.button} onClick={closeModal}>
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



