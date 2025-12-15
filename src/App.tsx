import { createSignal, onMount, Show, createEffect } from 'solid-js';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { initTheme } from './store/themeStore';
import Notebook from './pages/Notebook';
import HtmlViewer from './pages/HtmlViewer';
import SimpleSuite, { type SuiteTab } from './pages/SimpleSuite';
import TextLink from './pages/TextLink';
import SimpleCite from './pages/SimpleCite';
import styles from './App.module.css';
import {
  applyPendingServiceWorkerUpdate,
  subscribeToServiceWorkerUpdates,
} from './swClient';

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
    <div class={styles.contactRow}>
      <a
        class={styles.discordLink}
        href="https://discord.gg/XygZfmMM86"
        target="_blank"
        rel="noreferrer"
      >
        Discord
      </a>
      <button class={styles.contactLink} type="button" onClick={props.onOpenContact}>
        Contact me
      </button>
    </div>
  </div>
);

type PageKey = 'home' | 'notebook' | 'html-viewer' | 'suite' | 'text-link' | 'cite';

const defaultSuiteTab: SuiteTab = 'text';
const IGNORED_COMMIT_MESSAGE = 'Add Current Version Hash (Not an Update)';
const VERSION_NOTICE_STORAGE_KEY = 'simpletools_version_notice_hidden';

interface GitHubCommit {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
  };
}

const parseRoute = (): { page: PageKey; suiteTab: SuiteTab } => {
  if (typeof window === 'undefined') return { page: 'home', suiteTab: defaultSuiteTab };
  const { pathname, hash } = window.location;
  if (hash && hash.startsWith('#paste=')) {
    return { page: 'text-link', suiteTab: defaultSuiteTab };
  }
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '/home') return { page: 'home', suiteTab: defaultSuiteTab };
  if (clean === '/notebook') return { page: 'notebook', suiteTab: defaultSuiteTab };
  if (clean === '/html-viewer') return { page: 'html-viewer', suiteTab: defaultSuiteTab };
  if (clean === '/text-link') return { page: 'text-link', suiteTab: defaultSuiteTab };
  if (clean === '/cite') return { page: 'cite', suiteTab: defaultSuiteTab };
  if (clean === '/suite') return { page: 'suite', suiteTab: defaultSuiteTab };
  if (clean.startsWith('/suite/')) {
    const [, , sub] = clean.split('/');
    if (sub === 'files') return { page: 'suite', suiteTab: 'files' };
    if (sub === 'humanize') return { page: 'suite', suiteTab: 'human' };
    if (sub === 'draw') return { page: 'suite', suiteTab: 'draw' };
    return { page: 'suite', suiteTab: defaultSuiteTab };
  }
  return { page: 'home', suiteTab: defaultSuiteTab };
};

const pathFor = (page: PageKey, suiteTab: SuiteTab): string => {
  if (page === 'home') return '/';
  if (page === 'notebook') return '/notebook';
  if (page === 'html-viewer') return '/html-viewer';
  if (page === 'text-link') return '/text-link';
  if (page === 'cite') return '/cite';
  if (page === 'suite') {
    if (suiteTab === 'files') return '/suite/files';
    if (suiteTab === 'human') return '/suite/humanize';
    if (suiteTab === 'draw') return '/suite/draw';
    return '/suite/text';
  }
  return '/';
};

