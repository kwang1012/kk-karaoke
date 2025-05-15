import { Table, TableHead, TableRow, TableCell, TableBody, useMediaQuery, useTheme } from '@mui/material';
import { forwardRef, useContext, useEffect, useRef, useState } from 'react';
import { Track } from 'src/models/spotify';
import PlaylistRow, { getColWidth, HoverTableRow } from './Row';
import { PlaylistContext } from 'src/context/playlist';
import { TableComponents, TableVirtuoso } from 'react-virtuoso';
import { usePlaylistStore } from 'src/store/playlist';
import { styled } from '@mui/material/styles';
import { useOverlayScrollbars } from 'overlayscrollbars-react';

const Header = styled('div')(({ theme }) => ({
  display: 'grid',
  padding: 20,
  placeItems: 'center',
  gridTemplateColumns: 'auto 1fr',
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '1fr',
    padding: 5,
    paddingTop: 15,
    '& .title': {
      padding: '0 75px 10px 75px',
    },
  },
}));
const VirtuosoTableComponents: TableComponents<Track> = {
  Table: (props) => {
    const { collection, collectionImage, color, setIsSticky, scrollTop, setHalfway } = useContext(PlaylistContext);

    const headerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!headerRef.current) return;
      setIsSticky(scrollTop > headerRef.current.clientHeight - 74); // header top + 10
      setHalfway(scrollTop > headerRef.current.clientHeight - 104);
    }, [scrollTop, headerRef]);
    return (
      <>
        <Header
          ref={headerRef}
          className="h-[335px] md:h-[200px]"
          style={{
            backgroundImage: `linear-gradient(to bottom, ${color}, ${color}40)`,
          }}
        >
          <div className="title h-full shrink-0 w-full md:w-40 max-w-[400px]">
            <img src={collectionImage} className="w-full h-full object-cover rounded-md" alt={collection.name} />
          </div>
          <div className="ml-4 flex flex-col justify-center md:justify-start w-full">
            <span className="text-2xl md:text-4xl font-bold line-clamp-2 leading-tight">{collection.name}</span>
            <div className="text-sm text-gray-200 mt-1 line-clamp-1">{collection.description}</div>
          </div>
        </Header>
        <Table {...props} stickyHeader style={{ tableLayout: 'fixed' }}></Table>
      </>
    );
  },
  TableHead: forwardRef<HTMLTableSectionElement>((props, ref) => <TableHead {...props} ref={ref} />),
  TableRow: (props) => {
    const index = props['data-index'];
    const menuStatus = usePlaylistStore((state) => state.menuOpenStatus);
    return <HoverTableRow {...props} className={menuStatus[index] ? 'active' : ''} />;
  },
  TableBody: forwardRef<HTMLTableSectionElement>((props, ref) => <TableBody {...props} ref={ref} />),
};

function fixedHeaderContent() {
  const { headers, isSticky } = useContext(PlaylistContext);
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const theme = useTheme();
  return (
    <TableRow
      sx={{
        '& th': {
          borderColor: '#b3b3b3',
          bgcolor: isSticky ? (theme.palette.mode === 'dark' ? '#1a1a1a' : 'white') : 'transparent',
          top: mobile ? 48 : 64,
        },
      }}
    >
      {headers.map((header) => (
        <TableCell
          key={header.key}
          width={getColWidth(header.key)}
          align={header.key == 'row_id' ? 'center' : 'left'}
          sx={{ color: '#b3b3b3', padding: 2 }}
        >
          {header.label}
        </TableCell>
      ))}
    </TableRow>
  );
}

export default function PlaylistTable({ tracks }: { tracks: Track[] }) {
  const { setScrollTop } = useContext(PlaylistContext);
  const rootRef = useRef(null);
  const [scroller, setScroller] = useState<any>(null);
  const [initialize, osInstance] = useOverlayScrollbars({
    options: {
      overflow: {
        x: 'hidden',
        y: 'scroll',
      },
      scrollbars: {
        autoHide: 'leave',
        autoHideDelay: 500,
      },
    },
  });

  useEffect(() => {
    const { current: root } = rootRef;

    if (scroller && root) {
      initialize({
        target: root,
        elements: {
          viewport: scroller,
        },
      });
    }

    return () => osInstance()?.destroy();
  }, [scroller, initialize, osInstance]);
  return (
    <div data-overlayscrollbars-initialize="" className="w-full h-full" ref={rootRef}>
      <TableVirtuoso
        scrollerRef={setScroller}
        data={tracks}
        components={VirtuosoTableComponents}
        fixedHeaderContent={fixedHeaderContent}
        increaseViewportBy={{ top: 800, bottom: 800 }}
        onScroll={(e) => setScrollTop((e.target as HTMLElement).scrollTop)}
        itemContent={(index, track) => <PlaylistRow index={index} track={track} />}
      />
    </div>
  );
}
