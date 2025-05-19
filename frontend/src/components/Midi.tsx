import React, { useEffect } from 'react';

type NoteEvent = {
  note: number; // MIDI note number
  start: number; // seconds
  end: number; // seconds
};

type Midi = {
  noteEvents: NoteEvent[];
  minNote: number;
  maxNote: number;
};

type PitchGuideProps = {
  currentTime: number; // current playback time (sec)
  width?: number;
  height?: number;
  midi: Midi;
};

const midiNoteToName = (note: number) => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  return `${names[note % 12]}${octave}`;
};

export default function Midi({ currentTime, width = 800, height = 100, midi }: PitchGuideProps) {
  const secondsPerPixel = 0.005; // adjust for zoom level
  const pixelsPerNote = height / (midi.maxNote - midi.minNote);

  const totalDuration = Math.max(...midi.noteEvents.map((n) => n.end)); // in seconds
  const svgWidth = totalDuration / secondsPerPixel;
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const animationRef = React.useRef<number>();

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    let running = true;

    const animate = () => {
      if (!running || !scrollEl) return;

      const targetScrollLeft = currentTime / secondsPerPixel - scrollEl.clientWidth / 2;

      // Smooth scroll approach
      const delta = targetScrollLeft - scrollEl.scrollLeft;
      scrollEl.scrollLeft += delta * 0.2; // interpolation factor

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [currentTime]);

  return (
    <div className="w-full relative">
      <div ref={scrollRef} className="no-scrollbar w-full overflow-x-auto">
        <svg width={svgWidth} height={height}>
          {/* Note bars */}
          {midi.noteEvents.map((note, i) => {
            const x = note.start / secondsPerPixel;
            const duration = note.end - note.start;
            const barWidth = Math.max(2, duration / secondsPerPixel);
            const y = (midi.maxNote - note.note) * pixelsPerNote;

            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={pixelsPerNote * 0.9}
                  fill="#4fc3f7"
                  stroke="white"
                  strokeWidth={0.5}
                />
              </g>
            );
          })}

          {/* Playhead */}
          <line x1={width / 2} x2={width / 2} y1={0} y2={height} stroke="red" strokeWidth={2} />
        </svg>
      </div>

      {/* fixed playhead */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: '2px',
          background: 'red',
          transform: 'translateX(-1px)',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
    </div>
  );
}
