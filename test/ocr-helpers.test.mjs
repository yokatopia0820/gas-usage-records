import assert from 'node:assert/strict';
import test from 'node:test';
import helpers from '../ocr-helpers.js';

const { selectWeightFromText } = helpers;

test('selectWeightFromText prefers a plausible decimal weight over a longer date or model number', () => {
  assert.equal(selectWeightFromText('BOMATA 20260814\n13.174 kg\n'), '13.174');
});

test('selectWeightFromText accepts a comma decimal returned by OCR', () => {
  assert.equal(selectWeightFromText('NET 6,250 kg'), '6.250');
});

test('selectWeightFromText rejects unreasonably large numeric strings', () => {
  assert.equal(selectWeightFromText('model 20260814 serial 99887766'), null);
});