function App() {
  initTheme();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [contactOpen, setContactOpen] = createSignal(false);
  const [buildVersion, setBuildVersion] = createSignal('');
  const [buildLink, setBuildLink] = createSignal('');
  const [isCurrentVersion, setIsCurrentVersion] = createSignal(true);
  const [updateReady, setUpdateReady] = createSignal(false);
  const [updateDismissed, setUpdateDismissed] = createSignal(false);
  const [versionNoticeDismissed, setVersionNoticeDismissed] = createSignal(false);
  const [versionNoticeSuppressed, setVersionNoticeSuppressed] = createSignal(false);
  const initial = parseRoute();
  const [currentPage, setCurrentPage] = createSignal<PageKey>(initial.page);
  const [suiteTab, setSuiteTab] = createSignal<SuiteTab>(initial.suiteTab);

  onMount(() => {
    const controller = new AbortController();
    try {
      const stored = window.localStorage.getItem(VERSION_NOTICE_STORAGE_KEY);
      if (stored === '1') {
        setVersionNoticeSuppressed(true);
      }
    } catch {
      // ignore storage access issues
    }
    const handlePopState = () => {
      const route = parseRoute();
      setCurrentPage(route.page);
      setSuiteTab(route.suiteTab);
    };
    window.addEventListener('popstate', handlePopState);
     const unsubscribeUpdates = subscribeToServiceWorkerUpdates(() => {
       setUpdateDismissed(false);
       setUpdateReady(true);
     });
    const loadVersion = async () => {
      let localShortHash = '';
      try {
        const response = await fetch('/commit.txt', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (response.ok) {
          const contents = (await response.text()).trim();
          const match = contents.match(/[0-9a-f]{8,40}/i);
          if (match) {
            const normalized = match[0].toLowerCase();
            localShortHash = normalized.slice(0, 8);
            setBuildVersion(localShortHash);
            setBuildLink(`https://github.com/rhenryw/SimpleTools/commit/${normalized}`);
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Failed to read local commit version', error);
        }
      }

      try {
        const response = await fetch(
          'https://api.github.com/repos/rhenryw/SimpleTools/commits?per_page=10',
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const payload = await response.json();
        const commits: GitHubCommit[] = Array.isArray(payload) ? (payload as GitHubCommit[]) : [];
        const preferred = commits.find((entry) => {
          const message = typeof entry?.commit?.message === 'string'
            ? entry.commit.message.split('\n')[0].trim()
            : '';
          return message !== IGNORED_COMMIT_MESSAGE;
        });
        const latest = preferred ?? commits[0];
        if (!latest?.sha) return;
        const latestShort = latest.sha.slice(0, 8).toLowerCase();
        const htmlUrl = typeof latest.html_url === 'string'
          ? latest.html_url
          : `https://github.com/rhenryw/SimpleTools/commit/${latest.sha}`;
        if (!buildLink()) {
          setBuildLink(htmlUrl);
        }
        if (!buildVersion() && latestShort) {
          setBuildVersion(latestShort);
        }
        if (localShortHash && latestShort) {
          setIsCurrentVersion(latestShort === localShortHash);
        } else {
          setIsCurrentVersion(true);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Failed to verify remote commit version', error);
      }
    };
    loadVersion();
    return () => {
      controller.abort();
      window.removeEventListener('popstate', handlePopState);
       unsubscribeUpdates();
    };
  });

  createEffect(() => {
    if (isCurrentVersion()) {
      setVersionNoticeDismissed(false);
    }
  });

  const navigate = (page: PageKey) => {
    const nextSuiteTab = page === 'suite' ? suiteTab() : suiteTab();
    setCurrentPage(page);
    if (typeof window !== 'undefined') {
      const path = pathFor(page, nextSuiteTab);
      if (window.location.pathname !== path) {
        window.history.pushState({ page, suiteTab: nextSuiteTab }, '', path + window.location.hash);
      }
    }
  };

  const handleSuiteTabChange = (tab: SuiteTab) => {
    setSuiteTab(tab);
    if (typeof window !== 'undefined') {
      const path = pathFor('suite', tab);
      if (window.location.pathname !== path) {
        window.history.pushState({ page: 'suite', suiteTab: tab }, '', path + window.location.hash);
      }
    }
  };

  const renderPage = () => {
    const page = currentPage();
    if (page === 'notebook') return <Notebook />;
    if (page === 'html-viewer') return <HtmlViewer />;
    if (page === 'suite') return <SimpleSuite initialTab={suiteTab()} onTabChange={handleSuiteTabChange} />;
    if (page === 'text-link') return <TextLink />;
    if (page === 'cite') return <SimpleCite />;
    return <Home onOpenContact={() => setContactOpen(true)} />;
  };

  const showUpdateBanner = () => updateReady() && !updateDismissed();

  const showVersionNotice = () =>
    !isCurrentVersion() && !versionNoticeDismissed() && !versionNoticeSuppressed();

  const handleVersionReload = () => {
    window.location.reload();
  };

  const handleVersionOk = () => {
    setVersionNoticeDismissed(true);
  };

  const handleVersionDontShow = () => {
    setVersionNoticeSuppressed(true);
    try {
      window.localStorage.setItem(VERSION_NOTICE_STORAGE_KEY, '1');
    } catch {
      // ignore storage issues
    }
  };

  const handleReloadNow = () => {
    setUpdateReady(false);
    applyPendingServiceWorkerUpdate();
  };

  const handleUpdateLater = () => {
    setUpdateDismissed(true);
  };

  return (
    <>
      <Sidebar
        onOpenSettings={() => setSettingsOpen(true)}
        currentPage={currentPage()}
        onNavigate={navigate}
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
      {currentPage() === 'home' && (
        <div class={`${styles.versionBadge} ${!isCurrentVersion() ? styles.versionBadgeStale : ''}`}>
          {buildLink() ? (
            <a href={buildLink()} target="_blank" rel="noreferrer">
              Ver. {buildVersion() || '...'}
            </a>
          ) : (
            <>Ver. {buildVersion() || '...'}
            </>
          )}
          <Show when={!isCurrentVersion()}>
            <span class={styles.versionWarning}>Update available</span>
          </Show>
        </div>
      )}
      <Show when={showVersionNotice()}>
        <div class={styles.versionNotice} role="alert">
          <div class={styles.versionNoticeText}>
            <strong>Update Available!</strong>
            <span>Please hard reload. If that doesn't work, contact the deployment owner.</span>
          </div>
          <div class={styles.versionNoticeButtons}>
            <button type="button" onClick={handleVersionReload}>
              Reload
            </button>
            <button type="button" onClick={handleVersionOk}>
              OK
            </button>
            <button type="button" onClick={handleVersionDontShow}>
              Don't Show Again
            </button>
          </div>
        </div>
      </Show>
      <Show when={showUpdateBanner()}>
        <div class={styles.updateBanner} role="status" aria-live="polite">
          <div class={styles.updateBannerText}>
            <strong>New version ready</strong>
            <span>Reload to get the latest tools.</span>
          </div>
          <div class={styles.updateBannerButtons}>
            <button type="button" class={styles.updateButtonPrimary} onClick={handleReloadNow}>
              Reload
            </button>
            <button type="button" class={styles.updateButtonGhost} onClick={handleUpdateLater}>
              Later
            </button>
          </div>
        </div>
      </Show>
    </>
  );
}

export default App;
