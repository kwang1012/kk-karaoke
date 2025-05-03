import React, { useEffect, useRef, useState } from 'react';

export default function Carousel({ children, className = '' }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

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
      {showLeft && (
        <div
          className="absolute top-0 left-0 z-2 h-full w-12 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(to right, #1f1f1f, transparent)',
          }}
        />
      )}

      {/* Right shadow */}
      {showRight && (
        <div
          className="absolute top-0 right-0 z-2 h-full w-12 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(to left, #1f1f1f, transparent)',
          }}
        />
      )}
    </div>
  );
}
