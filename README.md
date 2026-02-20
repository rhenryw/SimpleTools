# SimpleTools

**SimpleTools** is a fast, privacy-first, browser-based productivity suite built with SolidJS and Vite.
It provides a collection of lightweight tools designed to run entirely in the browser — no accounts, no tracking, no backend required.

Live site: [https://simpletools.lol](https://simpletools.lol)

---

# Overview

SimpleTools is designed to be:

* ⚡ Extremely fast (Vite + SolidJS)
* 🔒 Privacy-friendly (client-side storage, no accounts)
* 🎨 Customizable (YAML-driven theme system)
* 🧩 Modular (independent tool pages)
* 📦 Deployable as static hosting

Everything runs in the browser using IndexedDB and modern web APIs.

---

# Who It's For

SimpleTools is built for:

* Students who need quick citations and organized notes
* Developers who want a live HTML/CSS/JS preview tool
* Writers who want markdown-based notebooks
* Privacy-conscious users who don’t want cloud logins
* Anyone who wants fast, no-sign-up browser tools

---

# Features

## 📓 Notebook Library

* Markdown support (via `marked`)
* Organized by notebooks and pages
* Auto-save to IndexedDB (Dexie)
* Fully client-side
* Persistent between sessions

## 🌐 HTML Viewer

* Real-time HTML/CSS/JS preview
* Instant rendering
* Safe isolated preview environment
* Useful for prototyping and debugging snippets

## 📚 SimpleCite (AI Citation Generator)

* AI-powered citation generation
* Designed to be fast and minimal
* Generates academic references quickly
* No account required

## 🧰 SimpleSuite

* Text utility suite
* Lightweight transformation tools
* Designed for speed and ease of use

## 🔗 TextLink

* Text encoding / transfer utilities
* Compact sharing mechanisms

## 🎨 YAML Theme Engine

* Drop-in theme files
* Live preview in settings
* Full UI recoloring
* Stored in local storage

Themes live in:

```
public/themes/
```

Example theme format:

```yaml
name: MyTheme
mainColor: "#hex"
color2: "#hex"
backgroundColor: "#hex"
textColor: "#hex"
sidebarColor: "#hex"
accentColor: "#hex"
```

---

# How It Works

## Frontend Framework

* SolidJS for reactive UI
* Vite for ultra-fast bundling
* TypeScript for type safety

## Data Storage

* IndexedDB via Dexie (`src/db.ts`)
* Auto-save system
* No external database

## Theming System

* YAML files parsed using `js-yaml`
* Theme state managed in `src/store/themeStore.ts`
* Applied dynamically to CSS variables

## Service Worker

* `public/sw.js`
* Registered via `src/swClient.ts`
* Enables caching and offline behavior

## Routing

* `@solidjs/router`
* Each tool lives under `src/pages/`

---

# Tech Stack

* SolidJS
* Vite
* TypeScript
* Dexie (IndexedDB wrapper)
* js-yaml
* marked (Markdown parser)
* lucide-solid (icons)
* lz-string (compression)
* jszip (exports / packaging)

---

# Requirements

To run locally you need:

* Node.js 18+
* npm (or compatible package manager)

---

# Installation

Clone the repository:

```bash
git clone https://github.com/your-username/simpletools.git
cd simpletools
```

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

The app will start on:

```
http://localhost:5173
```

---

# Build for Production

```bash
npm run build
```

This will:

* Compile TypeScript
* Generate optimized static files in `dist/`

To preview production build locally:

```bash
npm run preview
```

---

# Deployment

SimpleTools is a fully static app and can be deployed anywhere.

## Option 1: Cloudflare Pages

1. Connect GitHub repository
2. Build command:

   ```
   npm run build
   ```
3. Output directory:

   ```
   dist
   ```
4. Set Node version to 18+

## Option 2: Netlify

* Build command: `npm run build`
* Publish directory: `dist`

## Option 3: Vercel

* Framework preset: Vite
* Output directory: `dist`

## Option 4: Static Hosting

Upload contents of:

```
dist/
```

To any static server (NGINX, Apache, S3, etc.)

---

# Environment & Configuration

The app contains:

```
public/env-ob.json
```

Used for obfuscated environment configuration.

If modifying environment handling, see:

```
src/utils/env.ts
```

---

# Project Structure

```
simpletools/
│
├── public/                  # Static assets
│   ├── themes/              # YAML themes
│   ├── sw.js                # Service worker
│   ├── robots.txt
│   ├── sitemap.xml
│   └── site.webmanifest
│
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── Sidebar.tsx
│   │   └── SettingsModal.tsx
│   │
│   ├── pages/               # Individual tool pages
│   │   ├── Notebook.tsx
│   │   ├── HtmlViewer.tsx
│   │   ├── SimpleCite.tsx
│   │   ├── SimpleSuite.tsx
│   │   └── TextLink.tsx
│   │
│   ├── store/               # State management
│   │   └── themeStore.ts
│   │
│   ├── utils/               # Utilities
│   │   ├── dataTransfer.ts
│   │   └── env.ts
│   │
│   ├── db.ts                # IndexedDB setup
│   ├── swClient.ts          # Service worker registration
│   ├── App.tsx              # Main app layout
│   └── index.tsx            # Entry point
│
├── vite.config.ts
├── package.json
├── tsconfig*.json
├── _headers                 # Cache control rules
└── LICENSE
```

---

# Offline & Caching

* `_headers` defines aggressive static caching.
* Service worker caches static assets.
* IndexedDB ensures notebook persistence offline.

---

# Security & Privacy

* No required login
* No backend database
* All notes stored locally
* No forced tracking
* Analytics (if enabled) are privacy-focused

---

# License

This project is licensed under the **GNU Affero General Public License v3**.

Because this is AGPL:

* If you deploy a modified version publicly,
* You must provide source access to users.

See `LICENSE` for full details.

---

# Contributing

1. Fork the repository
2. Create a new branch
3. Make changes
4. Submit a pull request

Please keep changes minimal, modular, and performance-focused.

---

# Philosophy

SimpleTools is built around:

* Simplicity
* Speed
* Ownership of your data
* Zero friction

No accounts. No nonsense. Just tools.

---

If you'd like, I can also generate:

* A shorter marketing-style README
* A developer-focused README
* A more technical architecture deep dive
* A contribution guideline doc
* A security policy
* A Cloudflare Pages–optimized deployment guide

Just tell me which direction you want.
