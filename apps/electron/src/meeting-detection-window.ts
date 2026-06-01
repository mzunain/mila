import { BrowserWindow, screen } from 'electron';
import { detectedCallActionCopy } from './detected-call-actions';
import type { DetectedMeeting } from './meeting-detector';
import { meetingNotificationKey } from './meeting-notification-policy';

type DetectionWindowActions = {
  onTakeNotes: () => void;
  onIgnore: () => void;
  onMuteApp: () => void;
};

let detectionWindow: BrowserWindow | null = null;
let activeKey: string | null = null;

export function showMeetingDetectionWindow(
  meeting: DetectedMeeting,
  actions: DetectionWindowActions,
) {
  if (process.platform !== 'darwin') return;

  const key = meetingNotificationKey(meeting);
  if (detectionWindow && !detectionWindow.isDestroyed() && activeKey === key) {
    positionDetectionWindow(detectionWindow);
    return;
  }

  closeMeetingDetectionWindow();
  activeKey = key;

  const win = new BrowserWindow({
    width: 374,
    height: 54,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    hasShadow: false,
    title: 'Mila meeting detected',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  detectionWindow = win;
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  positionDetectionWindow(win);

  const runAction = (action: string) => {
    if (action === 'take-notes') {
      closeMeetingDetectionWindow(key);
      actions.onTakeNotes();
      return;
    }
    if (action === 'ignore') {
      closeMeetingDetectionWindow(key);
      actions.onIgnore();
      return;
    }
    if (action === 'mute') {
      closeMeetingDetectionWindow(key);
      actions.onMuteApp();
      return;
    }
    if (action === 'dismiss') {
      closeMeetingDetectionWindow(key);
    }
  };

  win.webContents.on('will-navigate', (event, url) => {
    const action = readActionUrl(url);
    if (!action) return;
    event.preventDefault();
    runAction(action);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    const action = readActionUrl(url);
    if (action) runAction(action);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    if (detectionWindow === win) {
      detectionWindow = null;
      activeKey = null;
    }
  });

  void win.loadURL(toDataUrl(renderDetectionHtml(meeting))).then(() => {
    if (win.isDestroyed()) return;
    win.webContents.setZoomFactor(1);
    win.showInactive();
    win.moveTop();
  });
}

export function closeMeetingDetectionWindow(meetingKey?: string) {
  if (meetingKey && activeKey && meetingKey !== activeKey) return;
  const win = detectionWindow;
  detectionWindow = null;
  activeKey = null;
  if (win && !win.isDestroyed()) win.close();
}

function positionDetectionWindow(win: BrowserWindow) {
  const display = screen.getPrimaryDisplay();
  const { x, y, width } = display.workArea;
  const bounds = win.getBounds();
  win.setBounds({
    x: Math.round(x + width - bounds.width - 12),
    y: Math.round(y + 8),
    width: bounds.width,
    height: bounds.height,
  });
}

function readActionUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'mila-detected:') return null;
    return parsed.hostname;
  } catch {
    return null;
  }
}

function toDataUrl(html: string) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function renderDetectionHtml(meeting: DetectedMeeting) {
  const copy = detectedCallActionCopy(meeting);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;" />
<style>
  :root {
    color-scheme: dark;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
    background: transparent;
  }
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
  body { padding: 5px; }
  .toast {
    height: 44px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto 26px;
    align-items: center;
    gap: 10px;
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 15px;
    background: rgba(28, 30, 32, 0.92);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(20px) saturate(140%);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
    color: #f7f4ef;
    padding: 0 8px;
  }
  .mark {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #67e8f9, #65f4b8);
    color: #041012;
    font-weight: 900;
    font-size: 12px;
    letter-spacing: -0.02em;
    box-shadow: inset 0 -6px 14px rgba(0,0,0,0.16);
  }
  .copy { min-width: 0; }
  .title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .provider {
    margin-top: 1px;
    color: rgba(247,244,239,0.60);
    font-size: 11px;
    font-weight: 500;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  a {
    color: inherit;
    text-decoration: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .take {
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 13px;
    border-radius: 9px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.10);
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .take:hover { background: rgba(255,255,255,0.17); border-color: rgba(255,255,255,0.20); }
  .take:active { background: rgba(255,255,255,0.09); }
  .close {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: rgba(247,244,239,0.55);
    transition: background 120ms ease, color 120ms ease;
  }
  .close:hover { background: rgba(255,255,255,0.12); color: #f7f4ef; }
  .close:active { background: rgba(255,255,255,0.06); }
  .close svg { width: 11px; height: 11px; display: block; }
</style>
</head>
<body>
  <main class="toast">
    <span class="mark" aria-hidden="true">M</span>
    <section class="copy">
      <div class="title">${escapeHtml(copy.title)}</div>
      <div class="provider">${escapeHtml(copy.providerLabel)}</div>
    </section>
    <a class="take" href="mila-detected://take-notes" target="_blank" data-action="take-notes">${escapeHtml(copy.takeNotesLabel)}</a>
    <a class="close" href="mila-detected://ignore" target="_blank" data-action="ignore" title="${escapeHtml(copy.ignoreLabel)}" aria-label="${escapeHtml(copy.ignoreLabel)}">
      <svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </a>
  </main>
  <script>
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      event.preventDefault();
      window.location.href = 'mila-detected://' + target.getAttribute('data-action');
    });
  </script>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
