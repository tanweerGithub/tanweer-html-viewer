import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { buildElementMap, findElementAtOffset, indexPreviewElements } from './elementMap.js';

const HOVER_MARK = 'cm-thv-hover';
const SELECTED_MARK = 'cm-thv-selected';
const FLASH_MARK = 'cm-thv-flash';

const hoverMark = Decoration.mark({ class: HOVER_MARK });
const selectedMark = Decoration.mark({ class: SELECTED_MARK });
const flashMark = Decoration.mark({ class: FLASH_MARK });

const setInspectHighlight = StateEffect.define();

const elementHighlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setInspectHighlight)) {
        const { from, to, mode } = effect.value ?? {};
        if (from == null || to == null || mode == null) {
          deco = Decoration.none;
        } else {
          const mark = mode === 'selected' ? selectedMark : mode === 'flash' ? flashMark : hoverMark;
          deco = Decoration.set([mark.range(from, to)]);
        }
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function ensurePreviewOverlay(doc) {
  if (!doc || doc.getElementById('thv-inspect-style')) return;

  const style = doc.createElement('style');
  style.id = 'thv-inspect-style';
  style.textContent = `
    #thv-overlay-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483646;
    }
    .thv-overlay-box {
      position: fixed;
      pointer-events: none;
      box-sizing: border-box;
      transition: opacity 0.12s ease;
    }
    .thv-overlay-box.is-hover {
      background: rgba(120, 120, 128, 0.18);
      outline: 1px solid rgba(120, 120, 128, 0.45);
    }
    .thv-overlay-box.is-selected {
      background: rgba(26, 115, 232, 0.16);
      outline: 2px solid rgba(26, 115, 232, 0.85);
    }
    .thv-overlay-box.is-flash {
      animation: thv-overlay-flash 0.85s ease;
    }
    @keyframes thv-overlay-flash {
      0%, 100% { background: rgba(26, 115, 232, 0.16); }
      40% { background: rgba(26, 115, 232, 0.38); }
    }
    [data-thv-idx] { cursor: default; }
    .inspect-active [data-thv-idx] { cursor: pointer; }
  `;
  doc.head.appendChild(style);

  const root = doc.createElement('div');
  root.id = 'thv-overlay-root';
  doc.body.appendChild(root);
}

function getOverlayRoot(doc) {
  ensurePreviewOverlay(doc);
  return doc.getElementById('thv-overlay-root');
}

function positionOverlayBox(box, el, doc) {
  const rect = el.getBoundingClientRect();
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
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
  let previewByPath = new Map();
  let hoverEntry = null;
  let selectedEntry = null;
  let hoverOverlay = null;
  let selectedOverlay = null;
  let flashTimer = null;
  let scrollListener = null;

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

  function highlightCode(entry, mode) {
    const editor = getEditor();
    if (!editor || !entry) {
      editor?.dispatch({ effects: setInspectHighlight.of(null) });
      return;
    }
    editor.dispatch({
      effects: setInspectHighlight.of({ from: entry.start, to: entry.end, mode }),
    });
  }

  function clearOverlays(doc) {
    hoverOverlay?.remove();
    selectedOverlay?.remove();
    hoverOverlay = null;
    selectedOverlay = null;
  }

  function createOverlay(doc, className) {
    const box = doc.createElement('div');
    box.className = `thv-overlay-box ${className}`;
    getOverlayRoot(doc).appendChild(box);
    return box;
  }

  function getPreviewElement(entry) {
    if (!entry) return null;
    return previewByPath.get(entry.pathKey) ?? previewByIdx.get(entry.idx) ?? null;
  }

  function repositionOverlays() {
    const doc = previewFrame.contentDocument;
    if (!doc) return;
    if (hoverOverlay && hoverEntry) {
      const el = getPreviewElement(hoverEntry);
      if (el) positionOverlayBox(hoverOverlay, el, doc);
    }
    if (selectedOverlay && selectedEntry) {
      const el = getPreviewElement(selectedEntry);
      if (el) positionOverlayBox(selectedOverlay, el, doc);
    }
  }

  function scrollPreviewToElement(el, { flash = false } = {}) {
    const doc = previewFrame.contentDocument;
    if (!doc || !el) return;

    const frameWindow = previewFrame.contentWindow;
    const rect = el.getBoundingClientRect();
    const frameHeight = frameWindow.innerHeight;
    const targetTop = frameWindow.scrollY + rect.top - frameHeight / 2 + rect.height / 2;

    frameWindow.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });

    if (flash) {
      selectedOverlay?.classList.remove('is-flash');
      void selectedOverlay?.offsetWidth;
      selectedOverlay?.classList.add('is-flash');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => selectedOverlay?.classList.remove('is-flash'), 900);
    }
  }

  function showPreviewHighlight(entry, mode) {
    const doc = previewFrame.contentDocument;
    if (!doc) return;

    const el = getPreviewElement(entry);
    if (!el) return;

    if (mode === 'hover') {
      if (selectedEntry) return;
      hoverOverlay?.remove();
      hoverOverlay = createOverlay(doc, 'is-hover');
      positionOverlayBox(hoverOverlay, el, doc);
      highlightCode(entry, 'hover');
      return;
    }

    hoverOverlay?.remove();
    hoverOverlay = null;

    selectedOverlay?.remove();
    selectedOverlay = createOverlay(doc, 'is-selected');
    positionOverlayBox(selectedOverlay, el, doc);
    highlightCode(entry, mode === 'flash' ? 'flash' : 'selected');

    if (mode === 'flash' || mode === 'selected') {
      scrollPreviewToElement(el, { flash: mode === 'flash' });
    }
  }

  function clearHover() {
    hoverEntry = null;
    hoverOverlay?.remove();
    hoverOverlay = null;
    if (!selectedEntry) {
      getEditor()?.dispatch({ effects: setInspectHighlight.of(null) });
    } else {
      highlightCode(selectedEntry, 'selected');
    }
  }

  function selectEntry(entry, { flash = false } = {}) {
    selectedEntry = entry ?? null;

    if (!entry) {
      clearOverlays();
      getEditor()?.dispatch({ effects: setInspectHighlight.of(null) });
      updateDrawer(null);
      onSelectionChange?.(null);
      return;
    }

    hoverEntry = null;
    hoverOverlay?.remove();
    hoverOverlay = null;

    showPreviewHighlight(entry, flash ? 'flash' : 'selected');
    updateDrawer(entry);
    onSelectionChange?.(entry);

    if (flash) {
      const editor = getEditor();
      editor?.dispatch({
        selection: { anchor: entry.start, head: entry.end },
        scrollIntoView: true,
      });
      highlightCode(entry, 'flash');
      setTimeout(() => {
        if (selectedEntry?.pathKey === entry.pathKey) {
          highlightCode(entry, 'selected');
        }
      }, 900);
    }
  }

  function applyHover(entry) {
    if (!enabled || selectedEntry) return;
    if (hoverEntry?.pathKey === entry?.pathKey) return;

    hoverEntry = entry ?? null;
    if (!entry) {
      clearHover();
      return;
    }

    showPreviewHighlight(entry, 'hover');
  }

  function rebuildMap(html) {
    entries = buildElementMap(html);
    if (hoverEntry) {
      hoverEntry = entries.find((e) => e.pathKey === hoverEntry.pathKey) ?? null;
    }
    if (selectedEntry) {
      const still = entries.find((e) => e.pathKey === selectedEntry.pathKey);
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
    if (!doc?.documentElement) return;

    ensurePreviewOverlay(doc);
    const maps = indexPreviewElements(doc);
    previewByIdx = maps.byIdx;
    previewByPath = maps.byPath;
    doc.documentElement.classList.toggle('inspect-active', enabled);

    if (scrollListener) {
      previewFrame.contentWindow?.removeEventListener('scroll', scrollListener, true);
    }
    scrollListener = () => repositionOverlays();
    previewFrame.contentWindow?.addEventListener('scroll', scrollListener, true);

    repositionOverlays();
    if (selectedEntry) showPreviewHighlight(selectedEntry, 'selected');
    else if (hoverEntry) showPreviewHighlight(hoverEntry, 'hover');
  }

  function resolveEntryAtOffset(offset) {
    return findElementAtOffset(entries, offset);
  }

  function handleEditorMouseMove(event) {
    if (!enabled || selectedEntry) return;
    const editor = getEditor();
    if (!editor) return;

    const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) {
      clearHover();
      return;
    }

    applyHover(resolveEntryAtOffset(pos));
  }

  function handleEditorMouseLeave() {
    if (!selectedEntry) clearHover();
  }

  function handleEditorClick(event) {
    if (!enabled) return;
    const editor = getEditor();
    if (!editor) return;

    const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return;

    const entry = resolveEntryAtOffset(pos);
    if (entry) selectEntry(entry, { flash: true });
  }

  function bindPreviewEvents() {
    const doc = previewFrame.contentDocument;
    if (!doc) return;

    doc.addEventListener('mousemove', (e) => {
      if (!enabled || selectedEntry) return;
      const el = e.target.closest('[data-thv-path]');
      if (!el) {
        clearHover();
        return;
      }
      const pathKey = el.getAttribute('data-thv-path');
      const entry = entries.find((en) => en.pathKey === pathKey);
      applyHover(entry ?? null);
    });

    doc.addEventListener('mouseleave', () => {
      if (!selectedEntry) clearHover();
    });

    doc.addEventListener('click', (e) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.target.closest('[data-thv-path]');
      if (!el) return;
      const pathKey = el.getAttribute('data-thv-path');
      const entry = entries.find((en) => en.pathKey === pathKey);
      if (entry) selectEntry(entry, { flash: true });
    });
  }

  toggleEl.addEventListener('click', () => {
    enabled = !enabled;
    toggleEl.classList.toggle('is-active', enabled);
    toggleEl.setAttribute('aria-pressed', String(enabled));
    previewFrame.classList.toggle('inspect-active', enabled);

    const doc = previewFrame.contentDocument;
    doc?.documentElement?.classList.toggle('inspect-active', enabled);

    if (!enabled) {
      hoverEntry = null;
      selectEntry(null);
      clearOverlays();
      getEditor()?.dispatch({ effects: setInspectHighlight.of(null) });
      return;
    }

    rebuildMap(getEditor()?.state.doc.toString() ?? '');
    syncPreviewIndex();
    bindPreviewEvents();
  });

  drawerClose.addEventListener('click', () => selectEntry(null));

  drawerSnippet.addEventListener('click', () => {
    if (selectedEntry) selectEntry(selectedEntry, { flash: true });
  });

  function bindEditorEvents() {
    const editor = getEditor();
    if (!editor) return;

    editor.dom.addEventListener('mousemove', handleEditorMouseMove);
    editor.dom.addEventListener('mouseleave', handleEditorMouseLeave);
    editor.dom.addEventListener('click', handleEditorClick);
  }

  return {
    bindEditorEvents,
    extensions: [elementHighlightField],
    rebuildMap,
    onPreviewLoad() {
      syncPreviewIndex();
      bindPreviewEvents();
    },
    onDocChanged(html) {
      rebuildMap(html);
      requestAnimationFrame(() => {
        syncPreviewIndex();
        repositionOverlays();
      });
    },
    getSelectedEntry() {
      return selectedEntry;
    },
    isEnabled() {
      return enabled;
    },
  };
}