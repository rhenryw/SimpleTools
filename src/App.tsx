import { createSignal } from 'solid-js';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { initTheme } from './store/themeStore';
import Notebook from './pages/Notebook';
import HtmlViewer from './pages/HtmlViewer';
import SimpleSuite from './pages/SimpleSuite';
import TextLink from './pages/TextLink';
import SimpleCite from './pages/SimpleCite';
import styles from './App.module.css';

const Home = () => (
  <div class={styles.homeContainer}>
    <h1 class={styles.homeTitle}>
      SimpleTools<span class={styles.homeDotLol}>.lol</span>
    </h1>
    <div class={styles.arrowContainer}>
      <svg class={styles.arrow} viewBox="-5 -10 110 110" xmlns="http://www.w3.org/2000/svg">
        <use href="/arrow.svg#path1" />
      </svg>
      <span class={styles.arrowText}>hover to start</span>
    </div>
  </div>
);

type PageKey = 'home' | 'notebook' | 'html-viewer' | 'suite' | 'text-link' | 'cite';

function App() {
  initTheme();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const initialPage: PageKey =
    typeof window !== 'undefined' && window.location.hash.startsWith('#paste=')
      ? 'text-link'
      : 'home';
  const [currentPage, setCurrentPage] = createSignal<PageKey>(initialPage);

  const renderPage = () => {
    const page = currentPage();
    if (page === 'notebook') return <Notebook />;
    if (page === 'html-viewer') return <HtmlViewer />;
    if (page === 'suite') return <SimpleSuite />;
    if (page === 'text-link') return <TextLink />;
    if (page === 'cite') return <SimpleCite />;
    return <Home />;
  };

  return (
    <>
      <Sidebar
        onOpenSettings={() => setSettingsOpen(true)}
        currentPage={currentPage()}
        onNavigate={setCurrentPage}
      />
      <SettingsModal isOpen={settingsOpen()} onClose={() => setSettingsOpen(false)} />
      <main>
        {renderPage()}
      </main>
    </>
  );
}

export default App;
