import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export function useHistoryBoundaries() {
  const location = useLocation();
  const navigationType = useNavigationType(); // 'POP', 'PUSH', 'REPLACE'
  const stack = useRef<string[]>([]);
  const index = useRef<number>(-1);
  const [atBottom, setAtBottom] = useState(true);
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    const path = location.pathname + location.search;

    if (navigationType === 'PUSH') {
      index.current++;
      stack.current = stack.current.slice(0, index.current); // discard forward entries
      stack.current.push(path);
    } else if (navigationType === 'POP') {
      const newIndex = stack.current.findIndex((entry) => entry === path);
      if (newIndex !== -1) {
        index.current = newIndex;
      } else {
        // If unknown (e.g. manual back/forward)
        stack.current.push(path);
        index.current = stack.current.length - 1;
      }
    } else if (navigationType === 'REPLACE') {
      if (index.current >= 0) {
        stack.current[index.current] = path;
      } else {
        stack.current.push(path);
        index.current = 0;
      }
    }

    setAtBottom(index.current === 0);
    setAtTop(index.current === stack.current.length - 1);
  }, [location, navigationType]);

  return { isBottom: atBottom, isTop: atTop };
}
