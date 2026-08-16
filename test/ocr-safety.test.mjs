import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('selected LCD range is persisted and its OCR result is written into the weight field', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /localStorage\.setItem\('bomataLcdCrop'/);
  assert.match(html, /setCropEditors\(editors => \(\{ \.\.\.editors, \[field\]:/);
  assert.match(html, /BomataOCR\.read\(recognition\.imageData\.data, recognition\.imageData\.width, recognition\.imageData\.height\)/);
  assert.match(html, /setFormData\(previous => \(\{ \.\.\.previous, \[field\]: result\.value\.toFixed\(3\) \}\)\);/);
  assert.doesNotMatch(html, /if \(result\.conf < BomataOCR\.CONFIDENCE_WARN\) \{/);
});
