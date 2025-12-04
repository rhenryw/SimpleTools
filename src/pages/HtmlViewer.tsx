import { createSignal, For, onMount } from 'solid-js';
import type { Component } from 'solid-js';
import { db } from '../db';
import type { HtmlProject } from '../db';
import styles from './HtmlViewer.module.css';

const HtmlViewer: Component = () => {
  const [code, setCode] = createSignal('');
  const [projects, setProjects] = createSignal<HtmlProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = createSignal<number | null>(null);
  const [projectName, setProjectName] = createSignal('');
  const [showProjects, setShowProjects] = createSignal(false);
  let iframeRef: HTMLIFrameElement | undefined;

  const updatePreview = (content: string) => {
    if (iframeRef) {
      const doc = iframeRef.contentDocument;
      if (doc) {
        doc.open();
        doc.write(content);
        doc.close();
      }
    }
  };

  const loadProjects = async () => {
    const projs = await db.htmlProjects.orderBy('updatedAt').reverse().limit(10).toArray();
    setProjects(projs);
  };

  onMount(() => {
    loadProjects();
  });

  const handleInput = (e: any) => {
    const val = e.target.value;
    setCode(val);
    updatePreview(val);
  };

  const saveProject = async () => {
    const name = projectName() || prompt('Project name:');
    if (!name) return;
    
    const projectsCount = await db.htmlProjects.count();
    if (projectsCount >= 10 && !currentProjectId()) {
      const oldest = await db.htmlProjects.orderBy('updatedAt').first();
      if (oldest?.id) await db.htmlProjects.delete(oldest.id);
    }

    if (currentProjectId()) {
      await db.htmlProjects.update(currentProjectId()!, {
        name,
        code: code(),
        updatedAt: new Date()
      });
    } else {
      const id = await db.htmlProjects.add({
        name,
        code: code(),
        createdAt: new Date(),
        updatedAt: new Date()
      });
      setCurrentProjectId(id as number);
    }
    
    setProjectName(name);
    await loadProjects();
  };

  const saveAsProject = async () => {
    const name = prompt('Save as name:');
    if (!name) return;

    const projectsCount = await db.htmlProjects.count();
    if (projectsCount >= 10) {
      const oldest = await db.htmlProjects.orderBy('updatedAt').first();
      if (oldest?.id) await db.htmlProjects.delete(oldest.id);
    }

    const id = await db.htmlProjects.add({
      name,
      code: code(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    setCurrentProjectId(id as number);
    setProjectName(name);
    await loadProjects();
  };

  const loadProject = (project: HtmlProject) => {
    setCode(project.code);
    setCurrentProjectId(project.id!);
    setProjectName(project.name);
    updatePreview(project.code);
    setShowProjects(false);
  };

  const deleteProject = async (id: number, e: Event) => {
    e.stopPropagation();
    if (confirm('Delete this project?')) {
      await db.htmlProjects.delete(id);
      if (currentProjectId() === id) {
        setCurrentProjectId(null);
        setProjectName('');
        setCode('');
        updatePreview('');
      }
      await loadProjects();
    }
  };

  const newProject = () => {
    setCurrentProjectId(null);
    setProjectName('');
    setCode('');
    updatePreview('');
    setShowProjects(false);
  };

  const openInNewTab = () => {
    const htmlContent = code();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <div class={styles.container}>
      <div class={styles.toolbar}>
        <div class={styles.toolbarLeft}>
          <button class={styles.toolButton} onClick={newProject} title="New">
            <span class="material-symbols-outlined">add</span>
          </button>
          <button 
            class={styles.toolButton} 
            onClick={() => setShowProjects(!showProjects())}
            title="Projects"
          >
            <span class="material-symbols-outlined">folder</span>
            <span class={styles.count}>({projects().length}/10)</span>
          </button>
          <button class={styles.toolButton} onClick={saveProject} title="Save">
            <span class="material-symbols-outlined">save</span>
          </button>
          <button class={styles.toolButton} onClick={saveAsProject} title="Save As">
            <span class="material-symbols-outlined">save_as</span>
          </button>
          <button class={styles.toolButton} onClick={openInNewTab} title="Open in New Tab">
            <span class="material-symbols-outlined">open_in_new</span>
          </button>
        </div>
        <div class={styles.projectName}>
          {projectName() || 'Untitled Project'}
        </div>
      </div>

      {showProjects() && (
        <div class={styles.projectsList}>
          <div class={styles.projectsHeader}>
            <h3>Projects ({projects().length}/10)</h3>
            <button onClick={() => setShowProjects(false)}>✕</button>
          </div>
          <For each={projects()}>
            {(project) => (
              <div 
                class={`${styles.projectItem} ${currentProjectId() === project.id ? styles.active : ''}`}
                onClick={() => loadProject(project)}
              >
                <span class={styles.projectItemName}>{project.name}</span>
                <button 
                  class={styles.deleteButton}
                  onClick={(e) => deleteProject(project.id!, e)}
                >×</button>
              </div>
            )}
          </For>
        </div>
      )}

      <div class={styles.editorContainer}>
        <div class={styles.editor}>
          <div class={styles.header}>HTML / CSS / JS</div>
          <textarea 
            class={styles.textarea} 
            value={code()} 
            onInput={handleInput}
            placeholder="<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 20px; }
  </style>
</head>
<body>
  <h1>Hello World</h1>
  <script>
    console.log('Hello from JavaScript!');
  </script>
</body>
</html>"
          />
        </div>
        <div class={styles.preview}>
          <div class={styles.header}>Preview</div>
          <iframe 
            ref={iframeRef} 
            title="Preview" 
            class={styles.iframe}
          />
        </div>
      </div>
    </div>
  );
};

export default HtmlViewer;
