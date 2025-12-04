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

interface HomeProps {
  onOpenContact: () => void;
}

const Home = (props: HomeProps) => (
  <div class={styles.homeContainer}>
    <div class={styles.homeLinks}>
      <a
        class={styles.iconLink}
        href="https://github.com/rhenryw/SimpleTools"
        target="_blank"
        rel="noreferrer"
        aria-label="View the GitHub repo"
      >
        <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
          <path
            d="M12 .5a11.5 11.5 0 0 0-3.64 22.42c.58.11.8-.25.8-.56v-2.1c-3.26.71-3.95-1.57-3.95-1.57-.53-1.36-1.29-1.73-1.29-1.73-1.06-.73.08-.72.08-.72 1.17.08 1.78 1.22 1.78 1.22 1.04 1.82 2.74 1.29 3.4.99.11-.76.41-1.29.75-1.59-2.6-.3-5.33-1.31-5.33-5.82 0-1.29.46-2.34 1.22-3.17-.12-.3-.53-1.52.12-3.18 0 0 .99-.32 3.25 1.21a11.2 11.2 0 0 1 5.92 0c2.25-1.53 3.23-1.21 3.23-1.21.66 1.66.25 2.88.12 3.18.76.83 1.22 1.88 1.22 3.17 0 4.52-2.74 5.52-5.36 5.81.42.36.8 1.06.8 2.14v3.17c0 .31.21.67.81.56A11.5 11.5 0 0 0 12 .5Z"
            fill="currentColor"
          />
        </svg>
      </a>
    </div>
    <h1 class={styles.homeTitle}>
      SimpleTools<span class={styles.homeDotLol}>.lol</span>
    </h1>
    <div class={styles.arrowContainer}>
      <svg class={styles.arrow} viewBox="-5 -10 110 110" xmlns="http://www.w3.org/2000/svg">
        <use href="/arrow.svg#path1" />
      </svg>
      <span class={styles.arrowText}>hover to start</span>
    </div>
    <button class={styles.contactLink} type="button" onClick={props.onOpenContact}>
      Contact me
    </button>
  </div>
);

type PageKey = 'home' | 'notebook' | 'html-viewer' | 'suite' | 'text-link' | 'cite';

function App() {
  initTheme();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [contactOpen, setContactOpen] = createSignal(false);
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
    return <Home onOpenContact={() => setContactOpen(true)} />;
  };

  return (
    <>
      <Sidebar
        onOpenSettings={() => setSettingsOpen(true)}
        currentPage={currentPage()}
        onNavigate={setCurrentPage}
      />
      <SettingsModal isOpen={settingsOpen()} onClose={() => setSettingsOpen(false)} />
      {contactOpen() && (
        <div class={styles.contactOverlay} onClick={() => setContactOpen(false)}>
          <div class={styles.contactModal} onClick={(e) => e.stopPropagation()}>
            <h3>Reach out</h3>
            <p class={styles.contactLine}>
              <span>Discord</span>
              <span>r.h.w.</span>
            </p>
            <p class={styles.contactLine}>
              <span>Email</span>
              <a href="mailto:me@rhw.one">me@rhw.one</a>
            </p>
            <button class={styles.contactClose} type="button" onClick={() => setContactOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
      <main>
        {renderPage()}
      </main>
    </>
  );
}

export default App;
