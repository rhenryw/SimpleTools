import { createSignal, createMemo, onMount } from 'solid-js';
import type { Component } from 'solid-js';
import { db } from '../db';
import type { Drawing } from '../db';
import styles from './SimpleSuite.module.css';

export type SuiteTab = 'text' | 'files' | 'human' | 'draw';

type HumanVocab = Record<string, string[]>;

let humanVocabulary: HumanVocab = {};
let humanStopWords: string[] = [];
let humanFixedTerms: string[] = [];
let humanResourcesLoaded = false;

const humanEscapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const humanIsStopWord = (word: string) => humanStopWords.includes(word.toLowerCase());

const humanIsProperNoun = (word: string) => /^[A-Z][a-z]*$/.test(word);

const humanIsFixedTerm = (word: string) => humanFixedTerms.includes(word.toLowerCase());

const humanReplaceWord = (word: string) => {
  const lower = word.toLowerCase();
  if (humanIsStopWord(lower) || humanIsProperNoun(word) || humanIsFixedTerm(lower)) return word;
  if (['and', 'or', 'but', 'in', 'on', 'at', 'with'].includes(lower)) return word;
  const list = humanVocabulary[lower];
  if (list && list.length) {
    const idx = Math.floor(Math.random() * list.length);
    return list[idx] || word;
  }
  return word;
};

const humanParaphraseText = (text: string) =>
  text
    .split(/(\b|\s+|[.,!?]+)/)
    .map((w) => (/\w+/.test(w) ? humanReplaceWord(w) : w))
    .join('');

const humanBuildDiffHtml = (before: string, after: string, changedClass: string) => {
  const beforeTokens = before.split(/(\s+)/);
  const afterTokens = after.split(/(\s+)/);
  const max = Math.max(beforeTokens.length, afterTokens.length);
  const parts: string[] = [];
  for (let i = 0; i < max; i += 1) {
    const next = afterTokens[i];
    const prev = beforeTokens[i];
    if (!next) continue;
    if (next !== prev && next.trim()) {
      parts.push(`<span class="${changedClass}">${humanEscapeHtml(next)}</span>`);
    } else {
      parts.push(humanEscapeHtml(next));
    }
  }
  return parts.join('');
};

const loadHumanResources = () => {
  if (humanResourcesLoaded) return;
  humanResourcesLoaded = true;
  if (!humanFixedTerms.length) {
    fetch('/fixedterms.json')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) humanFixedTerms = data.map((item) => String(item).toLowerCase());
      })
      .catch(() => {});
  }
  if (!Object.keys(humanVocabulary).length) {
    fetch(
      'https://cdn.jsdelivr.net/gh/rhenryw/AI-Text-Humanizer@main/eng_synonyms.json',
    )
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === 'object') humanVocabulary = data as HumanVocab;
      })
      .catch(() => {});
  }
  if (!humanStopWords.length) {
    fetch('https://cdn.jsdelivr.net/gh/rhenryw/AI-Text-Humanizer@main/stop_words.json')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) humanStopWords = data;
      })
      .catch(() => {});
  }
};

const TextTools: Component = () => {
  const [text, setText] = createSignal('');
  const stats = createMemo(() => {
    const value = text();
    const chars = value.length;
    const words = value.trim() ? value.trim().split(/\s+/).length : 0;
    const lines = value ? value.split('\n').length : 0;
    return { chars, words, lines };
  });

  const transform = (fn: (s: string) => string) => setText(fn(text()));

  const toTitleCase = (s: string) =>
    s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  const removeDuplicates = () => {
    const lines = text().split('\n');
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of lines) {
      if (!seen.has(line)) {
        seen.add(line);
        out.push(line);
      }
    }
    setText(out.join('\n'));
  };

  const sortLines = (direction: 'asc' | 'desc') => {
    const lines = text().split('\n');
    lines.sort();
    if (direction === 'desc') lines.reverse();
    setText(lines.join('\n'));
  };

  const jsonBeautify = () => {
    try {
      const obj = JSON.parse(text());
      setText(JSON.stringify(obj, null, 2));
    } catch {
    }
  };

  const jsonMinify = () => {
    try {
      const obj = JSON.parse(text());
      setText(JSON.stringify(obj));
    } catch {
    }
  };

  const simpleBeautify = () => {
    const value = text();
    const replaced = value
      .replace(/>\s*</g, '>\n<')
      .replace(/(\{|\}|\;)/g, '$1\n')
      .replace(/\n{2,}/g, '\n');
    setText(replaced);
  };

  return (
    <div class={styles.content}>
      <div class={styles.column}>
        <div class={styles.toolbar}>
          <button class={styles.toolButton} onClick={() => transform((s) => s.toUpperCase())}>
            UPPERCASE
          </button>
          <button class={styles.toolButton} onClick={() => transform((s) => s.toLowerCase())}>
            lowercase
          </button>
          <button class={styles.toolButton} onClick={() => transform(toTitleCase)}>
            Title Case
          </button>
          <button class={styles.toolButton} onClick={removeDuplicates}>
            Remove duplicates
          </button>
          <button class={styles.toolButton} onClick={() => sortLines('asc')}>
            Sort A→Z
          </button>
          <button class={styles.toolButton} onClick={() => sortLines('desc')}>
            Sort Z→A
          </button>
          <button class={styles.toolButton} onClick={jsonBeautify}>
            JSON pretty
          </button>
          <button class={styles.toolButton} onClick={jsonMinify}>
            JSON minify
          </button>
          <button class={styles.toolButton} onClick={simpleBeautify}>
            HTML/CSS/JS beautify
          </button>
        </div>
        <textarea
          class={styles.textarea}
          value={text()}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          placeholder="Paste or type text here"
        />
        <div class={styles.stats}>
          {stats().words} words · {stats().chars} characters · {stats().lines} lines
        </div>
      </div>
    </div>
  );
};

