import { db } from '../db';
import type { Notebook, Page, HtmlProject, Drawing, Citation } from '../db';
import JSZip from 'jszip';

export interface SimpleToolsExport {
  version: number;
  notebooks: Notebook[];
  pages: Page[];
  htmlProjects: HtmlProject[];
  drawings: Drawing[];
  citations: Citation[];
}

const MAGIC = new Uint8Array([83, 84, 66, 49]);

const encryptBytes = async (data: Uint8Array) => {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data as unknown as BufferSource,
  );
  const cipher = new Uint8Array(cipherBuf);
  const out = new Uint8Array(MAGIC.length + keyBytes.length + iv.length + cipher.length);
  out.set(MAGIC, 0);
  out.set(keyBytes, MAGIC.length);
  out.set(iv, MAGIC.length + keyBytes.length);
  out.set(cipher, MAGIC.length + keyBytes.length + iv.length);
  return out;
};

const decryptBytes = async (data: Uint8Array) => {
  if (data.length < MAGIC.length + 32 + 12) return null;
  for (let i = 0; i < MAGIC.length; i++) {
    if (data[i] !== MAGIC[i]) return null;
  }
  const keyBytes = data.slice(MAGIC.length, MAGIC.length + 32);
  const iv = data.slice(MAGIC.length + 32, MAGIC.length + 32 + 12);
  const cipher = data.slice(MAGIC.length + 32 + 12);
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipher as unknown as BufferSource,
    );
    return new Uint8Array(plainBuf);
  } catch {
    return null;
  }
};

export const exportAllData = async () => {
  const [notebooks, pages, htmlProjects, drawings, citations] = await Promise.all([
    db.notebooks.toArray(),
    db.pages.toArray(),
    db.htmlProjects.toArray(),
    db.drawings.toArray(),
    db.citations.toArray()
  ]);
  const payload: SimpleToolsExport = {
    version: 1,
    notebooks,
    pages,
    htmlProjects,
    drawings,
    citations
  };
  const zip = new JSZip();
  zip.file('data.json', JSON.stringify(payload));
  const zipContent = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const encrypted = await encryptBytes(zipContent);
  return encrypted;
};

export const importAllData = async (raw: string | Uint8Array) => {
  let bytes: Uint8Array;
  if (typeof raw === 'string') {
    bytes = new TextEncoder().encode(raw);
  } else {
    bytes = raw;
  }
  const decrypted = await decryptBytes(bytes);
  if (!decrypted) return;
  const zip = await JSZip.loadAsync(decrypted);
  const file = zip.file('data.json');
  if (!file) return;
  const jsonText = await file.async('string');
  let data: SimpleToolsExport | null = null;
  try {
    data = JSON.parse(jsonText) as SimpleToolsExport;
  } catch {
    return;
  }
  if (!data || typeof data !== 'object') return;
  const notebookIdMap = new Map<number, number>();
  for (const nb of data.notebooks || []) {
    const oldId = nb.id;
    const copy = { ...nb };
    delete (copy as any).id;
    const newId = await db.notebooks.add(copy);
    if (typeof oldId === 'number') {
      notebookIdMap.set(oldId, newId as number);
    }
  }
  for (const page of data.pages || []) {
    const copy = { ...page };
    delete (copy as any).id;
    const mapped = typeof page.notebookId === 'number' && notebookIdMap.has(page.notebookId)
      ? notebookIdMap.get(page.notebookId)!
      : page.notebookId;
    await db.pages.add({
      ...copy,
      notebookId: mapped
    });
  }
  for (const proj of data.htmlProjects || []) {
    const copy = { ...proj };
    delete (copy as any).id;
    await db.htmlProjects.add(copy);
  }
  for (const d of data.drawings || []) {
    const copy = { ...d };
    delete (copy as any).id;
    await db.drawings.add(copy);
  }
  for (const c of data.citations || []) {
    const copy = { ...c };
    delete (copy as any).id;
    await db.citations.add(copy);
  }
};

export const clearAllData = async () => {
  await Promise.all([
    db.notebooks.clear(),
    db.pages.clear(),
    db.htmlProjects.clear(),
    db.drawings.clear(),
    db.citations.clear()
  ]);
  localStorage.clear();
};


