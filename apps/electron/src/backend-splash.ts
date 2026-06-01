// Pure builder for the "starting backend" splash shown while the API comes up
// after a restart. Returns a self-contained HTML document (no external assets)
// so it can be loaded into a BrowserWindow via a data: URL.

export type SplashOptions = {
  title?: string;
  message?: string;
  detail?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildBackendSplashHtml(opts: SplashOptions = {}): string {
  const title = escapeHtml(opts.title ?? 'Starting Mila…');
  const message = escapeHtml(opts.message ?? 'Bringing the backend up');
  const detail = escapeHtml(
    opts.detail ?? 'This only takes a moment after a restart.',
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #fafafa;
    color: #0a0a0a;
    -webkit-user-select: none;
    user-select: none;
    -webkit-app-region: drag;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0a0a0a; color: #fafafa; }
    .detail { color: #a1a1aa; }
    .spinner { border-color: #27272a; border-top-color: #fafafa; }
  }
  .card { text-align: center; padding: 32px 40px; }
  .spinner {
    width: 28px; height: 28px; margin: 0 auto 18px;
    border: 3px solid #e4e4e7;
    border-top-color: #0a0a0a;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .title { font-size: 15px; font-weight: 600; margin: 0 0 6px; }
  .message { font-size: 13px; margin: 0 0 4px; opacity: 0.85; }
  .detail { font-size: 12px; margin: 0; color: #71717a; }
</style>
</head>
<body>
  <div class="card">
    <div class="spinner" aria-hidden="true"></div>
    <p class="title">${title}</p>
    <p class="message">${message}</p>
    <p class="detail">${detail}</p>
  </div>
</body>
</html>`;
}

/** Wrap the splash HTML as a data: URL suitable for BrowserWindow.loadURL. */
export function backendSplashDataUrl(opts?: SplashOptions): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildBackendSplashHtml(opts))}`;
}
