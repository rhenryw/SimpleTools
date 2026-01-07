import { createSignal, createMemo, onMount } from 'solid-js';
import type { Component } from 'solid-js';
import { Editor } from 'mini-canvas-editor';
import 'mini-canvas-editor/css/editor.css';
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
        <div class={`panel-toolbar ${styles.toolbar}`}>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            onClick={() => transform((s) => s.toUpperCase())}
          >
            UPPERCASE
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            onClick={() => transform((s) => s.toLowerCase())}
          >
            lowercase
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            onClick={() => transform(toTitleCase)}
          >
            Title Case
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            onClick={removeDuplicates}
          >
            Remove duplicates
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            onClick={() => sortLines('asc')}
          >
            Sort A→Z
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            onClick={() => sortLines('desc')}
          >
            Sort Z→A
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            onClick={jsonBeautify}
          >
            JSON pretty
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            onClick={jsonMinify}
          >
            JSON minify
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            onClick={simpleBeautify}
          >
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
Rewrite this text to make it sound more natural and human. Replace awkward or unclear words with better synonyms, but keep about 70% of the words unchanged. Remove em-dashes and replace them with commas or other punctuation. Only change words that don't make sense or contradict the context. Return ONLY the rewritten text with no explanations, reasoning, or commentary. only return the changed text (no markdown) and NOTHING else

TEXT TO REWRITE:
${localPass}

