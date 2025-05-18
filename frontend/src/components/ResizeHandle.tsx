import { styled } from '@mui/material/styles';
import { useEffect, useRef, useState } from 'react';

const Handle = styled('div')(({ theme }) => ({
  position: 'absolute',
  cursor: 'grab',
  zIndex: 10,
  '&:active': {
    cursor: 'grabbing',
  },
  '& div': {
    backgroundColor: 'transparent',
    transition: 'background-color 0.2s ease-in-out',
    borderRadius: 4,
  },
  '&:hover div': {
    backgroundColor: '#535353',
  },
  '&.active div': {
    backgroundColor: 'white',
  },
}));
const INSET_SIZE = 10;
export default function ResizeHandle({
  leftRef,
  rightRef,
}: {
  leftRef?: React.RefObject<HTMLDivElement>;
  rightRef?: React.RefObject<HTMLDivElement>;
}) {
  const [leftRect, setLeftRect] = useState<DOMRectReadOnly | null>(null);
  const [rightRect, setRightRect] = useState<DOMRectReadOnly | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);

  // Memoize original sizes
  const initialLeftWidth = useRef<number | null>(null);
  const initialRightWidth = useRef<number | null>(null);
  const initialWidth = useRef<number | null>(null);
  const initialContainerWidth = useRef<number | null>(null);

  useEffect(() => {
    const handleResize = (e: Event) => {
      if (!leftRef?.current || !rightRef?.current) return;
      const leftBox = leftRef.current.getBoundingClientRect();
      const rightBox = rightRef.current.getBoundingClientRect();
      setLeftRect(leftBox);
      setRightRect(rightBox);
      // Reset the widths to auto to recalculate
      leftRef.current.style.width = '';
      rightRef.current.style.width = '';
      initialLeftWidth.current = leftBox.width;
      initialRightWidth.current = rightBox.width;
      initialContainerWidth.current = rightBox.right - leftBox.left;
      initialWidth.current = rightBox.left - leftBox.right;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [leftRef?.current, rightRef?.current]);

  useEffect(() => {
    const leftEl = leftRef?.current;
    const rightEl = rightRef?.current;
    const handleEl = handleRef.current;
    if (!leftEl || !rightEl || !handleEl) return;

    let frameId: number | null = null;

    const updateRects = () => {
      const leftBox = leftEl.getBoundingClientRect();
      const rightBox = rightEl.getBoundingClientRect();
      setLeftRect(leftBox);
      setRightRect(rightBox);
      handleEl.style.top = `${Math.max(leftBox.top, rightBox.top) + INSET_SIZE}px`;
      handleEl.style.height = `${
        Math.min(leftBox.bottom, rightBox.bottom) - Math.max(leftBox.top, rightBox.top) - 2 * INSET_SIZE
      }px`;
      handleEl.style.left = `${leftBox.right}px`;
      handleEl.style.width = `${rightBox.left - leftBox.right}px`;

      // Only set initial values once
      if (initialLeftWidth.current === null) {
        initialLeftWidth.current = leftBox.width;
        initialRightWidth.current = rightBox.width;
        initialContainerWidth.current = rightBox.right - leftBox.left;
        initialWidth.current = rightBox.left - leftBox.right;
      }
    };

    const observer = new ResizeObserver(() => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateRects);
    });

    observer.observe(leftEl);
    observer.observe(rightEl);

    updateRects(); // Initial

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  const handleMouseUp = () => {
    setIsDragging(false);
    document.body.style.cursor = ''; // Reset to default
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!leftRef?.current || !rightRef?.current || !leftRect || !rightRect || !handleRef.current) return;

    const containerWidth = initialContainerWidth.current;
    const width = initialWidth.current;
    if (!containerWidth || !width) return;
    const dx = e.clientX - leftRect.right;

    const computedLeft = window.getComputedStyle(leftRef.current);
    const computedRight = window.getComputedStyle(rightRef.current);

    const minLeft = parseFloat(computedLeft.minWidth || '50');
    const maxLeft = parseFloat(computedLeft.maxWidth || `${containerWidth}`);
    const minRight = parseFloat(computedRight.minWidth || '50');
    const maxRight = parseFloat(computedRight.maxWidth || `${containerWidth}`);

    let newLeftWidth = leftRect.width + dx;
    if (!isNaN(minLeft) && newLeftWidth < minLeft) {
      newLeftWidth = minLeft;
    }
    if (!isNaN(maxLeft) && newLeftWidth > maxLeft) {
      newLeftWidth = maxLeft;
    }

    let newRightWidth = containerWidth - newLeftWidth - width;
    if (!isNaN(minRight) && newRightWidth < minRight) {
      newRightWidth = minRight;
    }
    if (!isNaN(maxRight) && newRightWidth > maxRight) {
      newRightWidth = maxRight;
    }

    // Re-adjust if one side hits its limit
    const totalWidth = newLeftWidth + newRightWidth + width;
    if (totalWidth > containerWidth) {
      const overflow = totalWidth - containerWidth;
      if (newLeftWidth > minLeft || isNaN(minLeft)) {
        newLeftWidth -= overflow;
      } else if (isNaN(minRight)) {
        newRightWidth -= overflow;
      }
    } else if (totalWidth < containerWidth) {
      const underflow = containerWidth - totalWidth;
      if (newLeftWidth < maxLeft || isNaN(maxLeft)) {
        newLeftWidth += underflow;
      } else if (isNaN(maxRight)) {
        newRightWidth += underflow;
      }
    }

    leftRef.current.style.width = `${newLeftWidth}px`;
    rightRef.current.style.width = `${newRightWidth}px`;
    // 🔥 Sync handle immediately with DOM
    const leftBox = leftRef.current.getBoundingClientRect();
    const rightBox = rightRef.current.getBoundingClientRect();
    handleRef.current.style.left = `${leftBox.right}px`;
    handleRef.current.style.width = `${rightBox.left - leftBox.right}px`;
  };

  useEffect(() => {
    if (!isDragging) return;
    document.body.style.cursor = 'grabbing';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = ''; // Always cleanup
    };
  }, [isDragging, leftRef, rightRef, leftRect, rightRect]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    document.body.style.cursor = 'grabbing';
  };
  const handleDoubleClick = () => {
    if (!leftRef?.current || !rightRef?.current || !initialLeftWidth.current || !initialRightWidth.current) return;

    const leftWidth = initialLeftWidth.current;
    const rightWidth = initialRightWidth.current;
    leftRef.current.style.width = `${leftWidth}px`;
    rightRef.current.style.width = `${rightWidth}px`;
  };

  return (
    <Handle
      className={isDragging ? 'active' : ''}
      ref={handleRef}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div className="w-[1px] h-full mx-auto"></div>
    </Handle>
  );
}
