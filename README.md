# SimpleTools

A collection of simple web tools built with SolidJS, Vite, and TypeScript.

## Features
- **Notebook**: Markdown supported, auto-save to IndexedDB, organized by notebooks and pages.
- **HTML Viewer**: Real-time preview of HTML/CSS/JS.
- **Theming**: Custom YAML-based themes with live preview in settings.
- **Speedy AI powered citation generator**: Super quick, faster than Scribr + MyBib

## Setup
1. `npm install`
2. `npm run dev`

## Themes
Themes are located in `public/themes/`. You can add your own YAML file there adhering to the schema:
```yaml
name: MyTheme
mainColor: "#hex"
color2: "#hex"
backgroundColor: "#hex"
textColor: "#hex"
sidebarColor: "#hex"
accentColor: "#hex"
```
