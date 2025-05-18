import { useEffect, useMemo, useState } from 'react';
import { Transforms, Editor, Descendant, createEditor } from 'slate';
import { Editable, Slate, withReact } from 'slate-react';
import { Lyrics, Track } from 'src/models/spotify';
import { api } from 'src/utils/api';
import { styled } from '@mui/material/styles';
import { withHistory } from 'slate-history';

const LYRICS_REGEX = /^\[\d{2}:\d{2}(?:\.\d{2,3})] ?(.+)?$/;

function validateLRCLine(line: string) {
  return line.trim() === '' || LYRICS_REGEX.test(line);
}

const Element = ({ attributes, children, element }) => {
  switch (element.type) {
    case 'lrc-line':
      return (
        <div {...attributes} style={{ lineHeight: 2, whiteSpace: 'pre-wrap' }}>
          {children}
        </div>
      );
    case 'timestamp':
      const ts = `[${element.children[0].text}]`;
      const valid = validateLRCLine(ts);
      return <span {...attributes}>{ts}</span>;
    case 'span':
      return (
        <span
          {...attributes}
          style={
            {
              // color: '#cacaca',
              // fontSize: 18,
              // fontWeight: 'normal',
            }
          }
        >
          {children}
        </span>
      );
    default:
      return <p {...attributes}>{children}</p>;
  }
};
const EditorWrapper = styled('div')(({ theme }) => ({
  width: '100%',
  height: '100%',
  border: '1px solid #4f4f4f',
  overflow: 'hidden',
  borderRadius: 8,
  padding: 16,
}));

export default function LyricsEditor({ track, progress }: { track: Track; progress?: number }) {
  const editor = useMemo(() => withHistory(withReact(createEditor())), []);

  const initialValue: Descendant[] = [
    {
      type: 'lrc-line',
      children: [
        {
          type: 'timestamp',
          children: [{ text: '00:00.00' }],
        },
        { type: 'span', text: '' },
      ],
    },
  ];

  const [currentTime, setCurrentTime] = useState(0);
  const [isTwoDigits, setIsTwoDigits] = useState(false);
  useEffect(() => {
    if (!track.id) return;
    api
      .get(`/lyrics/${track.id}`)
      .then(({ data }) => {
        // setLyrics(data.lyrics);
        const firstLine = data.content.split('\n')[0];
        const matched = firstLine.match(/:(\d{2})\.(\d+)/);
        if (matched) {
          setIsTwoDigits(matched[2].length === 2);
        }
        insertLyrics(data.content);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [track.id]);

  const insertTimestamp = () => {
    const now = new Date();
    const sec = now.getSeconds();
    const min = now.getMinutes();
    const ms = now.getMilliseconds();
    const ts = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;

    Transforms.insertNodes(editor, {
      type: 'lrc-line',
      children: [
        { type: 'timestamp', text: ts },
        { type: 'span', text: '' },
      ],
    });
  };
  const insertLyrics = (content: string) => {
    const lines = content.split('\n');
    const newLines: Descendant[] = lines.map((line) => {
      const [rawTime, ...rest] = line.split(']');
      const timestamp = rawTime.replace('[', '');
      const text = rest.join(']').trim();
      return {
        type: 'lrc-line',
        children: [
          { type: 'timestamp', children: [{ text: timestamp }] },
          { type: 'span', children: [{ text: ' ' + text }] },
        ],
      };
    });
    // if (editor.children.length > 0) {
    //   Transforms.delete(editor, {
    //     at: {
    //       anchor: Editor.start(editor, []),
    //       focus: Editor.end(editor, []),
    //     },
    //   });
    // }
    Transforms.insertNodes(editor, newLines, { at: [editor.children.length] });
  };
  return (
    <EditorWrapper className="scrollbar">
      {/* <button onClick={insertTimestamp} style={{ marginBottom: 8 }}>
        Insert Current Timestamp
      </button> */}
      <Slate editor={editor} initialValue={initialValue}>
        <Editable
          renderElement={(props) => <Element {...props} />}
          style={{ fontSize: 18, outline: 'none', minHeight: 300 }}
        />
      </Slate>
    </EditorWrapper>
  );
}
