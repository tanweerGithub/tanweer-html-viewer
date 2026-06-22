export const VIEWER_URL = 'https://tanweergithub.github.io/tanweer-html-viewer/';

function bytesToBinary(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return binary;
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeHtmlForUrl(html) {
  const bytes = new TextEncoder().encode(html);
  return btoa(bytesToBinary(bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function buildViewerLink(html, baseUrl = VIEWER_URL) {
  const url = new URL(baseUrl);
  url.searchParams.set('html', encodeHtmlForUrl(html));
  return url.toString();
}

function readParam(params, key) {
  const value = params.get(key);
  return value && value.length > 0 ? value : null;
}

export function parseHtmlFromUrl(location = window.location) {
  const query = new URLSearchParams(location.search);

  const queryHtml = readParam(query, 'html');
  if (queryHtml) {
    try {
      return { html: decodeBase64Url(queryHtml), source: 'html' };
    } catch {
      return null;
    }
  }

  const queryCode = readParam(query, 'code');
  if (queryCode) {
    return { html: queryCode, source: 'code' };
  }

  if (location.hash.length > 1) {
    const hash = new URLSearchParams(location.hash.slice(1));

    const hashHtml = readParam(hash, 'html');
    if (hashHtml) {
      try {
        return { html: decodeBase64Url(hashHtml), source: 'html' };
      } catch {
        return null;
      }
    }

    const hashCode = readParam(hash, 'code');
    if (hashCode) {
      return { html: hashCode, source: 'code' };
    }
  }

  return null;
}

export function clearImportParams(location = window.location) {
  const url = new URL(location.href);
  url.searchParams.delete('html');
  url.searchParams.delete('code');

  if (url.hash.length > 1) {
    const hash = new URLSearchParams(url.hash.slice(1));
    if (hash.has('html') || hash.has('code')) {
      url.hash = '';
    }
  }

  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}