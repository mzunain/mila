import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectDirection, detectLanguage } from './language.js';

describe('language detection', () => {
  it('detects Urdu script and RTL direction', () => {
    const text = 'کل میٹنگ ہے';

    assert.equal(detectLanguage(text), 'ur');
    assert.equal(detectDirection(text), 'rtl');
  });

  it('detects Hindi script', () => {
    assert.equal(detectLanguage('कल मीटिंग है'), 'hi');
  });

  it('detects mixed roman Urdu and English code-switching', () => {
    assert.equal(detectLanguage("Kal meeting hai at 5 PM, don't forget"), 'mixed');
  });

  it('detects Finnish language hints', () => {
    assert.equal(detectLanguage('Huomenna tiimi tekee päätös asiasta'), 'fi');
  });

  it('falls back to English for plain English text', () => {
    assert.equal(detectLanguage('The customer call starts at five.'), 'en');
  });
});
