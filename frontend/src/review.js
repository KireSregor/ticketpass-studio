export function startTime(value) {
  const raw = String(value).trim();
  const exact = raw.match(/^(\d{1,2}):(\d{2})$/);
  const explicit = [...raw.matchAll(/\binicio(?:\s+(?:del?\s+|de la\s+)?(?:show|evento|concierto|función|presentación|espectáculo))?\s*[:–—-]\s*(\d{1,2}):(\d{2})(?![\d:])/gi)];
  const times = new Set();
  for (const match of exact ? [exact] : explicit) {
    const [, hour, minute] = match;
    if (Number(hour) >= 24 || Number(minute) >= 60) return null;
    times.add(`${hour.padStart(2, '0')}:${minute}`);
  }
  return times.size === 1 ? times.values().next().value : null;
}

export function sameReviewValue(field, proposal, value) {
  if (proposal === null) return false;
  if (field !== 'zones') return proposal === value;
  return Array.isArray(proposal) && Array.isArray(value) && proposal.length === value.length
    && proposal.every((zone, index) => (
      zone.name === value[index].name
      && zone.capacity === value[index].capacity
      && zone.price === value[index].price
    ));
}
