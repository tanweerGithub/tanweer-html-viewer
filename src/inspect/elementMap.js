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

function findMatchingOpen(html, tagName, closeStart) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi');
  let depth = 1;
  let pos = closeStart;

  while (pos > 0) {
    const before = html.slice(0, pos);
    const opens = [...before.matchAll(new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi'))];
    const closes = [...before.matchAll(new RegExp(`</${tagName}\\s*>`, 'gi'))];
    depth = opens.length - closes.length;
    if (depth > 0 && opens.length) {
      return opens[opens.length - 1].index;
    }
    pos = before.lastIndexOf('<', pos - 1);
  }
  return 0;
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

export function buildElementMap(html) {
  if (!html?.trim()) return [];

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const entries = [];
  let searchFrom = 0;

  function walk(el) {
    if (!(el instanceof Element)) return;

    const tag = el.tagName.toLowerCase();
    const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi');
    openRe.lastIndex = searchFrom;
    const openMatch = openRe.exec(html);

    if (!openMatch) return;

    const start = openMatch.index;
    const openEnd = findOpenTagEnd(html, start);
    const isVoid = VOID_TAGS.has(tag) || html.slice(start, openEnd).endsWith('/>');
    const end = isVoid ? openEnd : findCloseTag(html, tag, openEnd);

    const outerHTML = html.slice(start, end);
    const idx = entries.length;

    entries.push({
      idx,
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
    for (const child of el.children) walk(child);
  }

  walk(doc.documentElement);
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

export function indexPreviewElements(doc) {
  const byIdx = new Map();
  let i = 0;

  function walk(el) {
    if (!(el instanceof Element)) return;
    el.setAttribute('data-thv-idx', String(i));
    byIdx.set(i, el);
    i += 1;
    for (const child of el.children) walk(child);
  }

  if (doc.documentElement) walk(doc.documentElement);
  return byIdx;
}