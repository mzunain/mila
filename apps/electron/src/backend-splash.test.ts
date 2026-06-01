import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { backendSplashDataUrl, buildBackendSplashHtml } from './backend-splash';

test('buildBackendSplashHtml returns a full document with the default copy', () => {
  const html = buildBackendSplashHtml();
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Starting Mila/);
  assert.match(html, /Bringing the backend up/);
  assert.match(html, /class="spinner"/);
});

test('buildBackendSplashHtml uses provided copy', () => {
  const html = buildBackendSplashHtml({
    title: 'Custom title',
    message: 'Custom message',
    detail: 'Custom detail',
  });
  assert.match(html, /Custom title/);
  assert.match(html, /Custom message/);
  assert.match(html, /Custom detail/);
});

test('buildBackendSplashHtml escapes HTML in user-facing copy', () => {
  const html = buildBackendSplashHtml({ message: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('backendSplashDataUrl produces a loadable data URL', () => {
  const url = backendSplashDataUrl({ message: 'hi' });
  assert.match(url, /^data:text\/html;charset=utf-8,/);
  assert.ok(decodeURIComponent(url.split(',')[1]).includes('hi'));
});
