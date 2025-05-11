import { useEffect, useMemo, useState } from 'react';

export default function Resizer({
  leftRef,
  rightRef,
}: {
  leftRef?: React.RefObject<HTMLDivElement>;
  rightRef?: React.RefObject<HTMLDivElement>;
}) {
  const [leftRect, setLeftRect] = useState<DOMRectReadOnly | null>(null);
  const [rightRect, setRightRect] = useState<DOMRectReadOnly | null>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(0);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const leftEl = leftRef?.current;
    const rightEl = rightRef?.current;
    if (!leftEl || !rightEl) return;

    const observer = new ResizeObserver(() => {
      setLeftRect(leftEl.getBoundingClientRect());
      setRightRect(rightEl.getBoundingClientRect());
    });

    observer.observe(leftEl);
    observer.observe(rightEl);

    // Set initial rect
    setLeftRect(leftEl.getBoundingClientRect());
    setRightRect(rightEl.getBoundingClientRect());

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!leftRect || !rightRect) return;
    setTop(Math.max(leftRect.top, rightRect.top) + 5);
    setHeight(Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top) - 10);
    setLeft((leftRect.right + rightRect.left) / 2);
  }, [leftRect, rightRect]);
  return (
    <div
      className="absolute w-[1px] bg-white"
      style={{
        top,
        left,
        height,
      }}
    ></div>
  );
}
