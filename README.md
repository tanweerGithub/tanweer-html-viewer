# Tanweer HTML Viewer

A minimalist web app for writing HTML, previewing it live, and exporting the result as a PDF.

**Live demo:** [https://tanweergithub.github.io/tanweer-html-viewer/](https://tanweergithub.github.io/tanweer-html-viewer/)

## Features

- **Split-pane layout** — Paste or edit HTML on the left; see a live preview on the right
- **HTML linting** — Real-time validation with HTMLHint (errors and warnings in the gutter)
- **Resizable divider** — Drag the center divider to resize panels; position is saved automatically
- **PDF export** — Download the current preview as a PDF from the preview panel

## Tech Stack

- [Vite](https://vitejs.dev/) — Build tool and dev server
- [CodeMirror 6](https://codemirror.net/) — Code editor with syntax highlighting
- [HTMLHint](https://github.com/htmlhint/HTMLHint) — HTML linting
- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) — PDF generation

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm

### Install

```bash
git clone https://github.com/tanweerGithub/tanweer-html-viewer.git
cd tanweer-html-viewer
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

```bash
npm run build
npm run preview
```

The static output is written to the `dist/` folder.

## Deployment

The app auto-deploys to **GitHub Pages** on every push to `main` via GitHub Actions.

To build locally with the same base path used on GitHub Pages:

```bash
GITHUB_PAGES=true npm run build
```

## Usage

1. Paste or write HTML in the **Code** panel on the left.
2. The **Preview** panel updates automatically as you type.
3. Drag the divider between panels to adjust the layout.
4. Click **Download PDF** on the preview panel to export.

Lint status appears in the code panel header (`No issues`, or error/warning counts).

## Checkpoint

This project includes a git tag for the initial release:

```bash
git checkout checkpoint-v1
```

To branch from that checkpoint:

```bash
git checkout -b my-branch checkpoint-v1
```

## License

Private project — all rights reserved.