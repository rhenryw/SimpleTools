import { createSignal, createEffect, For, onCleanup, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { db } from '../db';
import type { Notebook as NotebookType, Page as PageType } from '../db';
import styles from './Notebook.module.css';

const Notebook: Component = () => {
  const [notebooks, setNotebooks] = createSignal<NotebookType[]>([]);
  const [pages, setPages] = createSignal<PageType[]>([]);
  
  const [selectedNotebookId, setSelectedNotebookId] = createSignal<number | null>(null);
  const [selectedPageId, setSelectedPageId] = createSignal<number | null>(null);
  
  const [content, setContent] = createSignal('');
  const [pageTitle, setPageTitle] = createSignal('');
  
  const [hasChanges, setHasChanges] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  let editorRef: HTMLDivElement | undefined;

  const refreshNotebooks = async () => {
    const nb = await db.notebooks.toArray();
    setNotebooks(nb);
  };
  
  createEffect(() => { refreshNotebooks(); });

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
      }
    } else {
        setContent('');
        setPageTitle('');
    }
  });

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
    if (!editorRef) return;
    let html = editorRef.innerHTML;
    html = html.replace(/<div>(#{1,3})\s+([^<]+)<\/div>/g, (_m, hashes: string, text: string) => {
      const level = Math.min(hashes.length, 3);
      return `<h${level}>${text}</h${level}>`;
    });
    html = html.replace(/\*\*\*([\s\S]+?)\*\*\*/g, (match, content: string) => {
      if (!content || !content.trim()) return match;
      return `<strong><em>${content}</em></strong>`;
    });
    html = html.replace(/\_\_\_([\s\S]+?)\_\_\_/g, (match, content: string) => {
      if (!content || !content.trim()) return match;
      return `<strong><em>${content}</em></strong>`;
    });
    html = html.replace(/(?<!\*)\*\*([^*]+?)\*\*(?!\*)/g, (match, content: string) => {
      if (!content || !content.trim()) return match;
      return `<strong>${content}</strong>`;
    });
    html = html.replace(/(?<!_)__([^_]+?)__(?!_)/g, (match, content: string) => {
      if (!content || !content.trim()) return match;
      return `<strong>${content}</strong>`;
    });
    html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, (match, content: string) => {
      if (!content || !content.trim()) return match;
      return `<em>${content}</em>`;
    });
    html = html.replace(/(?<!_)_([^_]+?)_(?!_)/g, (match, content: string) => {
      if (!content || !content.trim()) return match;
      return `<em>${content}</em>`;
    });
    if (html !== editorRef.innerHTML) {
      editorRef.innerHTML = html;
    }
    setContent(html);
    setHasChanges(true);
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