REWRITTEN TEXT:`;
      const encoded = encodeURIComponent(prompt);
      const response = await fetch(`https://text.pollinations.ai/${encoded}?model=openai`, {
        headers: { Accept: 'text/plain' },
      });
      const result = await response.text();
      let trimmed = result.trim();
      
      // Handle JSON response format if API returns structured data
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          // Extract content from various possible fields
          trimmed = parsed.content || parsed.text || parsed.reasoning_content || trimmed;
        }
      } catch {
        // Not JSON, use the raw text
      }
      
      // Remove common reasoning/thinking patterns from response
      trimmed = trimmed.trim();
      
      // Remove thinking/reasoning prefixes
      const thinkingPatterns = [
        /^(Let me|Let's|I'll|I will|I should|We need to|We should|We'll|First,|Here's|Okay,|Alright,|Sure,).*/im,
        /^(To rewrite|Rewriting|The rewritten|Here is the rewritten).*/im,
        /^REWRITTEN TEXT:\s*/i,
        /^TEXT:\s*/i,
      ];
      
      for (const pattern of thinkingPatterns) {
        trimmed = trimmed.replace(pattern, '');
      }
      
      // If response contains reasoning, try to extract just the final paragraph
      // Look for the last substantial block of text after reasoning markers
      const lines = trimmed.split('\n');
      let foundReasoningEnd = false;
      let finalTextStart = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        // Skip lines that look like reasoning
        if (line.match(/^(so |thus |therefore |let's |we |i |this |that means)/)) {
          continue;
        }
        // Look for the start of actual content
        if (!foundReasoningEnd && line.length > 30 && !line.includes('rewrite') && !line.includes('synonym')) {
          foundReasoningEnd = true;
          finalTextStart = i;
        }
      }
      
      // If we found a separation, use text from that point
      if (foundReasoningEnd && finalTextStart > 0) {
        trimmed = lines.slice(finalTextStart).join('\n').trim();
      }
      
      trimmed = trimmed.trim();
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
        
        <div class={`panel-toolbar ${styles.toolbar}`}>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            type="button"
            disabled={humanizing()}
            onClick={handleHumanize}
          >
            {humanizing() ? `Humanizing (${elapsed().toFixed(1)}s)` : 'Humanize'}
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
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
          onInput={(e) => {
            const text = (e.target as HTMLDivElement).innerText || '';
            if (text.length > 5000) {
              setInput(text.slice(0, 5000));
              if (panelRef) {
                panelRef.innerText = text.slice(0, 5000);
              }
            } else {
              setInput(text);
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const paste = e.clipboardData?.getData('text/plain') || '';
            const truncated = paste.slice(0, 5000);
            document.execCommand('insertText', false, truncated);
          }}
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
  const [drawings, setDrawings] = createSignal<Drawing[]>([]);
  const [currentId, setCurrentId] = createSignal<number | null>(null);
  const [drawingName, setDrawingName] = createSignal('');
  const [showDrawings, setShowDrawings] = createSignal(false);
  const [exportOpen, setExportOpen] = createSignal(false);
  const [exportName, setExportName] = createSignal('');
  const [exportFormat, setExportFormat] = createSignal<'png' | 'jpeg'>('png');
  const [exportWidth, setExportWidth] = createSignal('');
  const [exportHeight, setExportHeight] = createSignal('');
  let editorContainerRef: HTMLDivElement | undefined;
  let editorInstance: Editor | null = null;

  const loadDrawings = async () => {
    const all = await db.drawings.orderBy('updatedAt').reverse().toArray();
    setDrawings(all);
  };

  const initEditor = () => {
    if (!editorContainerRef) return;
    editorContainerRef.innerHTML = '';
    const parent = editorContainerRef.parentElement;
    const width = parent?.clientWidth || 600;
    const height = parent?.clientHeight || 400;
    editorInstance = Editor.createBlank(editorContainerRef, width, height, {});
  };

  onMount(() => {
    loadDrawings();
    initEditor();
  });

  const newDrawing = () => {
    setCurrentId(null);
    setDrawingName('');
    initEditor();
    setShowDrawings(false);
  };

  const saveDrawing = async () => {
    if (!editorContainerRef) return;
    const canvas = editorContainerRef.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const existingId = currentId();
    const name = drawingName() || prompt('Drawing name:') || 'Sketch';
    const dataUrl = canvas.toDataURL('image/png');
    setDrawingName(name);
    if (existingId) {
      await db.drawings.update(existingId, { name, dataUrl, updatedAt: new Date() });
    } else {
      const count = await db.drawings.count();
      if (count >= 10) {
        const oldest = await db.drawings.orderBy('updatedAt').first();
        if (oldest?.id) await db.drawings.delete(oldest.id);
      }
      const id = await db.drawings.add({
        name,
        dataUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setCurrentId(id as number);
    }
    await loadDrawings();
  };

  const saveAsDrawing = async () => {
    if (!editorContainerRef) return;
    const canvas = editorContainerRef.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const name = prompt('Save as name:') || drawingName() || 'Sketch';
    const dataUrl = canvas.toDataURL('image/png');
    const count = await db.drawings.count();
    if (count >= 10) {
      const oldest = await db.drawings.orderBy('updatedAt').first();
      if (oldest?.id) await db.drawings.delete(oldest.id);
    }
    const id = await db.drawings.add({
      name,
      dataUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setCurrentId(id as number);
    setDrawingName(name);
    await loadDrawings();
  };

  const exportDrawing = async () => {
    if (!editorInstance) return;
    const staticCanvas = await editorInstance.cloneToStaticCanvas();
    const format = exportFormat();
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const baseName = (exportName().trim() || drawingName().trim() || 'drawing').replace(
      /[\\\/:*?"<>|]+/g,
      '-',
    );
    const baseW = staticCanvas.getWidth();
    const baseH = staticCanvas.getHeight();
    const targetW = parseInt(exportWidth() || `${baseW}`, 10) || baseW;
    const targetH = parseInt(exportHeight() || `${baseH}`, 10) || baseH;
    const out = document.createElement('canvas');
    out.width = targetW;
    out.height = targetH;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
    } else {
      ctx.clearRect(0, 0, targetW, targetH);
    }
    const srcDataUrl = staticCanvas.exportToDataURL('png');
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve();
      };
      img.onerror = () => reject(new Error('Failed to load export image'));
      img.src = srcDataUrl;
    });
    const dataUrl = out.toDataURL(mime);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${baseName}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportOpen(false);
  };

  const loadDrawing = (drawingItem: Drawing) => {
    if (!editorContainerRef) return;
    const canvas = editorContainerRef.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = drawingItem.dataUrl;
    setCurrentId(drawingItem.id!);
    setDrawingName(drawingItem.name);
  };

  const deleteDrawing = async (id: number, e: Event) => {
    e.stopPropagation();
    if (!confirm('Delete this drawing?')) return;
    await db.drawings.delete(id);
    if (currentId() === id) {
      setCurrentId(null);
      setDrawingName('');
      initEditor();
    }
    await loadDrawings();
  };

  return (
    <div class={styles.content}>
      <div class={styles.column}>
        <div class={`panel-toolbar ${styles.toolbar}`}>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            type="button"
            onClick={newDrawing}
            title="New"
          >
            <span class="material-symbols-outlined">add</span>
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            type="button"
            onClick={() => setShowDrawings(!showDrawings())}
            title="Drawings"
          >
            <span class="material-symbols-outlined">folder</span>
            <span class={styles.count}>({drawings().length}/10)</span>
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            type="button"
            onClick={saveDrawing}
            title="Save"
          >
            <span class="material-symbols-outlined">save</span>
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            type="button"
            onClick={saveAsDrawing}
            title="Save As"
          >
            <span class="material-symbols-outlined">save_as</span>
          </button>
          <button
            class={`panel-toolbar-button ${styles.toolButton}`}
            type="button"
            onClick={() => {
              let width = 600;
              let height = 400;
              if (editorContainerRef) {
                const canvas = editorContainerRef.querySelector('canvas') as HTMLCanvasElement | null;
                if (canvas) {
                  width = canvas.width || width;
                  height = canvas.height || height;
                } else {
                  const parent = editorContainerRef.parentElement;
                  if (parent) {
                    width = parent.clientWidth || width;
                    height = parent.clientHeight || height;
                  }
                }
              }
              setExportName(drawingName() || 'drawing');
              setExportFormat('png');
              setExportWidth(`${width}`);
              setExportHeight(`${height}`);
              setExportOpen(true);
            }}
            title="Export"
          >
            <span class="material-symbols-outlined">download</span>
          </button>
          <span class={styles.toolbarPowered}>
            Powered by{' '}
            <a
              href="https://github.com/nocode-js/mini-canvas-editor"
              target="_blank"
              rel="noreferrer"
            >
              mini-canvas-editor
            </a>
          </span>
        </div>
        {showDrawings() && (
          <div class={styles.projectsList}>
            <div class={styles.projectsHeader}>
              <h3>Drawings ({drawings().length}/10)</h3>
              <button type="button" onClick={() => setShowDrawings(false)}>✕</button>
            </div>
            {drawings().map((d) => (
              <div
                class={`${styles.projectItem} ${currentId() === d.id ? styles.active : ''}`}
                onClick={() => loadDrawing(d)}
              >
                <span class={styles.projectItemName}>{d.name}</span>
                <button
                  type="button"
                  class={styles.projectDeleteButton}
                  onClick={(e) => deleteDrawing(d.id!, e)}
                  title="Delete"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
        <div class={styles.canvasWrapper}>
          <div ref={editorContainerRef} />
        </div>
      </div>
      {exportOpen() && (
        <div class={styles.exportOverlay} onClick={() => setExportOpen(false)}>
          <div class={styles.exportModal} onClick={(e) => e.stopPropagation()}>
            <h3>Export drawing</h3>
            <div class={styles.exportRow}>
              <label>
                <span>File name</span>
                <input
                  class={styles.smallInput}
                  value={exportName()}
                  onInput={(e) => setExportName((e.target as HTMLInputElement).value)}
                />
              </label>
            </div>
            <div class={styles.exportGrid}>
              <label>
                <span>Format</span>
                <select
                  class={styles.select}
                  value={exportFormat()}
                  onInput={(e) =>
                    setExportFormat(
                      ((e.target as HTMLSelectElement).value as 'png' | 'jpeg') || 'png',
                    )
                  }
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                </select>
              </label>
              <label>
                <span>Width</span>
                <input
                  type="number"
                  class={styles.smallInput}
                  value={exportWidth()}
                  onInput={(e) => setExportWidth((e.target as HTMLInputElement).value)}
                />
              </label>
              <label>
                <span>Height</span>
                <input
                  type="number"
                  class={styles.smallInput}
                  value={exportHeight()}
                  onInput={(e) => setExportHeight((e.target as HTMLInputElement).value)}
                />
              </label>
            </div>
            <div class={styles.exportButtons}>
              <button
                type="button"
                class={styles.dataButton}
                onClick={() => setExportOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                class={styles.dataButton}
                onClick={exportDrawing}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
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
      <div class={`panel-tabs ${styles.tabs}`}>
        <button
          class={`panel-tab ${styles.tabButton} ${
            tab() === 'text' ? `panel-tabActive ${styles.tabButtonActive}` : ''
          }`}
          onClick={() => selectTab('text')}
        >
          Text tools
        </button>
        <button
          class={`panel-tab ${styles.tabButton} ${
            tab() === 'files' ? `panel-tabActive ${styles.tabButtonActive}` : ''
          }`}
          onClick={() => selectTab('files')}
        >
          File preview
        </button>
        <button
          class={`panel-tab ${styles.tabButton} ${
            tab() === 'human' ? `panel-tabActive ${styles.tabButtonActive}` : ''
          }`}
          onClick={() => selectTab('human')}
        >
          AI Humanizer
        </button>
        <button
          class={`panel-tab ${styles.tabButton} ${
            tab() === 'draw' ? `panel-tabActive ${styles.tabButtonActive}` : ''
          }`}
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


