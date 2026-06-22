const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function findOpenTagEnd(html, start) {
  let inQuote = null;
  for (let i = start + 1; i < html.length; i++) {
    const ch = html[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === '>') return i + 1;
  }
  return start + 1;
}

function findCloseTag(html, tagName, from) {
  const re = new RegExp(`</${tagName}\\s*>`, 'gi');
  re.lastIndex = from;
  const match = re.exec(html);
  return match ? match.index + match[0].length : from;
}

function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const parts = [tag];
  if (el.id) parts.push(`#${el.id}`);
  if (el.className && typeof el.className === 'string') {
    const cls = el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) parts.push(`.${cls.join('.')}`);
  }
  return parts.join('');
}

function buildBreadcrumb(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node.tagName !== 'HTML') {
    parts.unshift(describeElement(node));
    node = node.parentElement;
  }
  return parts.join(' › ');
}

function findOpenTagInSource(html, el, fromIndex) {
  const tag = el.tagName.toLowerCase();
  let searchFrom = fromIndex;

  if (el.id) {
    const idRe = new RegExp(`<${tag}[^>]*\\sid=["']${el.id}["'][^>]*>`, 'i');
    idRe.lastIndex = searchFrom;
    const match = idRe.exec(html);
    if (match) return match.index;
  }

  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi');
  re.lastIndex = searchFrom;
  const match = re.exec(html);
  return match ? match.index : -1;
}

export function buildElementMap(html) {
  if (!html?.trim()) return [];

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const entries = [];
  let searchFrom = 0;

  function walk(el, path) {
    if (!(el instanceof Element)) return;

    const start = findOpenTagInSource(html, el, searchFrom);
    if (start < 0) return;

    const tag = el.tagName.toLowerCase();
    const openEnd = findOpenTagEnd(html, start);
    const isVoid = VOID_TAGS.has(tag) || html.slice(start, openEnd).endsWith('/>');
    const end = isVoid ? openEnd : findCloseTag(html, tag, openEnd);
    const outerHTML = html.slice(start, end);
    const pathKey = path.join('.');

    entries.push({
      idx: entries.length,
      path,
      pathKey,
      tagName: tag,
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className : '',
      label: describeElement(el),
      breadcrumb: buildBreadcrumb(el),
      start,
      end,
      openEnd,
      outerHTML: outerHTML.length > 600 ? `${outerHTML.slice(0, 600)}…` : outerHTML,
      fullOuterHTML: outerHTML,
    });

    searchFrom = openEnd;
    [...el.children].forEach((child, i) => walk(child, [...path, i]));
  }

  if (doc.documentElement) {
    walk(doc.documentElement, []);
  }

  return entries;
}

export function findElementAtOffset(entries, offset) {
  let match = null;
  for (const entry of entries) {
    if (offset >= entry.start && offset < entry.end) {
      if (!match || entry.start >= match.start) {
        match = entry;
      }
    }
  }
  return match;
}

export function getElementByPath(root, path) {
  let el = root;
  for (const index of path) {
    if (!el?.children?.[index]) return null;
    el = el.children[index];
  }
  return el;
}

export function indexPreviewElements(doc) {
  const byPath = new Map();
  const byIdx = new Map();
  let i = 0;

  function walk(el, path) {
    if (!el || el.nodeType !== 1) return;
    const pathKey = path.join('.');
    el.setAttribute('data-thv-idx', String(i));
    el.setAttribute('data-thv-path', pathKey);
    byPath.set(pathKey, el);
    byIdx.set(i, el);
    i += 1;
    [...el.children].forEach((child, ci) => walk(child, [...path, ci]));
  }

  if (doc.documentElement) {
    walk(doc.documentElement, []);
  }

  return { byPath, byIdx };
}