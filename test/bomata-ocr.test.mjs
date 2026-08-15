import assert from 'node:assert/strict';
import test from 'node:test';
import BomataOCR from '../bomata-ocr.js';

test('BOMATA OCR engine exposes the local recognition API', () => {
  assert.equal(typeof BomataOCR.init, 'function');
  assert.equal(typeof BomataOCR.read, 'function');
  assert.equal(typeof BomataOCR.drawBand, 'function');
  assert.equal(typeof BomataOCR.CONFIDENCE_WARN, 'number');
});
