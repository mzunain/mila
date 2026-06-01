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
    grid-template-columns: 7px minmax(0, 1fr) 144px;
    align-items: center;
    gap: 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 14px;
    background: rgba(31, 34, 35, 0.94);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    color: #f7f4ef;
    padding: 6px 7px 6px 11px;
  }
  .grip {
    width: 6px;
    height: 28px;
    border-radius: 999px;
    border: 1px dashed rgba(255,255,255,0.16);
    opacity: 0.8;
  }
  .copy { min-width: 0; }
  .title {
    font-size: 13px;
    font-weight: 620;
    letter-spacing: 0;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .provider {
    margin-top: 1px;
    color: rgba(247,244,239,0.68);
    font-size: 11px;
    font-weight: 500;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .actions {
    height: 36px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 30px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 11px;
    overflow: hidden;
    background: rgba(255,255,255,0.04);
  }
  a {
    color: inherit;
    text-decoration: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .take {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 0 8px;
    font-size: 13px;
    font-weight: 620;
    white-space: nowrap;
  }
  .take-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mark {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #67e8f9, #65f4b8);
    color: #041012;
    font-weight: 900;
    font-size: 11px;
    box-shadow: inset 0 -7px 16px rgba(0,0,0,0.14);
  }
  .more {
    display: grid;
    place-items: center;
    border-left: 1px solid rgba(255,255,255,0.16);
    font-size: 14px;
    color: rgba(247,244,239,0.86);
  }
</style>
</head>
<body>
  <main class="toast">
    <div class="grip"></div>
    <section class="copy">
      <div class="title">${escapeHtml(copy.title)}</div>
      <div class="provider">${escapeHtml(copy.providerLabel)}</div>
    </section>
    <section class="actions">
      <a class="take" href="mila-detected://take-notes" target="_blank" data-action="take-notes">
        <span class="mark">M</span>
        <span class="take-label">${escapeHtml(copy.takeNotesLabel)}</span>
      </a>
      <a class="more" href="mila-detected://ignore" target="_blank" data-action="ignore" title="${escapeHtml(copy.ignoreLabel)}">⌄</a>
    </section>
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