const HumanizerPanel: Component = () => {
  const [input, setInput] = createSignal('');
  const [humanizing, setHumanizing] = createSignal(false);
  const [status, setStatus] = createSignal('');
  const [diffHtml, setDiffHtml] = createSignal('');
  const [elapsed, setElapsed] = createSignal(0);
  const charCount = createMemo(() => input().length);
  let panelRef: HTMLDivElement | undefined;

  onMount(() => {
    loadHumanResources();
  });

  const handleHumanize = async () => {
    const value = input().trim();
    if (!value) {
      setStatus('Enter text to humanize');
      return;
    }
    if (value.length > 5000) {
      setStatus('Text exceeds 5000 character limit');
      return;
    }
    let timer: number | undefined;
    try {
      setHumanizing(true);
      setElapsed(0);
      setStatus('Loading… ETA 30 sec');
      const start = Date.now();
      timer = window.setInterval(() => {
        const seconds = (Date.now() - start) / 1000;
        setElapsed(seconds);
      }, 200);
      const localPass = humanParaphraseText(value);
      const prompt = `
Find better synonyms for things, but leave some a little quirky. Thanks! also, just return the text, and remove any em-dashes that could be replaced by commas or another way.

${localPass}
`;
      const encoded = encodeURIComponent(prompt);
      const response = await fetch(`https://text.pollinations.ai/${encoded}?model=openai`, {
        headers: { Accept: 'text/plain' },
      });
      const result = await response.text();
      const trimmed = result.trim();
      setInput(trimmed);
      setDiffHtml(humanBuildDiffHtml(value, trimmed, styles.diffChanged));
      setStatus('Done. Changed parts are highlighted.');
    } catch {
      setStatus('Error processing request');
    } finally {
      setHumanizing(false);
      setElapsed(0);
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
    }
  };

  const handleCopy = async () => {
    const value = input();
    if (!value.trim()) {
      setStatus('Nothing to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copied to clipboard');
    } catch {
      setStatus('Clipboard permissions blocked');
    }
  };

  return (
    <div class={styles.content}>
      <div class={styles.column}>
        
        <div class={styles.toolbar}>
          <button
            class={styles.toolButton}
            type="button"
            disabled={humanizing()}
            onClick={handleHumanize}
          >
            {humanizing() ? `Humanizing (${elapsed().toFixed(1)}s)` : 'Humanize'}
          </button>
          <button
            class={styles.toolButton}
            type="button"
            onClick={handleCopy}
            aria-label="Copy humanized text"
          >
            <span class="material-symbols-outlined">content_copy</span>
          </button>
        </div>
        <div
          class={styles.outputBox}
          contentEditable
          data-placeholder="Paste or type and hit Humanize!"
          ref={panelRef}
          onInput={(e) => setInput((e.target as HTMLDivElement).innerText || '')}
          innerHTML={diffHtml() || humanEscapeHtml(input())}
        />
        <div class={styles.humanizerFooter}>
          <div
            class={`${styles.charCounter} ${
              charCount() > 5000 ? styles.charCounterError : ''
            }`}
          >
            {charCount()}/5000 characters
          </div>
          <div class={styles.statusRow}>{status()}</div>
        </div>
      </div>
    </div>
  );
};

const FilesPanel: Component = () => {
  const [files, setFiles] = createSignal<File[]>([]);
  const [preview, setPreview] = createSignal('');

  const handleFiles = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.files) return;
    const list = Array.from(input.files);
    setFiles(list);
    if (list[0]) loadPreview(list[0]);
  };

  const loadPreview = (file: File) => {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreview(`<img src="${url}" style="max-width:100%;height:auto;" />`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setPreview(`<pre>${text.replace(/[&<]/g, (c) => (c === '&' ? '&amp;' : '&lt;'))}</pre>`);
    };
    reader.readAsText(file);
  };

  return (
    <div class={styles.content}>
      <div class={styles.column}>
        <input
          type="file"
          multiple
          class={styles.fileInput}
          onChange={handleFiles}
        />
        <div class={styles.fileList}>
          {files().map((f) => (
            <div onClick={() => loadPreview(f)}>
              {f.name} ({f.type || 'unknown'}, {f.size} bytes)
            </div>
          ))}
        </div>
      </div>
      <div class={styles.column}>
        <div class={styles.outputBox} innerHTML={preview()} />
      </div>
    </div>
  );
};

