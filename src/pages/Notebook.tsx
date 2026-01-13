import { createSignal, createEffect, For, onCleanup, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { marked } from 'marked';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Link as LinkIcon,
} from 'lucide-solid';
import { db } from '../db';
import type { Notebook as NotebookType, Page as PageType } from '../db';
import styles from './Notebook.module.css';

const IconMarkdown = () => <span class={styles.iconMd}>MD</span>;

const Notebook: Component = () => {
  const [notebooks, setNotebooks] = createSignal<NotebookType[]>([]);
  const [pages, setPages] = createSignal<PageType[]>([]);
  
  const [selectedNotebookId, setSelectedNotebookId] = createSignal<number | null>(null);
  const [selectedPageId, setSelectedPageId] = createSignal<number | null>(null);
  
  const [content, setContent] = createSignal('');
  const [pageTitle, setPageTitle] = createSignal('');
  
  const [hasChanges, setHasChanges] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [markdownMode, setMarkdownMode] = createSignal(false);
  let editorRef: HTMLDivElement | undefined;
  let savedRange: Range | null = null;

  marked.setOptions({ breaks: true, gfm: true });

  const refreshNotebooks = async () => {
    const nb = await db.notebooks.toArray();
    setNotebooks(nb);
  };
  
  createEffect(() => { refreshNotebooks(); });

  const handleSelectionChange = () => {
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return;
    const anchor = sel.anchorNode;
    if (anchor && editorRef && editorRef.contains(anchor)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  };

  document.addEventListener('selectionchange', handleSelectionChange);
  onCleanup(() => document.removeEventListener('selectionchange', handleSelectionChange));

  createEffect(async () => {
    const nid = selectedNotebookId();
    if (nid) {
      const p = await db.pages.where('notebookId').equals(nid).sortBy('createdAt');
      setPages(p);
    } else {
      setPages([]);
    }
  });

  createEffect(async () => {
    const pid = selectedPageId();
    if (pid) {
      const page = await db.pages.get(pid);
      if (page) {
        setContent(page.content || '');
        if (editorRef) {
          editorRef.innerHTML = page.content || '';
        }
        setPageTitle(page.title);
        setHasChanges(false);

        const looksLikeMarkdown = !!page.content && !/<[a-z][\s\S]*>/i.test(page.content) && /[#*_`-]/.test(page.content);
        if (looksLikeMarkdown) {
          setMarkdownMode(true);
          if (editorRef) {
            editorRef.innerText = page.content;
            renderMarkdownFromText(false);
          }
        } else {
          setMarkdownMode(false);
        }
      }
    } else {
        setContent('');
        setPageTitle('');
        setMarkdownMode(false);
    }
  });

  const syncContentFromEditor = () => {
    if (!editorRef) return;
    const html = editorRef.innerHTML;
    setContent(html);
    setHasChanges(true);
  };

  const restoreSelection = () => {
    if (!savedRange) return;
    const sel = document.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedRange);
  };

  const saveCurrentPage = async () => {
    const pid = selectedPageId();
    if (pid && hasChanges()) {
      const htmlContent = editorRef ? editorRef.innerHTML : content();
      setIsSaving(true);
      await db.pages.update(pid, {
        content: htmlContent,
        title: pageTitle(),
        updatedAt: new Date()
      });
      setContent(htmlContent);
      setHasChanges(false);
      setIsSaving(false);
      
      const nid = selectedNotebookId();
      if (nid) {
        const p = await db.pages.where('notebookId').equals(nid).sortBy('createdAt');
        setPages(p);
      }
    }
  };

  const timer = setInterval(() => {
    if (hasChanges()) saveCurrentPage();
  }, 2000);
  
  onCleanup(() => clearInterval(timer));

  const handleEditorInput = () => {
    if (markdownMode()) {
      renderMarkdownFromText();
    } else {
      syncContentFromEditor();
    }
  };

  const applyCommand = (command: string, value?: string) => {
    if (!editorRef) return;
    editorRef.focus();
    restoreSelection();
    document.execCommand(command, false, value);
    syncContentFromEditor();
  };

  const insertBlock = (tag: string, placeholder: string) => {
    if (!editorRef) return;
    editorRef.focus();
    restoreSelection();
    const selection = window.getSelection();
    const selectedText = selection && selection.toString();
    const html = selectedText
      ? `<${tag}>${selectedText}</${tag}>`
      : `<${tag}>${placeholder}</${tag}>`;
    document.execCommand('insertHTML', false, html);
    syncContentFromEditor();
  };

  const handleToolbarMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    restoreSelection();
  };

  const handleLink = () => {
    const url = prompt('Link URL');
    if (!url) return;
    const sel = document.getSelection();
    const hasSelection = sel && sel.toString().trim().length > 0;
    if (hasSelection) {
      applyCommand('createLink', url);
      return;
    }
    const html = `<a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>`;
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    syncContentFromEditor();
  };

  const renderMarkdownFromText = (markDirty = true) => {
    if (!editorRef) return;
    const markdown = editorRef.innerText;
    const parsed = marked.parse(markdown);
    if (parsed instanceof Promise) {
      parsed
        .then((value) => {
          if (!editorRef) return;
          editorRef.innerHTML = value;
          setContent(value);
          setHasChanges(markDirty);
        })
        .catch(() => {});
      return;
    }
    editorRef.innerHTML = parsed;
    setContent(parsed);
    setHasChanges(markDirty);
  };

  const toggleMarkdownMode = () => {
    const next = !markdownMode();
    setMarkdownMode(next);
    if (next) {
      renderMarkdownFromText(false);
    }
  };

  const handleTitleChange = (e: any) => {
    setPageTitle(e.target.value);
    setHasChanges(true);
  };

  const createNotebook = async () => {
    const name = prompt("Notebook Name:");
    if (name) {
      const id = await db.notebooks.add({ name, createdAt: new Date(), updatedAt: new Date() });
      await refreshNotebooks();
      setSelectedNotebookId(id as number);
    }
  };

  const deleteNotebook = async (id: number, e: Event) => {
    e.stopPropagation();
    if (confirm("Delete this notebook and all its pages?")) {
      await db.pages.where('notebookId').equals(id).delete();
      await db.notebooks.delete(id);
      if (selectedNotebookId() === id) {
        setSelectedNotebookId(null);
        setSelectedPageId(null);
      }
      await refreshNotebooks();
    }
  };

  const renameNotebook = async (id: number, currentName: string, e: Event) => {
    e.stopPropagation();
    const name = prompt("Rename notebook:", currentName);
    if (name && name !== currentName) {
      await db.notebooks.update(id, { name, updatedAt: new Date() });
      await refreshNotebooks();
    }
  };

  const createPage = async () => {
    const nid = selectedNotebookId();
    if (nid) {
      const currentPages = pages();
      const id = await db.pages.add({
        notebookId: nid,
        title: `Page ${currentPages.length + 1}`,
        content: '',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      const p = await db.pages.where('notebookId').equals(nid).sortBy('createdAt');
      setPages(p);
      setSelectedPageId(id as number);
    }
  };

  const deletePage = async (id: number, e: Event) => {
    e.stopPropagation();
    if (confirm("Delete this page?")) {
      await db.pages.delete(id);
      if (selectedPageId() === id) {
        setSelectedPageId(null);
      }
      const nid = selectedNotebookId();
      if (nid) {
        const p = await db.pages.where('notebookId').equals(nid).sortBy('createdAt');
        setPages(p);
      }
    }
  };

  const getCurrentPageIndex = () => {
    const pid = selectedPageId();
    if (!pid) return -1;
    return pages().findIndex(p => p.id === pid);
  };

  const goToPreviousPage = () => {
    const idx = getCurrentPageIndex();
    if (idx > 0) {
      setSelectedPageId(pages()[idx - 1].id!);
    }
  };

  const goToNextPage = () => {
    const idx = getCurrentPageIndex();
    if (idx >= 0 && idx < pages().length - 1) {
      setSelectedPageId(pages()[idx + 1].id!);
    }
  };

  return (
    <div class={styles.container}>
      <div class={styles.sidebar}>
        <div class={styles.section}>
            <h3>
              Notebooks 
              <button onClick={createNotebook} class={styles.addButton}>+</button>
            </h3>
            <For each={notebooks()}>
            {(nb) => (
                <div 
                    class={`${styles.item} ${selectedNotebookId() === nb.id ? styles.active : ''}`}
                    onClick={() => { setSelectedNotebookId(nb.id!); setSelectedPageId(null); }}
                >
                    <span class={styles.itemName}>{nb.name}</span>
                    <div class={styles.itemActions}>
                      <button 
                        class={styles.iconButton} 
                        onClick={(e) => renameNotebook(nb.id!, nb.name, e)}
                        title="Rename"
                      >✎</button>
                      <button 
                        class={styles.iconButton} 
                        onClick={(e) => deleteNotebook(nb.id!, e)}
                        title="Delete"
                      >×</button>
                    </div>
                </div>
            )}
            </For>
        </div>
        <Show when={selectedNotebookId()}>
            <div class={styles.section}>
                <h3>
                  Pages 
                  <button onClick={createPage} class={styles.addButton}>+</button>
                </h3>
                <For each={pages()}>
                {(p, idx) => (
                    <div 
                        class={`${styles.item} ${selectedPageId() === p.id ? styles.active : ''}`}
                        onClick={() => setSelectedPageId(p.id!)}
                    >
                        <span class={styles.itemName}>{p.title || 'Untitled'}</span>
                        <div class={styles.itemActions}>
                          <span class={styles.pageNumber}>{idx() + 1}</span>
                          <button 
                            class={styles.iconButton} 
                            onClick={(e) => deletePage(p.id!, e)}
                            title="Delete"
                          >×</button>
                        </div>
                    </div>
                )}
                </For>
            </div>
        </Show>
      </div>
      
      <div class={styles.main}>
        <Show when={selectedPageId()} fallback={
          <div class={styles.emptyState}>
            <h2>Welcome to Notebook</h2>
            <p>Create a notebook to get started</p>
          </div>
        }>
            <div class={styles.editorHeader}>
                <div class={styles.navigation}>
                  <button 
                    class={styles.navButton} 
                    onClick={goToPreviousPage}
                    disabled={getCurrentPageIndex() <= 0}
                  >←</button>
                  <span class={styles.pageIndicator}>
                    Page {getCurrentPageIndex() + 1} of {pages().length}
                  </span>
                  <button 
                    class={styles.navButton} 
                    onClick={goToNextPage}
                    disabled={getCurrentPageIndex() >= pages().length - 1}
                  >→</button>
                </div>
                <input 
                    class={styles.titleInput} 
                    value={pageTitle()} 
                    onInput={handleTitleChange} 
                    placeholder="Page Title"
                />
                <span class={styles.status}>{isSaving() ? 'Saving...' : hasChanges() ? 'Unsaved' : 'Saved'}</span>
            </div>
            <div class={`panel-toolbar ${styles.toolbar}`}>
              <div class={styles.toolbarGroup}>
                <button class="panel-toolbar-button" title="Bold" aria-label="Bold" onMouseDown={handleToolbarMouseDown} onClick={() => applyCommand('bold')}><Bold class={styles.icon} size={18} stroke-width={2} /></button>
                <button class="panel-toolbar-button" title="Italic" aria-label="Italic" onMouseDown={handleToolbarMouseDown} onClick={() => applyCommand('italic')}><Italic class={styles.icon} size={18} stroke-width={2} /></button>
                <button class="panel-toolbar-button" title="Underline" aria-label="Underline" onMouseDown={handleToolbarMouseDown} onClick={() => applyCommand('underline')}><Underline class={styles.icon} size={18} stroke-width={2} /></button>
                <button class="panel-toolbar-button" title="Bulleted list" aria-label="Bulleted list" onMouseDown={handleToolbarMouseDown} onClick={() => applyCommand('insertUnorderedList')}><List class={styles.icon} size={18} stroke-width={2} /></button>
                <button class="panel-toolbar-button" title="Numbered list" aria-label="Numbered list" onMouseDown={handleToolbarMouseDown} onClick={() => applyCommand('insertOrderedList')}><ListOrdered class={styles.icon} size={18} stroke-width={2} /></button>
              </div>
              <div class={styles.toolbarGroup}>
                <button class="panel-toolbar-button" title="Heading 1" aria-label="Heading 1" onMouseDown={handleToolbarMouseDown} onClick={() => insertBlock('h1', 'Heading 1')}><Heading1 class={styles.icon} size={18} stroke-width={2} /></button>
                <button class="panel-toolbar-button" title="Heading 2" aria-label="Heading 2" onMouseDown={handleToolbarMouseDown} onClick={() => insertBlock('h2', 'Heading 2')}><Heading2 class={styles.icon} size={18} stroke-width={2} /></button>
                <button class="panel-toolbar-button" title="Heading 3" aria-label="Heading 3" onMouseDown={handleToolbarMouseDown} onClick={() => insertBlock('h3', 'Heading 3')}><Heading3 class={styles.icon} size={18} stroke-width={2} /></button>
                <button class="panel-toolbar-button" title="Quote" aria-label="Quote" onMouseDown={handleToolbarMouseDown} onClick={() => insertBlock('blockquote', 'Quote')}><Quote class={styles.icon} size={18} stroke-width={2} /></button>
                <button class="panel-toolbar-button" title="Code block" aria-label="Code block" onMouseDown={handleToolbarMouseDown} onClick={() => insertBlock('pre', 'Code block')}><Code class={styles.icon} size={18} stroke-width={2} /></button>
              </div>
              <div class={styles.toolbarGroup}>
                <button class="panel-toolbar-button" title="Link" aria-label="Link" onMouseDown={handleToolbarMouseDown} onClick={handleLink}><LinkIcon class={styles.icon} size={18} stroke-width={2} /></button>
                <button 
                  class={`panel-toolbar-button ${markdownMode() ? styles.toggleActive : ''}`}
                  title="Markdown mode"
                  aria-label="Markdown mode"
                  onMouseDown={handleToolbarMouseDown}
                  onClick={toggleMarkdownMode}
                ><IconMarkdown /></button>
              </div>
            </div>
            <div class={styles.editorContainer}>
                <div
                  class={styles.editor}
                  contentEditable
                  ref={editorRef}
                  onInput={handleEditorInput}
                  data-placeholder="Start writing..."
                />
            </div>
        </Show>
      </div>
    </div>
  );
};

export default Notebook;
