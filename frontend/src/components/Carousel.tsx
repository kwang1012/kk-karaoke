import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { IconButton } from 'src/components/ui/button';
import { useBreakpointDown } from 'src/hooks/media';
import { cn } from 'src/lib/utils';

export default function Carousel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const mobile = useBreakpointDown('md');

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 0);
    setShowRight(Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth);
  };

  useEffect(() => {
    handleScroll(); // initial check, and again whenever the content changes
  }, [children]);

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const arrow = (side: 'left' | 'right') => (
    <IconButton
      aria-label={side === 'left' ? 'Scroll left' : 'Scroll right'}
      onClick={() => scrollBy(side === 'left' ? -1 : 1)}
      className={cn(
        'absolute top-1/3 z-10 size-9 border bg-popover/90 p-0 shadow-lg backdrop-blur',
        side === 'left' ? 'left-3' : 'right-3'
      )}
    >
      {side === 'left' ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </IconButton>
  );

  return (
    <div className={cn('relative', className)}>
      <div
        onScroll={handleScroll}
        ref={scrollRef}
        className="no-scrollbar flex w-auto min-w-full snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain scroll-smooth px-4"
      >
        {children}
      </div>
      {!mobile && showLeft && arrow('left')}
      {!mobile && showRight && arrow('right')}
    </div>
  );
}

export function CarouselItem({
  children,
  dense,
  active,
  disable,
  className = '',
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  dense?: boolean;
  active?: boolean;
  disable?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'shrink-0 cursor-pointer snap-start overflow-hidden rounded-xl text-pretty transition-colors duration-200',
        active ? 'bg-primary/15 ring-2 ring-primary' : 'hover:bg-accent',
        disable && 'pointer-events-none',
        dense ? 'p-1' : 'min-h-[200px] w-[176px] p-3',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
