declare global {
  interface Window {
    jscramble?: {
      read: (payload: unknown) => Promise<unknown>;
    };
  }
}

export const POLLINATIONS_TEXT_ENDPOINT = 'https://gen.pollinations.ai/text';

let envCache: Promise<Record<string, unknown>> | null = null;

const loadEnv = async (): Promise<Record<string, unknown>> => {
  if (envCache) return envCache;
  envCache = (async () => {
    const response = await fetch('/env-ob.json');
    if (!response.ok) {
      throw new Error('Failed to load env-ob.json');
    }
    const payload = (await response.json()) as unknown;
    if (!window.jscramble?.read) {
      throw new Error('jscramble is not available');
    }
    const decoded = await window.jscramble.read(payload);
    if (!decoded || typeof decoded !== 'object') {
      throw new Error('Invalid decoded env payload');
    }
    return decoded as Record<string, unknown>;
  })();
  return envCache;
};

export const getPollinationsApiKey = async () => {
  try {
    const env = await loadEnv();
    const apiKey = env.API_KEY;
    return typeof apiKey === 'string' ? apiKey : '';
  } catch (error) {
    console.warn('Failed to load API key', error);
    return '';
  }
};
