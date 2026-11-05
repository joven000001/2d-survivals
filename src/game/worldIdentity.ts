/** Normalize names consistently so whitespace and letter casing do not create new worlds. */
export function normalizeWorldName(name: string): string {
  return name.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

/** Stable 32-bit FNV-1a hash for named worlds. Never uses runtime randomness. */
export function worldNameToSeed(name: string): number {
  const normalized = normalizeWorldName(name);
  if (!normalized) throw new Error('World name cannot be empty.');

  let hash = 0x811c9dc5;
  for (const character of normalized) {
    const codePoint = character.codePointAt(0)!;
    hash ^= codePoint;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Preserve legacy integer seeds while routing named worlds through the shared hash. */
export function worldInputToSeed(name: string): number {
  const normalized = name.trim();
  if (/^\d+$/.test(normalized)) {
    const numericSeed = Number(normalized);
    if (Number.isSafeInteger(numericSeed)) return numericSeed;
  }
  return worldNameToSeed(normalized);
}
