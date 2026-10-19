import { Pencil } from 'lucide-react';
import { Button, IconButton } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { cn } from 'src/lib/utils';
import { useRef, useMemo, useEffect, useState } from 'react';
import { Lyrics, Track } from 'src/models/spotify';
import * as OpenCC from 'opencc-js';
import { api } from 'src/utils/api';
const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

const LYRICS_REGEX = /^\[\d{2}:\d{2}(?:\.\d{2,3})] ?(.+)?$/;

function validateLRCLine(line: string) {
  return line.trim() === '' || LYRICS_REGEX.test(line);
}

function isValidLRC(input: string) {
  const lines = input.trim().split(/\r?\n/);

  // At least one line should match LRC format
  let validLines = 0;
  for (const line of lines) {
    if (line.trim() === '') continue;
    if (LYRICS_REGEX.test(line)) {
      validLines++;
    } else {
      return false; // invalid format line found
    }
  }

  return validLines > 0;
}

export default function LyricsEditor({ track, progress }: { track: Track; progress?: number }) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [lyrics, setLyrics] = useState<Lyrics[]>([]);
  const modified = content !== originalContent;
  const [delay, setDelay] = useState(0);
  const [editing, setEditing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const [currentLine, setCurrentLine] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [isTwoDigits, setIsTwoDigits] = useState(false);

  const syncScroll = () => {
    if (highlightRef.current && textareaRef.current && lineNumbersRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
      lineNumbersRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };
  const lines = content.split('\n');
  const lineNumbers = useMemo(() => {
    return lines.map((_, i) => i + 1);
  }, [lines]);
  const highlighted = useMemo(
    () =>
      lines.map((line, i) => {
        const isValid = validateLRCLine(line);

        return (
          <div
            className={cn(
              'text-lg/loose text-transparent',
              !isValid && 'underline decoration-primary decoration-2 underline-offset-4',
              i === currentLine &&
                'z-[2] animate-[highlight_1s_ease-in-out_infinite] bg-[linear-gradient(90deg,var(--primary),var(--primary))] bg-[length:100%_200%] bg-[position:0%_0%] bg-clip-text [-webkit-text-fill-color:transparent]'
            )}
            key={i}
          >
            {isValid ? line : line.split(' ')[0]}
          </div>
        );
      }),
    [lines]
  );

  useEffect(() => {
    if (!track.id) return;
    api
      .get(`/lyrics/${track.id}`)
      .then(({ data }) => {
        setContent(data.content);
        setOriginalContent(data.content);
        setLyrics(data.lyrics);
        const firstLine = data.content.split('\n')[0];
        const matched = firstLine.match(/:(\d{2})\.(\d+)/);
        if (matched) {
          setIsTwoDigits(matched[2].length === 2);
        }
      })
      .catch((err) => {
        console.error(err);
        setContent('');
        setOriginalContent('');
        setLyrics([]);
      });
  }, [track.id]);

  useEffect(() => {
    if (progress) setCurrentTime(progress);
    if (!lyrics) {
      return;
    }
    const index = lyrics.findIndex((line, i) => {
      return currentTime >= line.time && (i === lyrics.length - 1 || currentTime < lyrics[i + 1].time);
    });
    if (index !== currentLine) {
      setCurrentLine(index);
    }
  }, [progress, lyrics]);

  const [status, setStatus] = useState('');
  const showStatus = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(''), 2000);
  };
  const onSave = (content: string) => {
    const isValid = isValidLRC(content);
    if (!isValid) {
      showStatus('Invalid LRC format');
    } else {
      api
        .post(`/lyrics/${track.id}/update`, { content })
        .then(() => {
          showStatus('Saved successfully');
          setEditing(false);
          setOriginalContent(content);
        })
        .catch((err) => {
          console.error(err);
          showStatus('Failed to save');
        });
    }
  };
  const onCancel = () => {
    setContent(originalContent);
    setEditing(false);
  };

  return (
    <>
      <div className="grid h-full w-full grid-rows-[auto_1fr] gap-5 p-2">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-2xl">
            ♪ {track.name}
            <span className="ml-2 text-sm text-muted-foreground">{track.artists.map((artist) => artist.name).join(', ')}</span>
          </h1>
          <div className="flex items-center">
            {status && <span className="mr-3 text-sm text-muted-foreground" role="status">{status}</span>}
            {editing ? (
              <>
                <Button
                  variant="outline"
                  className="mr-2 bg-transparent"
                  onClick={onCancel}
                >
                  Cancel changes
                </Button>
                <Button disabled={!modified} onClick={() => onSave(content)}>
                  Save changes
                </Button>
              </>
            ) : (
              <IconButton onClick={() => setEditing(true)}>
                <Pencil className="size-5" />
              </IconButton>
            )}
          </div>
        </div>
        <div className="h-full w-full overflow-hidden rounded-xl border">
          {/* Toolbar */}
          {editing && (
            <div className="w-full border-b bg-muted p-2">
              <div className="relative mr-2 inline-flex w-[150px] items-center align-middle">
                <label className="absolute -top-2 left-2 bg-muted px-1 text-xs text-muted-foreground">Offset (s)</label>
                <Input
                  type="number"
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                  className="pr-16"
                />
                <Button variant="ghost" size="sm" className="absolute right-0 bg-accent text-muted-foreground hover:text-foreground">
                  Apply
                </Button>
              </div>
              <Button
                variant="outline"
                className="bg-transparent px-2 text-muted-foreground"
                onClick={() => setContent(converter(content))}
              >
                {'簡→繁'}
              </Button>
              <Button
                variant="outline"
                className="ml-2 bg-transparent px-2 text-muted-foreground"
                onClick={() => {
                  const ta = textareaRef.current;
                  if (!ta) return;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  if (start && end) {
                    // ta.selection
                    const min = Math.floor(currentTime / 60);
                    const sec = Math.floor(currentTime % 60);
                    const msec = Math.floor((currentTime % 1) * 1000);
                    const time = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(
                      msec
                    ).padStart(isTwoDigits ? 2 : 3, '0')}`;
                    const current = ta.value;
                    ta.value = current.slice(0, start) + time + current.slice(end);
                    ta.setSelectionRange(start + time.length, start + time.length);
                  }
                }}
              >
                Current time
              </Button>
            </div>
          )}
          <div className="relative h-full w-full overflow-hidden bg-background p-4 pl-14 text-foreground">
            <div ref={highlightRef} className="no-scrollbar pointer-events-none absolute inset-y-4 right-4 left-14 z-[1] overflow-hidden">
              {highlighted}
              <div className="h-[100px]"></div>
            </div>
            <div ref={lineNumbersRef} className="no-scrollbar pointer-events-none absolute inset-y-4 left-4 z-[1] w-10 overflow-hidden text-sm/loose text-muted-foreground">
              {lineNumbers.map((lineNumber) => (
                <div key={lineNumber} className="flex h-9 w-full items-center justify-end pr-5 font-semibold">{lineNumber}</div>
              ))}
            </div>
            <textarea
              disabled={!editing}
              ref={textareaRef}
              onScroll={syncScroll}
              className="z-10 h-full w-full resize-none bg-transparent p-0 text-lg/loose outline-none"
              spellCheck={false}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
              }}
            />
          </div>
        </div>
      </div>

    </>
  );
}
