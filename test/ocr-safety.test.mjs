import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('low-confidence OCR results are not automatically written into weight fields', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /if \(result\.conf < BomataOCR\.CONFIDENCE_WARN\) \{/);
  assert.match(html, /信頼度が低いため、数値は入力しません/);
  assert.match(html, /setFormData\(previous => \(\{ \.\.\.previous, \[field\]: result\.value\.toFixed\(3\) \}\)\);/);
});