const DrawPanel: Component = () => {
  const [color, setColor] = createSignal('#ffffff');
  const [size, setSize] = createSignal(3);
  const [drawings, setDrawings] = createSignal<Drawing[]>([]);
  const [, setCurrentId] = createSignal<number | null>(null);
  let canvasRef: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | null = null;
  let drawing = false;

  const loadDrawings = async () => {
    const all = await db.drawings.orderBy('updatedAt').reverse().toArray();
    setDrawings(all);
  };

  onMount(() => {
    loadDrawings();
    if (canvasRef) {
      ctx = canvasRef.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
      }
    }
  });

  const getPos = (e: MouseEvent) => {
    if (!canvasRef) return { x: 0, y: 0 };
    const rect = canvasRef.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDown = (e: MouseEvent) => {
    if (!ctx) return;
    drawing = true;
    const { x, y } = getPos(e);
    ctx.strokeStyle = color();
    ctx.lineWidth = size();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleMove = (e: MouseEvent) => {
    if (!drawing || !ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleUp = () => {
    drawing = false;
  };

  const clearCanvas = () => {
    if (!ctx || !canvasRef) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
  };

  const saveDrawing = async () => {
    if (!canvasRef) return;
    const name = prompt('Drawing name:') || 'Sketch';
    const dataUrl = canvasRef.toDataURL('image/png');
    const id = await db.drawings.add({
      name,
      dataUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setCurrentId(id as number);
    await loadDrawings();
  };

  const loadDrawing = (drawingItem: Drawing) => {
    const img = new Image();
    img.onload = () => {
      if (!ctx || !canvasRef) return;
      ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);
      ctx.drawImage(img, 0, 0, canvasRef.width, canvasRef.height);
    };
    img.src = drawingItem.dataUrl;
    setCurrentId(drawingItem.id!);
  };

  return (
    <div class={styles.content}>
      <div class={styles.column}>
        <div class={styles.canvasToolbar}>
          <input
            type="color"
            class={styles.colorInput}
            value={color()}
            onInput={(e) => setColor((e.target as HTMLInputElement).value)}
          />
          <input
            type="range"
            min="1"
            max="20"
            value={size()}
            class={styles.rangeInput}
            onInput={(e) => setSize(parseInt((e.target as HTMLInputElement).value, 10) || 1)}
          />
          <button class={styles.toolButton} onClick={clearCanvas}>
            Clear
          </button>
          <button class={styles.toolButton} onClick={saveDrawing}>
            Save
          </button>
        </div>
        <div class={styles.canvasWrapper}>
          <canvas
            ref={canvasRef}
            width={600}
            height={400}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={handleUp}
            onMouseLeave={handleUp}
          />
        </div>
      </div>
      <div class={styles.column}>
        <div class={styles.fileList}>
          {drawings().map((d) => (
            <div onClick={() => loadDrawing(d)}>
              {d.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface SimpleSuiteProps {
  initialTab?: SuiteTab;
  onTabChange?: (tab: SuiteTab) => void;
}

export const SimpleSuite: Component<SimpleSuiteProps> = (props) => {
  const [tab, setTab] = createSignal<SuiteTab>(props.initialTab || 'text');

  const selectTab = (next: SuiteTab) => {
    setTab(next);
    if (props.onTabChange) props.onTabChange(next);
  };

  const renderTab = () => {
    if (tab() === 'files') return <FilesPanel />;
    if (tab() === 'human') return <HumanizerPanel />;
    if (tab() === 'draw') return <DrawPanel />;
    return <TextTools />;
  };

  return (
    <div class={styles.container}>
      <div class={styles.tabs}>
        <button
          class={`${styles.tabButton} ${tab() === 'text' ? styles.tabButtonActive : ''}`}
          onClick={() => selectTab('text')}
        >
          Text tools
        </button>
        <button
          class={`${styles.tabButton} ${tab() === 'files' ? styles.tabButtonActive : ''}`}
          onClick={() => selectTab('files')}
        >
          File preview
        </button>
        <button
          class={`${styles.tabButton} ${tab() === 'human' ? styles.tabButtonActive : ''}`}
          onClick={() => selectTab('human')}
        >
          AI Humanizer
        </button>
        <button
          class={`${styles.tabButton} ${tab() === 'draw' ? styles.tabButtonActive : ''}`}
          onClick={() => selectTab('draw')}
        >
          Drawing
        </button>
      </div>
      {renderTab()}
    </div>
  );
};

export default SimpleSuite;


