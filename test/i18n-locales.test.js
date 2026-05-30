const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

test('locale files register KhaytLocales.en with app.title', () => {
  const ctx = vm.createContext({ globalThis: {} });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(path.join(root, 'renderer/locales/en.js'), 'utf8'), ctx, {
    filename: 'en.js',
  });
  assert.equal(ctx.globalThis.KhaytLocales?.en?.['app.title'], 'Khayt');
});

test('all seven locale files exist', () => {
  for (const lang of ['en', 'ar', 'de', 'es', 'fr', 'zh', 'ja']) {
    assert.ok(fs.existsSync(path.join(root, 'renderer/locales', `${lang}.js`)));
  }
});
