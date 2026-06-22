/**
 * Drop-in helper for sites that generate HTML and want to link to Tanweer HTML Viewer.
 *
 * Usage:
 *   <a id="open-viewer" target="_blank" rel="noopener">Open in HTML Viewer</a>
 *   <script src="https://tanweergithub.github.io/tanweer-html-viewer/link-helper.js"></script>
 *   <script>
 *     document.getElementById('open-viewer').href =
 *       TanweerHtmlViewer.buildLink(myHtmlString);
 *   </script>
 */
(function (global) {
  const VIEWER_URL = 'https://tanweergithub.github.io/tanweer-html-viewer/';

  function bytesToBinary(bytes) {
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return binary;
  }

  function encodeHtmlForUrl(html) {
    var bytes = new TextEncoder().encode(html);
    return btoa(bytesToBinary(bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function buildLink(html, baseUrl) {
    var url = new URL(baseUrl || VIEWER_URL);
    url.searchParams.set('html', encodeHtmlForUrl(html));
    return url.toString();
  }

  global.TanweerHtmlViewer = {
    VIEWER_URL: VIEWER_URL,
    buildLink: buildLink,
    encodeHtmlForUrl: encodeHtmlForUrl,
  };
})(typeof window !== 'undefined' ? window : globalThis);