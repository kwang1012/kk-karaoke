/** The stages a song goes through before it can be sung. Several run at once, so each has its own state. */
export const STAGE_ORDER = ['lyrics', 'audio', 'vocals', 'saving', 'polishing'] as const;
export type StageName = (typeof STAGE_ORDER)[number];
export type StageState = 'pending' | 'running' | 'done' | 'error';
export type Stages = Partial<Record<StageName, StageState>>;

/** The stages in display order, leaving out any the server did not report. */
export function orderedStages(stages: Stages | undefined): { name: StageName; state: StageState }[] {
  if (!stages) return [];
  return STAGE_ORDER.filter((name) => stages[name] !== undefined).map((name) => ({ name, state: stages[name]! }));
}

/** How many stages are finished, of how many there are. */
export function stageCount(stages: Stages | undefined): { done: number; total: number } {
  const list = orderedStages(stages);
  return { done: list.filter((s) => s.state === 'done').length, total: list.length };
}
