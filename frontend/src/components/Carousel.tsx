import { useMediaQuery } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';

export default function Carousel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;

    setShowLeft(el.scrollLeft > 0);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth);
  };

  useEffect(() => {
    handleScroll(); // initial check
  }, []);

  return (
    <div className={`relative ${className}`}>
      <div
        onScroll={handleScroll}
        ref={scrollRef}
        className="scroll-px-4 px-4 whitespace-nowrap flex overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth min-w-full w-auto overscroll-x-contain"
      >
        {children}
      </div>

      {/* Left shadow */}
      {showLeft && !mobile && (
        <div
          className="absolute top-0 left-0 z-2 h-full w-12 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(to right, #121212, transparent)',
          }}
        />
      )}

      {/* Right shadow */}
      {showRight && !mobile && (
        <div
          className="absolute top-0 right-0 z-2 h-full w-12 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(to left, #121212, transparent)',
          }}
        />
      )}
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
      className={[
        'duration-300 cursor-pointer shrink-0 rounded-md snap-start overflow-hidden text-pretty',
        active ? 'bg-white/30 shadow-lg' : 'hover:bg-[#ffffff1a]',
        disable ? 'pointer-events-none hover:bg-[none]' : '',
        dense ? 'p-1' : 'p-3 w-[177px] min-h-[200px]',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
