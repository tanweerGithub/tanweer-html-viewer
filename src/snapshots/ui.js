import {
  listSnapshots,
  createSnapshot,
  renameSnapshot,
  deleteSnapshot,
} from './manager.js';

export function createSnapshotsUi({ getHtml, setHtml }) {
  const toggle = document.getElementById('snapshots-toggle');
  const menu = document.getElementById('snapshots-menu');
  const listEl = document.getElementById('snapshots-list');
  const createBtn = document.getElementById('snapshot-create');

  function closeMenu() {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    render();
  }

  function render() {
    const snapshots = listSnapshots();
    listEl.innerHTML = '';

    if (!snapshots.length) {
      const empty = document.createElement('li');
      empty.className = 'snapshots-empty';
      empty.textContent = 'No snapshots yet';
      listEl.appendChild(empty);
      return;
    }

    for (const snap of snapshots) {
      const li = document.createElement('li');
      li.className = 'snapshots-item';

      const nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'snapshots-item-name';
      nameBtn.textContent = snap.name;
      nameBtn.title = 'Click to restore · double-click to rename';
      nameBtn.addEventListener('click', () => {
        setHtml(snap.html);
        closeMenu();
      });
      nameBtn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        const next = prompt('Rename snapshot', snap.name);
        if (next != null) {
          renameSnapshot(snap.id, next);
          render();
        }
      });

      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'btn-text';
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', () => {
        setHtml(snap.html);
        closeMenu();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-icon-sm';
      deleteBtn.setAttribute('aria-label', 'Delete snapshot');
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', () => {
        deleteSnapshot(snap.id);
        render();
      });

      li.append(nameBtn, restoreBtn, deleteBtn);
      listEl.appendChild(li);
    }
  }

  toggle.addEventListener('click', () => {
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  createBtn.addEventListener('click', () => {
    const html = getHtml();
    const name = prompt('Snapshot name (optional)');
    createSnapshot(html, name || undefined);
    render();
  });

  document.addEventListener('click', (e) => {
    if (!menu.hidden && !e.target.closest('.snapshots-wrap')) {
      closeMenu();
    }
  });

  return {
    ensureOriginal(html) {
      if (!listSnapshots().length) {
        createSnapshot(html, 'Original');
      }
    },
    saveAuto(name, html) {
      createSnapshot(html, name);
    },
    render,
  };
}