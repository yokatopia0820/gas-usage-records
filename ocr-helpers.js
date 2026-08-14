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

  function decodeSevenSegment(imageData) {
    const { width, height, data } = imageData; const total = width * height;
    const brightness = new Uint8Array(total); let min = 255; let max = 0;
    for (let index = 0; index < total; index++) { const offset = index * 4; const value = Math.round(data[offset] * .299 + data[offset + 1] * .587 + data[offset + 2] * .114); brightness[index] = value; min = Math.min(min, value); max = Math.max(max, value); }
    if (max - min < 45) return null;
    const cutoff = min + (max - min) * .42; const dark = new Uint8Array(total);
    for (let index = 0; index < total; index++) dark[index] = brightness[index] < cutoff ? 1 : 0;
    const groups = []; let start = -1;
    for (let x = 0; x < width; x++) { let count = 0; for (let y = 0; y < height; y++) count += dark[y * width + x]; const active = count >= Math.max(2, height * .02); if (active && start < 0) start = x; if ((!active || x === width - 1) && start >= 0) { groups.push({ left: start, right: active && x === width - 1 ? x : x - 1 }); start = -1; } }
    const patterns = { abcdef: '0', bc: '1', abdeg: '2', abcdg: '3', bcfg: '4', abcfg: '4', acdfg: '5', acdefg: '6', abc: '7', abcdefg: '8', abcdfg: '9' };
    const parts = [];
    for (const group of groups) {
      let top = height; let bottom = 0; let pixels = 0;
      for (let x = group.left; x <= group.right; x++) for (let y = 0; y < height; y++) if (dark[y * width + x]) { top = Math.min(top, y); bottom = Math.max(bottom, y); pixels++; }
      const groupWidth = group.right - group.left + 1; const groupHeight = bottom - top + 1;
      if (groupHeight < height * .3 && groupWidth < width * .08) { parts.push('.'); continue; }
      if (groupHeight < height * .45 || groupWidth < 2) continue;
      if (groupWidth < groupHeight * .18) { parts.push('1'); continue; }
      const density = (x1, y1, x2, y2) => { let count = 0; let area = 0; for (let y = Math.max(top, Math.floor(top + groupHeight * y1)); y <= Math.min(bottom, Math.ceil(top + groupHeight * y2)); y++) for (let x = Math.max(group.left, Math.floor(group.left + groupWidth * x1)); x <= Math.min(group.right, Math.ceil(group.left + groupWidth * x2)); x++) { area++; count += dark[y * width + x]; } return area ? count / area : 0; };
      const regions = { a: [.18, 0, .82, .20], b: [.58, .12, 1, .48], c: [.58, .52, 1, .88], d: [.18, .80, .82, 1], e: [0, .52, .42, .88], f: [0, .12, .42, .48], g: [.18, .40, .82, .60] };
      const on = Object.entries(regions).filter(([, region]) => density(...region) > .16).map(([name]) => name).join('');
      if (patterns[on]) parts.push(patterns[on]);
    }
    const value = parts.join('').replace(/^\.+|\.+$/g, '');
    return /^\d{1,2}\.\d{3}$/.test(value) ? value : null;
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
  root.decodeSevenSegment = decodeSevenSegment;
  if (typeof module !== 'undefined') module.exports = { selectWeightFromText, findDisplayBounds, decodeSevenSegment };
})(typeof globalThis === 'undefined' ? this : globalThis);
