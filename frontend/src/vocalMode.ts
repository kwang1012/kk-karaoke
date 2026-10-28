/** Full guide gain is audibly the same as original-vocal mode, including across room clients. */
export const hasFullVocal = (vocalOn: boolean, guideLevel: number) => vocalOn || guideLevel >= 1;

export function toggledVocalMode(vocalOn: boolean, guideLevel: number) {
  const enabled = !hasFullVocal(vocalOn, guideLevel);
  // A 100% guide would otherwise defeat switching the original vocals off.
  return { vocalOn: enabled, guideLevel: !enabled && guideLevel >= 1 ? 0 : guideLevel };
}
