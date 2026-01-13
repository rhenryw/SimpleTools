import { createSignal } from 'solid-js';
import { load } from 'js-yaml';

export interface Theme {
  id?: string;
  name: string;
  mainColor: string;
  color2: string;
  backgroundColor: string;
  textColor: string;
  secondTextColor?: string;
  sidebarColor: string;
  accentColor: string;
}

const DEFAULT_THEME = 'matcha';
const CUSTOM_THEMES_KEY = 'simpletools-custom-themes';

const [currentThemeName, setCurrentThemeName] = createSignal(
  localStorage.getItem('simpletools-theme') || DEFAULT_THEME
);

const [themeData, setThemeData] = createSignal<Theme | null>(null);
const [allThemes, setAllThemes] = createSignal<Theme[]>([]);

let availableThemeIds: string[] | null = null;

const loadAvailableThemes = async (): Promise<string[]> => {
  if (availableThemeIds && availableThemeIds.length) return availableThemeIds;
  try {
    const res = await fetch('/themes/themes.txt');
    if (!res.ok) throw new Error('themes.txt not found');
    const txt = await res.text();
    const ids = txt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    availableThemeIds = ids;
    return ids;
  } catch {
    availableThemeIds = ['matcha', 'dark', 'light', 'cream', 'future', 'oceanmist', 'rose', 'sage', 'citrus'];
    return availableThemeIds;
  }
};

const readCustomThemes = (): Theme[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Theme[];
    return (parsed || []).map((t, idx) => ({
      ...t,
      id: t.id || `custom-${idx}`,
    }));
  } catch {
    return [];
  }
};

const writeCustomThemes = (themes: Theme[]) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
};

export const addCustomTheme = (theme: Omit<Theme, 'id'> & { id?: string }) => {
  const existing = readCustomThemes();
  const id = theme.id || `custom-${Date.now()}`;
  const withId: Theme = { ...theme, id };
  writeCustomThemes([...existing, withId]);
  return withId;
};

export const upsertCustomTheme = (theme: Theme) => {
  const existing = readCustomThemes();
  const idx = existing.findIndex((t) => t.id === theme.id);
  let next: Theme[];
  if (idx >= 0) {
    next = [...existing];
    next[idx] = theme;
  } else {
    next = [...existing, theme];
  }
  writeCustomThemes(next);
  return theme;
};

export const deleteCustomTheme = (id: string) => {
  const existing = readCustomThemes();
  const next = existing.filter((t) => t.id !== id);
  writeCustomThemes(next);
  if (currentThemeName() === id) {
    loadTheme(DEFAULT_THEME);
  }
};

export const loadAllThemes = async () => {
  const ids = await loadAvailableThemes();
  const promises = ids.map(async (name): Promise<Theme | null> => {
    try {
      const res = await fetch(`/themes/${name}.yaml`);
      const txt = await res.text();
      const data = load(txt) as Theme;
      return { ...data, id: name };
    } catch(e) { return null; }
  });
  const results = await Promise.all(promises);
  const filtered = results.filter((t) => t !== null) as Theme[];
  const custom = readCustomThemes();
  setAllThemes([...filtered, ...custom]);
};

export const loadTheme = async (themeName: string) => {
  try {
    const response = await fetch(`/themes/${themeName}.yaml`);
    if (!response.ok) throw new Error('Theme not found');
    const text = await response.text();
    const data = load(text) as Theme;
    setThemeData(data);
    applyTheme(data);
    localStorage.setItem('simpletools-theme', themeName);
    setCurrentThemeName(themeName);
  } catch (e) {
    console.error('Failed to load theme', e);
  }
};

export const selectTheme = async (themeId: string) => {
  if (themeId.startsWith('custom-')) {
    const custom = readCustomThemes().find((t) => t.id === themeId);
    if (custom) {
      setThemeData(custom);
      applyTheme(custom);
      localStorage.setItem('simpletools-theme', themeId);
      setCurrentThemeName(themeId);
    }
    return;
  }
  await loadTheme(themeId);
};

export const exportThemeState = () => {
  return {
    selectedId: currentThemeName(),
    customThemes: readCustomThemes(),
  };
};

export const importThemeState = (state: { selectedId: string; customThemes: Theme[] }) => {
  writeCustomThemes(state.customThemes || []);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('simpletools-theme', state.selectedId || DEFAULT_THEME);
  }
};

const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  root.style.setProperty('--main-color', theme.mainColor);
  root.style.setProperty('--color-2', theme.color2);
  root.style.setProperty('--bg-color', theme.backgroundColor);
  root.style.setProperty('--text-color', theme.textColor);
  root.style.setProperty('--text-2-color', theme.secondTextColor || theme.textColor);
  root.style.setProperty('--sidebar-color', theme.sidebarColor);
  root.style.setProperty('--accent-color', theme.accentColor);
  if (typeof document !== 'undefined') {
    const color = theme.mainColor || theme.accentColor || theme.textColor;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
  <path d="M440-183v-274L200-596v274l240 139Zm80 0 240-139v-274L520-457v274Zm-40-343 237-137-237-137-237 137 237 137ZM160-252q-19-11-29.5-29T120-321v-318q0-22 10.5-40t29.5-29l280-161q19-11 40-11t40 11l280 161q19 11 29.5 29t10.5 40v318q0 22-10.5 40T800-252L520-91q-19 11-40 11t-40-11L160-252Zm320-228Z" fill="${color}"/>
</svg>`;
    const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    let link = document.querySelector<HTMLLinkElement>('link#favicon') || document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = href;
  }
};

export const initTheme = () => {
  const saved = currentThemeName();
  if (saved.startsWith('custom-')) {
    const custom = readCustomThemes().find((t) => t.id === saved);
    if (custom) {
      setThemeData(custom);
      applyTheme(custom);
      return;
    }
  }
  loadTheme(saved);
};

export { currentThemeName, themeData, allThemes };

