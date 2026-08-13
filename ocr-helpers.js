(function (root) {
  function selectWeightFromText(text) {
    const candidates = String(text || '').match(/(?<!\d)\d{1,3}(?:[.,]\d{1,3})?(?!\d)/g) || [];
    const plausible = candidates.map(value => {
      const normalized = value.replace(',', '.');
      const numeric = Number(normalized);
      const hasDecimal = /[.,]/.test(value);
      return { normalized, numeric, hasDecimal, fractionLength: normalized.split('.')[1]?.length || 0 };
    }).filter(candidate => Number.isFinite(candidate.numeric) && candidate.numeric > 0 && candidate.numeric <= 200);

    if (!plausible.length) return null;
    plausible.sort((a, b) => {
      const score = candidate => (candidate.hasDecimal ? 1000 : 0) + candidate.fractionLength * 10 + candidate.numeric / 1000;
      return score(b) - score(a);
    });
    return plausible[0].normalized;
  }

  root.selectWeightFromText = selectWeightFromText;
  if (typeof module !== 'undefined') module.exports = { selectWeightFromText };
})(typeof globalThis === 'undefined' ? this : globalThis);
