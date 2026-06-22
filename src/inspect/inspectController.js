import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { buildElementMap, findElementAtOffset, indexPreviewElements } from './elementMap.js';

const highlightMark = Decoration.mark({ class: 'cm-thv-element-highlight' });
const flashMark = Decoration.mark({ class: 'cm-thv-element-flash' });

const setElementHighlight = StateEffect.define();
const flashElementHighlight = StateEffect.define();

const elementHighlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setElementHighlight)) {
        const { from, to } = effect.value ?? {};
        if (from == null || to == null) {
          deco = Decoration.none;
        } else {
          deco = Decoration.set([highlightMark.range(from, to)]);
        }
      }
      if (effect.is(flashElementHighlight)) {
        const { from, to } = effect.value ?? {};
        if (from != null && to != null) {
          deco = Decoration.set([flashMark.range(from, to)]);
          setTimeout(() => {
            // cleared by next highlight update
          }, 900);
        }
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function ensurePreviewStyles(doc) {
  if (!doc || doc.getElementById('thv-inspect-style')) return;
  const style = doc.createElement('style');
  style.id = 'thv-inspect-style';
  style.textContent = `
    [data-thv-idx].thv-hover {
      outline: 1px solid rgba(91, 94, 247, 0.55) !important;
      background-color: rgba(91, 94, 247, 0.1) !important;
      cursor: pointer;
    }
    [data-thv-idx].thv-selected {
      outline: 2px solid rgba(91, 94, 247, 0.85) !important;
      background-color: rgba(91, 94, 247, 0.16) !important;
    }
    [data-thv-idx].thv-flash {
      animation: thv-flash 0.9s ease;
    }
    @keyframes thv-flash {
      0%, 100% { background-color: rgba(91, 94, 247, 0.16) !important; }
      50% { background-color: rgba(91, 94, 247, 0.35) !important; }
    }
  `;
  doc.head.appendChild(style);
}

function clearPreviewMarks(doc) {
  doc?.querySelectorAll('[data-thv-idx]').forEach((el) => {
    el.classList.remove('thv-hover', 'thv-selected', 'thv-flash');
  });
}

export function createInspectController({
  getEditor,
  previewFrame,
  toggleEl,
  drawerEl,
  drawerBreadcrumb,
  drawerSnippet,
  drawerClose,
  onSelectionChange,
}) {
  let enabled = false;
  let entries = [];
  let previewByIdx = new Map();
  let hoverIdx = null;
  let selectedEntry = null;
  let hoverRaf = null;

  function setDrawerVisible(visible) {
    drawerEl.classList.toggle('is-open', visible);
    drawerEl.setAttribute('aria-hidden', String(!visible));
  }

  function updateDrawer(entry) {
    if (!entry) {
      setDrawerVisible(false);
      drawerBreadcrumb.textContent = '';
      drawerSnippet.textContent = '';
      return;
    }
    setDrawerVisible(true);
    drawerBreadcrumb.textContent = entry.breadcrumb;
    drawerSnippet.textContent = entry.outerHTML;
  }

  function highlightCodeRange(from, to, flash = false) {
    const editor = getEditor();
    if (!editor) return;
    editor.dispatch({
      effects: (flash ? flashElementHighlight : setElementHighlight).of({ from, to }),
    });
    if (flash) {
      editor.dispatch({
        selection: { anchor: from, head: to },
        scrollIntoView: true,
      });
      setTimeout(() => {
        if (selectedEntry) {
          highlightCodeRange(selectedEntry.start, selectedEntry.end, false);
        } else {
          getEditor()?.dispatch({ effects: setElementHighlight.of(null) });
        }
      }, 900);
    }
  }

  function highlightPreview(idx, mode) {
    const doc = previewFrame.contentDocument;
    if (!doc) return;
    clearPreviewMarks(doc);
    if (idx == null) return;

    const el = previewByIdx.get(idx);
    if (!el) return;
    if (mode === 'hover') el.classList.add('thv-hover');
    if (mode === 'selected') el.classList.add('thv-selected');
    if (mode === 'flash') {
      el.classList.add('thv-selected', 'thv-flash');
      setTimeout(() => el.classList.remove('thv-flash'), 900);
    }
  }

  function selectEntry(entry, { flash = false, source } = {}) {
    selectedEntry = entry ?? null;
    if (!entry) {
      highlightPreview(null);
      highlightCodeRange(0, 0);
      getEditor()?.dispatch({ effects: setElementHighlight.of(null) });
      updateDrawer(null);
      onSelectionChange?.(null);
      return;
    }

    highlightPreview(entry.idx, flash ? 'flash' : 'selected');
    highlightCodeRange(entry.start, entry.end, flash);
    updateDrawer(entry);
    onSelectionChange?.(entry);
  }

  function rebuildMap(html) {
    entries = buildElementMap(html);
    if (enabled && hoverIdx != null) {
      const still = entries.find((e) => e.idx === hoverIdx);
      if (!still) hoverIdx = null;
    }
    if (selectedEntry) {
      const still = entries.find((e) => e.idx === selectedEntry.idx);
      if (still) {
        selectedEntry = still;
        selectEntry(still);
      } else {
        selectEntry(null);
      }
    }
  }

  function syncPreviewIndex() {
    const doc = previewFrame.contentDocument;
    if (!doc) return;
    ensurePreviewStyles(doc);
    previewByIdx = indexPreviewElements(doc);
    if (selectedEntry) highlightPreview(selectedEntry.idx, 'selected');
    else if (hoverIdx != null) highlightPreview(hoverIdx, 'hover');
  }

  function handleCursorActivity() {
    if (!enabled) return;
    const editor = getEditor();
    if (!editor) return;
    const offset = editor.state.selection.main.head;
    const entry = findElementAtOffset(entries, offset);
    hoverIdx = entry?.idx ?? null;
    if (!selectedEntry) {
      highlightPreview(hoverIdx, 'hover');
      if (entry) highlightCodeRange(entry.start, entry.end);
      else getEditor()?.dispatch({ effects: setElementHighlight.of(null) });
    }
  }

  function onPreviewLoad() {
    syncPreviewIndex();
    const doc = previewFrame.contentDocument;
    if (!doc || !enabled) return;

    doc.addEventListener('mouseover', (e) => {
      if (!enabled) return;
      const el = e.target.closest('[data-thv-idx]');
      if (!el) return;
      const idx = Number(el.getAttribute('data-thv-idx'));
      hoverIdx = idx;
      if (!selectedEntry) {
        highlightPreview(idx, 'hover');
        const entry = entries.find((en) => en.idx === idx);
        if (entry) highlightCodeRange(entry.start, entry.end);
      }
    });

    doc.addEventListener('click', (e) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.target.closest('[data-thv-idx]');
      if (!el) return;
      const idx = Number(el.getAttribute('data-thv-idx'));
      const entry = entries.find((en) => en.idx === idx);
      if (entry) selectEntry(entry, { flash: true, source: 'preview' });
    });
  }

  toggleEl.addEventListener('click', () => {
    enabled = !enabled;
    toggleEl.classList.toggle('is-active', enabled);
    toggleEl.setAttribute('aria-pressed', String(enabled));
    previewFrame.classList.toggle('inspect-active', enabled);

    if (!enabled) {
      hoverIdx = null;
      selectEntry(null);
      clearPreviewMarks(previewFrame.contentDocument);
      getEditor()?.dispatch({ effects: setElementHighlight.of(null) });
      return;
    }

    rebuildMap(getEditor()?.state.doc.toString() ?? '');
    syncPreviewIndex();
    handleCursorActivity();
  });

  drawerClose.addEventListener('click', () => selectEntry(null));

  drawerSnippet.addEventListener('click', () => {
    if (selectedEntry) selectEntry(selectedEntry, { flash: true, source: 'drawer' });
  });

  function bindEditorEvents() {
    const editor = getEditor();
    if (!editor) return;
    editor.dom.addEventListener('click', () => {
      if (!enabled) return;
      const offset = getEditor().state.selection.main.head;
      const entry = findElementAtOffset(entries, offset);
      if (entry) selectEntry(entry, { flash: true, source: 'code' });
    });
  }

  return {
    bindEditorEvents,
    extensions: [elementHighlightField],
    rebuildMap,
    onPreviewLoad,
    onDocChanged(html) {
      rebuildMap(html);
    },
    onCursorActivity() {
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
      hoverRaf = requestAnimationFrame(handleCursorActivity);
    },
    getSelectedEntry() {
      return selectedEntry;
    },
    isEnabled() {
      return enabled;
    },
    selectEntryByIdx(idx) {
      const entry = entries.find((e) => e.idx === idx);
      if (entry) selectEntry(entry, { flash: true });
    },
  };
}