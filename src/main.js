import './style.css';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { HTMLHint } from 'htmlhint';
import html2pdf from 'html2pdf.js';
import { createInspectController } from './inspect/inspectController.js';
import { createSnapshotsUi } from './snapshots/ui.js';
import { createAiPanel } from './ai/panel.js';

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hello World</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
    }
    h1 { font-size: 2.5rem; font-weight: 300; letter-spacing: -0.02em; }
    p { margin-top: 12px; opacity: 0.85; font-size: 1rem; }
  </style>
</head>
<body>
  <div>
    <h1>Hello, World</h1>
    <p>Paste your HTML on the left to see it here.</p>
  </div>
</body>
</html>`;

const HTMLHINT_RULES = {
  'tagname-lowercase': true,
  'attr-lowercase': true,
  'attr-value-double-quotes': true,
  'doctype-first': true,
  'tag-pair': true,
  'spec-char-escape': true,
  'id-unique': true,
  'src-not-empty': true,
  'attr-no-duplication': true,
  'title-require': true,
};

const lintStatusEl = document.getElementById('lint-status');
const previewFrame = document.getElementById('preview-frame');
const previewHint = document.getElementById('preview-hint');
const downloadBtn = document.getElementById('download-pdf');
const workspace = document.getElementById('workspace');
const divider = document.getElementById('divider');
const themeToggle = document.getElementById('theme-toggle');
const THEME_KEY = 'tanweer-html-viewer-theme';
const themeCompartment = new Compartment();
let previewTimer = null;
let editor;
let aiPanel;

const lightEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--surface-raised)',
    color: 'var(--text)',
  },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--accent-soft) !important',
  },
  '.cm-activeLine': { backgroundColor: 'var(--accent-soft)' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-subtle)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--accent-soft)' },
  '.cm-thv-element-highlight': {
    backgroundColor: 'rgba(91, 94, 247, 0.14)',
    borderRadius: '2px',
  },
  '.cm-thv-element-flash': {
    backgroundColor: 'rgba(91, 94, 247, 0.28)',
    borderRadius: '2px',
  },
}, { dark: false });

function isDarkTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  editor.dispatch({
    effects: themeCompartment.reconfigure(dark ? oneDark : lightEditorTheme),
  });
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const dark = saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme(dark);
}

function posToOffset(doc, line, col) {
  try {
    const lineObj = doc.line(line);
    return Math.min(lineObj.from + col - 1, lineObj.to);
  } catch {
    return 0;
  }
}

function htmlLinter(view) {
  const code = view.state.doc.toString();
  const doc = view.state.doc;
  const diagnostics = [];

  if (!code.trim()) {
    updateLintStatus(0, 0);
    return diagnostics;
  }

  const messages = HTMLHint.verify(code, HTMLHINT_RULES);
  let errors = 0;
  let warnings = 0;

  for (const msg of messages) {
    const isError = msg.type === 'error';
    if (isError) errors++;
    else warnings++;

    const from = posToOffset(doc, msg.line, msg.col);
    const lineObj = doc.line(msg.line);
    const to = Math.min(from + 1, lineObj.to);

    diagnostics.push({
      from,
      to,
      severity: isError ? 'error' : 'warning',
      message: msg.message,
      source: 'HTMLHint',
    });
  }

  updateLintStatus(errors, warnings);
  return diagnostics;
}

function updateLintStatus(errors, warnings) {
  lintStatusEl.classList.remove('has-issues', 'has-errors', 'is-clean');

  if (errors > 0) {
    lintStatusEl.textContent = `${errors} error${errors !== 1 ? 's' : ''}${warnings ? `, ${warnings} warning${warnings !== 1 ? 's' : ''}` : ''}`;
    lintStatusEl.classList.add('has-errors');
  } else if (warnings > 0) {
    lintStatusEl.textContent = `${warnings} warning${warnings !== 1 ? 's' : ''}`;
    lintStatusEl.classList.add('has-issues');
  } else {
    lintStatusEl.textContent = 'No issues';
    lintStatusEl.classList.add('is-clean');
  }
}

function updatePreview(code) {
  previewFrame.srcdoc = code;
}

function debouncedPreview(code) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => updatePreview(code), 200);
}

function setEditorContent(code) {
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: code },
  });
  updatePreview(code);
  inspect.rebuildMap(code);
}

const inspect = createInspectController({
  getEditor: () => editor,
  previewFrame,
  toggleEl: document.getElementById('inspect-toggle'),
  drawerEl: document.getElementById('selection-drawer'),
  drawerBreadcrumb: document.getElementById('selection-breadcrumb'),
  drawerSnippet: document.getElementById('selection-snippet'),
  drawerClose: document.getElementById('selection-close'),
  onSelectionChange(entry) {
    aiPanel?.updateScopeHint(!!entry);
    previewHint.hidden = !inspect.isEnabled() || !!entry;
  },
});

editor = new EditorView({
  state: EditorState.create({
    doc: DEFAULT_HTML,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      html(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      linter(htmlLinter, { delay: 300 }),
      lintGutter(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      themeCompartment.of(lightEditorTheme),
      ...inspect.extensions,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const code = update.state.doc.toString();
          debouncedPreview(code);
          inspect.onDocChanged(code);
        }
        if (update.selectionSet) {
          inspect.onCursorActivity();
        }
      }),
    ],
  }),
  parent: document.getElementById('editor'),
});

inspect.bindEditorEvents();

const snapshotsUi = createSnapshotsUi({
  getHtml: () => editor.state.doc.toString(),
  setHtml: setEditorContent,
});

aiPanel = createAiPanel({
  onApply() {
    // Backend wiring in Phase 2
  },
});

updatePreview(DEFAULT_HTML);
inspect.rebuildMap(DEFAULT_HTML);
snapshotsUi.ensureOriginal(DEFAULT_HTML);
initTheme();
aiPanel.updateScopeHint(false);

previewFrame.addEventListener('load', () => {
  inspect.onPreviewLoad();
});

document.getElementById('inspect-toggle').addEventListener('click', () => {
  previewHint.hidden = !inspect.isEnabled();
});

themeToggle.addEventListener('click', () => {
  applyTheme(!isDarkTheme());
});

/* Resizable divider */
const STORAGE_KEY = 'tanweer-html-viewer-split';
function setSplit(percent) {
  const clamped = Math.min(Math.max(percent, 15), 85);
  document.documentElement.style.setProperty('--code-width', `${clamped}%`);
  localStorage.setItem(STORAGE_KEY, String(clamped));
}

function loadSplit() {
  const saved = parseFloat(localStorage.getItem(STORAGE_KEY));
  if (!isNaN(saved)) setSplit(saved);
}

function startResize(clientX) {
  const rect = workspace.getBoundingClientRect();
  divider.classList.add('is-dragging');
  workspace.classList.add('is-resizing');

  function onMove(e) {
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    if (x == null) return;
    const percent = ((x - rect.left) / rect.width) * 100;
    setSplit(percent);
  }

  function onEnd() {
    divider.classList.remove('is-dragging');
    workspace.classList.remove('is-resizing');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchend', onEnd);
}

divider.addEventListener('mousedown', (e) => {
  e.preventDefault();
  startResize(e.clientX);
});

divider.addEventListener('touchstart', (e) => {
  startResize(e.touches[0].clientX);
}, { passive: true });

divider.addEventListener('keydown', (e) => {
  const current = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--code-width')
  ) || 50;
  const step = e.shiftKey ? 10 : 2;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    setSplit(current - step);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    setSplit(current + step);
  }
});

loadSplit();

/* PDF download */
downloadBtn.addEventListener('click', async () => {
  const iframeDoc = previewFrame.contentDocument;
  if (!iframeDoc?.body) return;

  downloadBtn.disabled = true;
  const originalText = downloadBtn.innerHTML;
  downloadBtn.textContent = 'Generating…';

  try {
    const element = iframeDoc.documentElement;
    const clone = element.cloneNode(true);

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = `${previewFrame.offsetWidth}px`;
    container.appendChild(clone);
    document.body.appendChild(container);

    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: 'preview.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      })
      .from(clone)
      .save();

    document.body.removeChild(container);
  } catch (err) {
    console.error('PDF generation failed:', err);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = originalText;
  }
});