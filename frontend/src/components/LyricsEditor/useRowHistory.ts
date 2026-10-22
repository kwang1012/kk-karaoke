import { useCallback, useRef, useState } from 'react';
import type { Row } from './model';

type State = { past: Row[][]; present: Row[]; future: Row[][] };

const LIMIT = 100;
// Typing in one field is one undo step, not one per keystroke.
const COALESCE_MS = 800;

/** Rows with undo and redo. */
export function useRowHistory(initial: Row[] = []) {
  const [state, setState] = useState<State>({ past: [], present: initial, future: [] });
  const last = useRef<{ key: string; at: number } | null>(null);

  /** Replace the rows. Changes with the same `key` in quick succession share one undo step. */
  const commit = useCallback((update: Row[] | ((rows: Row[]) => Row[]), key?: string) => {
    const now = Date.now();
    const coalesce = !!key && !!last.current && last.current.key === key && now - last.current.at < COALESCE_MS;
    last.current = key ? { key, at: now } : null;
    setState((s) => {
      const next = typeof update === 'function' ? update(s.present) : update;
      if (next === s.present) return s;
      return { past: coalesce ? s.past : [...s.past, s.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    last.current = null;
    setState((s) =>
      s.past.length === 0
        ? s
        : { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] }
    );
  }, []);

  const redo = useCallback(() => {
    last.current = null;
    setState((s) =>
      s.future.length === 0
        ? s
        : { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) }
    );
  }, []);

  /** Start over with these rows and no history (a different song, or just saved). */
  const reset = useCallback((rows: Row[]) => {
    last.current = null;
    setState({ past: [], present: rows, future: [] });
  }, []);

  return { rows: state.present, commit, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
