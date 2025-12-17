# SimpleTools

A compact suite of web tools crafted with SolidJS, Vite, and TypeScript.

<sub> This README was just made by gpt until I actually make one. Not a super detailed one either <sub>
## Features
- Notebook: Markdown support, auto-save to IndexedDB, organized by notebooks and pages.
- HTML Previewer: Real-time preview of HTML/CSS/JS.
- Theming: Custom YAML-driven themes with live preview in Settings.
- Lightning-fast AI-powered citation generator: Ultra-quick, faster than Scribr + MyBib

## Setup
1. `npm install`
2. `npm run dev`

## Themes
Themes live in `public/themes/`. Drop in your own YAML file there, following the schema:
```yaml
name: MyTheme
mainColor: "#hex"
color2: "#hex"
backgroundColor: "#hex"
textColor: "#hex"
sidebarColor: "#hex"
accentColor: "#hex"
```
