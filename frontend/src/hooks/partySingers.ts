import { useEffect, useState } from 'react';
import { party, type Placing, type Singer } from 'src/party';

const CHECK_MS = 500;

/** Who is singing in the room right now (see party.ts); the list only changes when somebody joins, leaves or changes part. */
export function usePartySingers(): Singer[] {
  const [singers, setSingers] = useState<Singer[]>(() => party.singers());
  useEffect(() => {
    const timer = setInterval(() => {
      const next = party.singers();
      setSingers((previous) =>
        previous.length === next.length && previous.every((s, i) => s.id === next[i].id && s.part === next[i].part && s.name === next[i].name)
          ? previous
          : next,
      );
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, []);
  return singers;
}

/** Everyone's last announced score, by singer; refreshed about as often as the screen announces. */
export function usePartyScores(): Record<string, number | null> {
  const [scores, setScores] = useState<Record<string, number | null>>(() => party.scores());
  useEffect(() => {
    const timer = setInterval(() => setScores({ ...party.scores() }), CHECK_MS);
    return () => clearInterval(timer);
  }, []);
  return scores;
}

/** How the last song ended, once the screen has announced it. */
export function usePartyStandings(): Placing[] | null {
  const [standings, setStandings] = useState<Placing[] | null>(() => party.standings());
  useEffect(() => {
    const timer = setInterval(() => setStandings(party.standings()), CHECK_MS);
    return () => clearInterval(timer);
  }, []);
  return standings;
}
