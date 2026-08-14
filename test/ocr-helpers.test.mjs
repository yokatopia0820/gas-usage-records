import assert from 'node:assert/strict';
import test from 'node:test';
import helpers from '../ocr-helpers.js';

const { selectWeightFromText } = helpers;

function imageWithRegions(width, height, regions) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let index = 3; index < data.length; index += 4) data[index] = 255;
  for (const region of regions) for (let y = region.y; y < region.y + region.height; y++) for (let x = region.x; x < region.x + region.width; x++) {
    const offset = (y * width + x) * 4;
    data[offset] = region.color[0]; data[offset + 1] = region.color[1]; data[offset + 2] = region.color[2];
  }
  return { width, height, data };
}

function sevenSegmentImage(value) {
  const width = value.length * 28; const height = 54; const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) { data[index] = 30; data[index + 1] = 215; data[index + 2] = 55; data[index + 3] = 255; }
  const segments = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  const fill = (x, y, w, h) => { for (let row = y; row < y + h; row++) for (let column = x; column < x + w; column++) { const offset = (row * width + column) * 4; data[offset] = data[offset + 1] = data[offset + 2] = 20; } };
  [...value].forEach((character, index) => { const x = index * 28 + 4; if (character === '.') return fill(x + 3, 45, 5, 5); const on = segments[character]; if (!on) return; if (on.includes('a')) fill(x + 5, 4, 14, 7); if (on.includes('b')) fill(x + 19, 11, 4, 12); if (on.includes('c')) fill(x + 19, 30, 4, 12); if (on.includes('d')) fill(x + 5, 43, 14, 7); if (on.includes('e')) fill(x + 1, 30, 4, 12); if (on.includes('f')) fill(x + 1, 11, 4, 12); if (on.includes('g')) fill(x + 5, 24, 14, 7); });
  return { width, height, data };
}

test('selectWeightFromText prefers a plausible decimal weight over a longer date or model number', () => {
  assert.equal(selectWeightFromText('BOMATA 20260814\n13.174 kg\n'), '13.174');
});

test('selectWeightFromText accepts a comma decimal returned by OCR', () => {
  assert.equal(selectWeightFromText('NET 6,250 kg'), '6.250');
});

test('selectWeightFromText restores the fixed three-decimal scale format when OCR drops the decimal point', () => {
  assert.equal(selectWeightFromText('13017'), '13.017');
});

test('selectWeightFromText rejects unreasonably large numeric strings', () => {
  assert.equal(selectWeightFromText('model 20260814 serial 99887766'), null);
});

test('findDisplayBounds selects the bright green rectangular LCD instead of a large leafy green area', () => {
  const image = imageWithRegions(120, 100, [
    { x: 0, y: 0, width: 100, height: 30, color: [48, 96, 32] },
    { x: 28, y: 58, width: 64, height: 24, color: [35, 210, 55] },
  ]);
  assert.deepEqual(helpers.findDisplayBounds(image), { x: 28, y: 58, width: 64, height: 24 });
});

test('estimateDisplayAngle reports an axis-aligned LCD as level', () => {
  const image = imageWithRegions(120, 100, [{ x: 28, y: 58, width: 64, height: 24, color: [35, 210, 55] }]);
  assert.ok(Math.abs(helpers.estimateDisplayAngle(image, { x: 28, y: 58, width: 64, height: 24 })) < .001);
});

test('findDisplayCorners preserves the four corners of an axis-aligned LCD', () => {
  const image = imageWithRegions(120, 100, [{ x: 28, y: 58, width: 64, height: 24, color: [35, 210, 55] }]);
  assert.deepEqual(helpers.findDisplayCorners(image, { x: 28, y: 58, width: 64, height: 24 }), {
    topLeft: { x: 28, y: 58 }, topRight: { x: 91, y: 58 }, bottomRight: { x: 91, y: 81 }, bottomLeft: { x: 28, y: 81 },
  });
});

test('displayCropRect keeps only the detected LCD with a small safety margin', () => {
  assert.deepEqual(
    helpers.displayCropRect({ x: 28, y: 58, width: 64, height: 24 }, 120, 100),
    { x: 25, y: 57, width: 70, height: 26 },
  );
});

test('seven-segment matching rejects an ambiguous binary pattern and uses segment strength to select 3', () => {
  assert.equal(helpers.closestSevenSegmentDigit('abcdeg'), null);
  assert.equal(helpers.closestSevenSegmentDigit('ab'), null);
  assert.equal(helpers.bestDigitFromSegmentScores({ a: .65, b: .58, c: .58, d: .71, e: .18, f: .10, g: .54 }), '3');
});

test('selectStableWeight returns only a reading confirmed by multiple thresholds', () => {
  assert.equal(helpers.selectStableWeight(['13.174', '13.174', null, '11.074']), '13.174');
  assert.equal(helpers.selectStableWeight(['10.450', '10.458', null]), null);
});

test('selectPreferredWeight uses the calibrated reading before the stability fallback', () => {
  assert.equal(helpers.selectPreferredWeight(['13.171', null, '13.174', null, '11.074', null]), '13.174');
  assert.equal(helpers.selectPreferredWeight([null, null, null, '10.450', '10.458', null]), null);
});
