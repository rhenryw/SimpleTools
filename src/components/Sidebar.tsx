import { createSignal, onCleanup, Show } from 'solid-js';
import type { Component } from 'solid-js';
import styles from './Sidebar.module.css';

type PageKey = 'home' | 'notebook' | 'html-viewer' | 'suite' | 'text-link' | 'cite';

interface SidebarProps {
  onOpenSettings: () => void;
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
}

export const Sidebar: Component<SidebarProps> = (props) => {
  const [menuOpen, setMenuOpen] = createSignal(false);
  let closeTimer: NodeJS.Timeout | null = null;
  
  const itemClass = (page: PageKey) =>
    `${styles.menuItem} ${props.currentPage === page ? styles.active : ''}`;

  const handleNavigate = (page: PageKey) => {
    props.onNavigate(page);
    setMenuOpen(false);
  };

  const handleSettings = () => {
    props.onOpenSettings();
    setMenuOpen(false);
  };

  const handleMouseEnter = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    setMenuOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimer = setTimeout(() => {
      setMenuOpen(false);
    }, 300);
  };

  onCleanup(() => {
    if (closeTimer) clearTimeout(closeTimer);
  });

  return (
    <>
      <Show when={menuOpen()}>
        <div class={styles.backdrop} onClick={() => setMenuOpen(false)} />
      </Show>
      <div 
        class={styles.container}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div class={styles.cube}>
          <span class="material-symbols-outlined">deployed_code</span>
        </div>
        <div class={`${styles.menu} ${menuOpen() ? styles.menuOpen : ''}`}>
          <button class={itemClass('home')} onClick={() => handleNavigate('home')}>
            Home
          </button>
          <button class={itemClass('notebook')} onClick={() => handleNavigate('notebook')}>
            Notebook
          </button>
          <button class={itemClass('html-viewer')} onClick={() => handleNavigate('html-viewer')}>
            HTML Viewer
          </button>
          <button class={itemClass('text-link')} onClick={() => handleNavigate('text-link')}>
            Text link
          </button>
          <button class={itemClass('cite')} onClick={() => handleNavigate('cite')}>
            SimpleCite
          </button>
          <button class={itemClass('suite')} onClick={() => handleNavigate('suite')}>
            SimpleSuite
          </button>
          <button class={styles.menuItem} onClick={handleSettings}>
            Settings
          </button>
        </div>
      </div>
    </>
  );
};

