import { styled } from '@mui/material/styles';
import { useRef, useState, useMemo } from 'react';
const TextArea = styled('textarea')(({ theme }) => ({
  width: '100%',
  height: '100%',
  outline: 'none',
  resize: 'none',
  fontSize: 20,
  lineHeight: 2,
}));
const LrcWrapper = styled('div')(({ theme }) => ({
  position: 'relative',
  width: '100%',
  height: '100%',
  color: '#fff',
  borderRadius: 8,
  padding: 16,
  border: '1px solid #4f4f4f',
  overflow: 'hidden',
}));
const LrcHighlight = styled('div')(({ theme }) => ({
  position: 'absolute',
  top: 16,
  left: 16,
  bottom: 16,
  right: 16,
  pointerEvents: 'none',
  overflow: 'hidden',
  zIndex: 1,
}));
const Highlight = styled('div')(({ theme }) => ({
  fontSize: 20,
  lineHeight: 2,
  '& span': {
    color: '#fff',
  },
  '& span.underline-red': {
    textDecoration: 'underline',
    textDecorationColor: '#fa6171',
    textDecorationThickness: '2px',
    textUnderlineOffset: '4px',
  },
}));

const LYRICS_REGEX = /^\[\d{2}:\d{2}(?:\.\d{2,3})] ?(.+)?$/;

function validateLRCLine(line: string) {
  return line.trim() === '' || LYRICS_REGEX.test(line);
}

export default function LyricsEditor({
  content,
  editing,
  onChange,
}: {
  content: string;
  editing: boolean;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const syncScroll = () => {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };
  const lines = content.split('\n');
  const highlighted = useMemo(
    () =>
      lines.map((line, i) => {
        const isValid = validateLRCLine(line);
        return (
          <Highlight key={i}>{isValid ? line : <span className="underline-red">{line.split(' ')[0]}</span>}</Highlight>
        );
      }),
    [lines]
  );

  return (
    <LrcWrapper>
      <LrcHighlight ref={highlightRef} className="no-scrollbar">
        {highlighted}
      </LrcHighlight>
      <TextArea
        disabled={!editing}
        ref={textareaRef}
        onScroll={syncScroll}
        className="scrollbar z-10"
        spellCheck={false}
        value={content}
        onChange={onChange}
      />
    </LrcWrapper>
  );
}
