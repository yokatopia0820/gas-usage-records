(function (root) {
  function findDisplayBounds(imageData) {
    const { width, height, data } = imageData;
    const size = width * height;
    const mask = new Uint8Array(size);
    const seen = new Uint8Array(size);
    for (let index = 0; index < size; index++) {
      const offset = index * 4; const red = data[offset]; const green = data[offset + 1]; const blue = data[offset + 2];
      mask[index] = green >= 105 && green - red >= 35 && green - blue >= 20 && green > red * 1.25 && green > blue * 1.18 ? 1 : 0;
    }
    let best = null;
    for (let start = 0; start < size; start++) {
      if (!mask[start] || seen[start]) continue;
      const queue = [start]; seen[start] = 1;
      let pixels = 0; let left = width; let top = height; let right = 0; let bottom = 0;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor]; const x = index % width; const y = Math.floor(index / width);
        pixels++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        const neighbours = [index - 1, index + 1, index - width, index + width];
        for (const next of neighbours) {
          if (next < 0 || next >= size || seen[next] || !mask[next]) continue;
          const nextX = next % width;
          if ((next === index - 1 || next === index + 1) && Math.abs(nextX - x) !== 1) continue;
          seen[next] = 1; queue.push(next);
        }
      }
      const componentWidth = right - left + 1; const componentHeight = bottom - top + 1;
      const ratio = componentWidth / componentHeight; const fill = pixels / (componentWidth * componentHeight);
      if (componentWidth < width * .12 || componentHeight < height * .035 || ratio < 1.2 || ratio > 4.2 || fill < .35) continue;
      const score = pixels * fill;
      if (!best || score > best.score) best = { x: left, y: top, width: componentWidth, height: componentHeight, score };
    }
    return best && { x: best.x, y: best.y, width: best.width, height: best.height };
  }

  function estimateDisplayAngle(imageData, bounds) {
    if (!bounds) return 0;
    const { width, data } = imageData; let count = 0; let sumX = 0; let sumY = 0;
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const offset = (y * width + x) * 4; const red = data[offset]; const green = data[offset + 1]; const blue = data[offset + 2];
      if (!(green >= 105 && green - red >= 35 && green - blue >= 20 && green > red * 1.25 && green > blue * 1.18)) continue;
      count++; sumX += x; sumY += y;
    }
    if (count < 2) return 0;
    const meanX = sumX / count; const meanY = sumY / count; let xx = 0; let yy = 0; let xy = 0;
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const offset = (y * width + x) * 4; const red = data[offset]; const green = data[offset + 1]; const blue = data[offset + 2];
      if (!(green >= 105 && green - red >= 35 && green - blue >= 20 && green > red * 1.25 && green > blue * 1.18)) continue;
      const dx = x - meanX; const dy = y - meanY; xx += dx * dx; yy += dy * dy; xy += dx * dy;
    }
    return .5 * Math.atan2(2 * xy, xx - yy);
  }

  function findDisplayCorners(imageData, bounds) {
    if (!bounds) return null;
    const { width, data } = imageData; const top = []; const bottom = [];
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      let first = null; let last = null;
      for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
        const offset = (y * width + x) * 4; const red = data[offset]; const green = data[offset + 1]; const blue = data[offset + 2];
        if (!(green >= 105 && green - red >= 35 && green - blue >= 20 && green > red * 1.25 && green > blue * 1.18)) continue;
        if (first === null) first = y; last = y;
      }
      if (first !== null) { top.push({ x, y: first }); bottom.push({ x, y: last }); }
    }
    if (top.length < 2) return null;
    const fit = points => {
      const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length; const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      const slope = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
      return x => slope * (x - meanX) + meanY;
    };
    const topLine = fit(top); const bottomLine = fit(bottom); const left = top[0].x; const right = top[top.length - 1].x;
    return { topLeft: { x: left, y: Math.round(topLine(left)) }, topRight: { x: right, y: Math.round(topLine(right)) }, bottomRight: { x: right, y: Math.round(bottomLine(right)) }, bottomLeft: { x: left, y: Math.round(bottomLine(left)) } };
  }

  // Keep the crop tight: recognition must never see labels, barcodes, or buttons.
  function displayCropRect(bounds, sourceWidth, sourceHeight, paddingRatio = .05) {
    if (!bounds || !sourceWidth || !sourceHeight) return null;
    const paddingX = Math.max(1, Math.round(bounds.width * paddingRatio));
    const paddingY = Math.max(1, Math.round(bounds.height * paddingRatio));
    const x = Math.max(0, bounds.x - paddingX);
    const y = Math.max(0, bounds.y - paddingY);
    const right = Math.min(sourceWidth, bounds.x + bounds.width + paddingX);
    const bottom = Math.min(sourceHeight, bounds.y + bounds.height + paddingY);
    return { x, y, width: right - x, height: bottom - y };
  }

  const sevenSegmentPatterns = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

  function closestSevenSegmentDigit(on) {
    if (on === '1') return { digit: '1', distance: 0 };
    if (!on || on.length < 3) return null;
    const active = new Set(on);
    const candidates = Object.entries(sevenSegmentPatterns).map(([digit, pattern]) => {
      const expected = new Set(pattern);
      let distance = 0;
      for (const segment of active) if (!expected.has(segment)) distance++;
      for (const segment of expected) if (!active.has(segment)) distance++;
      return { digit, distance };
    }).sort((a, b) => a.distance - b.distance);
    if (candidates[0].distance > 1 || candidates[0].distance === candidates[1].distance) return null;
    return candidates[0];
  }

  function bestDigitFromSegmentScores(scores) {
    const candidates = Object.entries(sevenSegmentPatterns).map(([digit, pattern]) => {
      const expected = new Set(pattern);
      const all = Object.keys(scores);
      const onAverage = [...expected].reduce((sum, segment) => sum + scores[segment], 0) / expected.size;
      const off = all.filter(segment => !expected.has(segment));
      const offAverage = off.length ? off.reduce((sum, segment) => sum + scores[segment], 0) / off.length : 0;
      return { digit, score: onAverage - offAverage * .7 };
    }).sort((a, b) => b.score - a.score);
    return candidates[0].score - candidates[1].score >= .03 ? candidates[0].digit : null;
  }

  function selectStableWeight(readings) {
    const counts = new Map();
    for (const reading of readings) if (/^\d{1,2}\.\d{3}$/.test(reading || '')) counts.set(reading, (counts.get(reading) || 0) + 1);
    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
    return ranked[0] && ranked[0][1] >= 2 && (!ranked[1] || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null;
  }

  function selectPreferredWeight(readings) {
    const calibrated = readings[2];
    return /^\d{1,2}\.\d{3}$/.test(calibrated || '') ? calibrated : selectStableWeight(readings);
  }

  function decodeScaleWeight(imageData) {
    return decodeFixedScaleSlots(imageData) || selectPreferredWeight([.30, .32, .34, .36, .38, .40].map(threshold => decodeSevenSegment(imageData, false, threshold)));
  }

  // BOMATA's LCD has five fixed digit positions.  Reading those positions independently
  // avoids joining digits together when the green panel has shadows or reflections.
  function decodeFixedScaleSlots(imageData) {
    const { width, height, data } = imageData;
    const left = Math.floor(width * .36); const right = Math.floor(width * .98);
    const top = Math.floor(height * .12); const bottom = Math.floor(height * .90);
    if (right - left < 30 || bottom - top < 20) return null;
    const digits = [];
    for (let slot = 0; slot < 5; slot++) {
      const slotLeft = Math.floor(left + (right - left) * slot / 5);
      const slotRight = Math.floor(left + (right - left) * (slot + 1) / 5) - 1;
      let min = 255; let max = 0;
      for (let y = top; y <= bottom; y++) for (let x = slotLeft; x <= slotRight; x++) {
        const offset = (y * width + x) * 4; const value = Math.round(data[offset] * .299 + data[offset + 1] * .587 + data[offset + 2] * .114);
        min = Math.min(min, value); max = Math.max(max, value);
      }
      if (max - min < 28 || min > max * .78) { digits.push(''); continue; }
      const cutoff = min + (max - min) * .48;
      const density = (x1, y1, x2, y2) => {
        let ink = 0; let area = 0;
        const fromX = Math.max(slotLeft, Math.floor(slotLeft + (slotRight - slotLeft + 1) * x1));
        const toX = Math.min(slotRight, Math.ceil(slotLeft + (slotRight - slotLeft + 1) * x2));
        const fromY = Math.max(top, Math.floor(top + (bottom - top + 1) * y1));
        const toY = Math.min(bottom, Math.ceil(top + (bottom - top + 1) * y2));
        for (let y = fromY; y <= toY; y++) for (let x = fromX; x <= toX; x++) {
          const offset = (y * width + x) * 4; const value = Math.round(data[offset] * .299 + data[offset + 1] * .587 + data[offset + 2] * .114);
          area++; if (value < cutoff) ink++;
        }
        return area ? ink / area : 0;
      };
      const scores = {
        a: density(.18, 0, .82, .20), b: density(.58, .12, 1, .48), c: density(.58, .52, 1, .88),
        d: density(.18, .80, .82, 1), e: density(0, .52, .42, .88), f: density(0, .12, .42, .48), g: density(.18, .40, .82, .60)
      };
      const digit = bestDigitFromSegmentScores(scores);
      digits.push(digit || '');
    }
    const text = digits.join('');
    return /^\d{4,5}$/.test(text) ? `${text.slice(0, -3)}.${text.slice(-3)}` : null;
  }

  function decodeSevenSegment(imageData, debug = false, darkness = .42) {
    const { width, height, data } = imageData; const total = width * height;
    const brightness = new Uint8Array(total); let min = 255; let max = 0;
    for (let index = 0; index < total; index++) { const offset = index * 4; const value = Math.round(data[offset] * .299 + data[offset + 1] * .587 + data[offset + 2] * .114); brightness[index] = value; min = Math.min(min, value); max = Math.max(max, value); }
    if (max - min < 45) return null;
    const cutoff = min + (max - min) * darkness; const dark = new Uint8Array(total);
    for (let index = 0; index < total; index++) dark[index] = brightness[index] < cutoff ? 1 : 0;
    const groups = []; let start = -1;
    for (let x = 0; x < width; x++) { let count = 0; for (let y = 0; y < height; y++) count += dark[y * width + x]; const active = count >= Math.max(2, height * .02); if (active && start < 0) start = x; if ((!active || x === width - 1) && start >= 0) { groups.push({ left: start, right: active && x === width - 1 ? x : x - 1 }); start = -1; } }
    const parts = []; const detail = [];
    for (const group of groups) {
      let top = height; let bottom = 0; let pixels = 0;
      for (let x = group.left; x <= group.right; x++) for (let y = 0; y < height; y++) if (dark[y * width + x]) { top = Math.min(top, y); bottom = Math.max(bottom, y); pixels++; }
      const groupWidth = group.right - group.left + 1; const groupHeight = bottom - top + 1;
      if (groupHeight < height * .3 && groupWidth < width * .08) { parts.push('.'); detail.push({ ...group, on: '.', digit: '.' }); continue; }
      if (groupHeight < height * .45 || groupWidth < 2) continue;
      if (groupWidth < groupHeight * .3) { parts.push('1'); detail.push({ ...group, on: '1', digit: '1' }); continue; }
      const density = (x1, y1, x2, y2) => { let count = 0; let area = 0; for (let y = Math.max(top, Math.floor(top + groupHeight * y1)); y <= Math.min(bottom, Math.ceil(top + groupHeight * y2)); y++) for (let x = Math.max(group.left, Math.floor(group.left + groupWidth * x1)); x <= Math.min(group.right, Math.ceil(group.left + groupWidth * x2)); x++) { area++; count += dark[y * width + x]; } return area ? count / area : 0; };
      const regions = { a: [.18, 0, .82, .20], b: [.58, .12, 1, .48], c: [.58, .52, 1, .88], d: [.18, .80, .82, 1], e: [0, .52, .42, .88], f: [0, .12, .42, .48], g: [.18, .40, .82, .60] };
      const scores = Object.fromEntries(Object.entries(regions).map(([name, region]) => [name, density(...region)]));
      const on = Object.entries(scores).filter(([name, score]) => score > (name === 'a' || name === 'd' || name === 'g' ? .4 : .16)).map(([name]) => name).join('');
      const closest = closestSevenSegmentDigit(on); const digit = closest?.digit || (on.length >= 4 ? bestDigitFromSegmentScores(scores) : null); if (digit) parts.push(digit); detail.push({ ...group, on, digit, distance: closest?.distance ?? null, scores });
    }
    const value = parts.join('').replace(/^\.+|\.+$/g, '');
    const digits = parts.filter(part => /^\d$/.test(part)).join('');
    const inferred = /^\d{5}$/.test(digits) ? `${digits.slice(0, -3)}.${digits.slice(-3)}` : value;
    const decoded = /^\d{1,2}\.\d{3}$/.test(inferred) ? inferred : null;
    return debug ? { decoded, value, detail } : decoded;
  }

  function selectWeightFromText(text) {
    const candidates = String(text || '').match(/\d+(?:[.,]\d+)?/g) || [];
    const plausible = candidates.flatMap(value => {
      const normalized = value.replace(',', '.');
      const numeric = Number(normalized);
      const hasDecimal = /[.,]/.test(value);
      if (hasDecimal) return [{ normalized, numeric, hasDecimal: true, inferred: false, fractionLength: normalized.split('.')[1]?.length || 0 }];
      if (/^\d{4,5}$/.test(value)) {
        const inferred = numeric / 1000;
        return [{ normalized: inferred.toFixed(3), numeric: inferred, hasDecimal: true, inferred: true, fractionLength: 3 }];
      }
      return [{ normalized, numeric, hasDecimal: false, inferred: false, fractionLength: 0 }];
    }).filter(candidate => Number.isFinite(candidate.numeric) && candidate.numeric > 0 && candidate.numeric <= 200);

    if (!plausible.length) return null;
    plausible.sort((a, b) => {
      const score = candidate => (candidate.hasDecimal ? 1000 : 0) + (candidate.inferred ? -50 : 0) + candidate.fractionLength * 10 + candidate.numeric / 1000;
      return score(b) - score(a);
    });
    return plausible[0].normalized;
  }

  root.selectWeightFromText = selectWeightFromText;
  root.findDisplayBounds = findDisplayBounds;
  root.estimateDisplayAngle = estimateDisplayAngle;
  root.findDisplayCorners = findDisplayCorners;
  root.displayCropRect = displayCropRect;
  root.closestSevenSegmentDigit = closestSevenSegmentDigit;
  root.bestDigitFromSegmentScores = bestDigitFromSegmentScores;
  root.selectStableWeight = selectStableWeight;
  root.selectPreferredWeight = selectPreferredWeight;
  root.decodeScaleWeight = decodeScaleWeight;
  root.decodeSevenSegment = decodeSevenSegment;
  root.decodeFixedScaleSlots = decodeFixedScaleSlots;
  if (typeof module !== 'undefined') module.exports = { selectWeightFromText, findDisplayBounds, estimateDisplayAngle, findDisplayCorners, displayCropRect, closestSevenSegmentDigit, bestDigitFromSegmentScores, selectStableWeight, selectPreferredWeight, decodeFixedScaleSlots, decodeScaleWeight, decodeSevenSegment };
})(typeof globalThis === 'undefined' ? this : globalThis);
