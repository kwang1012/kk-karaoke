import { Table, TableHeader as TableHead, TableRow, TableCell, TableBody } from 'src/components/ui/table';
import { useBreakpointDown } from 'src/hooks/media';
import { cn } from 'src/lib/utils';
import { forwardRef, useContext, useEffect, useRef } from 'react';
import { Track } from 'src/models/spotify';
import PlaylistRow, { getColWidth, HoverTableRow } from './Row';
import { PlaylistContext } from 'src/context/playlist';
import { TableComponents, TableVirtuoso } from 'react-virtuoso';
import { usePlaylistStore } from 'src/store/playlist';
import { useT } from 'src/i18n';

const VirtuosoTableComponents: TableComponents<Track> = {
  Table: (props) => {
    const { collection, collectionType, collectionImage, color, setIsSticky, scrollTop, setHalfway } = useContext(PlaylistContext);
    const t = useT();

    const headerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!headerRef.current) return;
      setIsSticky(scrollTop > headerRef.current.clientHeight - 74); // header top + 10
      setHalfway(scrollTop > headerRef.current.clientHeight - 104);
    }, [scrollTop, headerRef.current]);
    return (
      <>
        <div
          ref={headerRef}
          className="grid h-[335px] grid-cols-1 place-items-center p-[5px] pt-[15px] md:h-[200px] md:grid-cols-[auto_1fr] md:p-5"
          style={{
            backgroundImage: `linear-gradient(to bottom, ${color}, ${color}40)`,
          }}
        >
          <div className="title h-full w-full max-w-[400px] shrink-0 max-md:px-[75px] max-md:pb-2.5 md:w-40">
            <img referrerPolicy="no-referrer" src={collectionImage} className="size-full rounded-xl object-cover shadow-2xl" alt={collection.name} />
          </div>
          <div className="ml-4 flex w-full flex-col justify-center text-white md:justify-end md:self-end">
            <span className="text-xs font-medium tracking-wide uppercase opacity-80">{collectionType === 'album' ? t('playlist.type.album') : t('playlist.type.playlist')}</span>
            <span className="line-clamp-2 text-2xl font-extrabold leading-tight tracking-tight md:text-5xl">{collection.name}</span>
            <div className="mt-2 line-clamp-1 text-sm opacity-80">{collection.description}</div>
          </div>
        </div>
        <Table {...props} style={{ ...props.style, tableLayout: 'fixed' }}></Table>
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
  const t = useT();
  const { headers, isSticky } = useContext(PlaylistContext);
  const mobile = useBreakpointDown('md');
  return (
    <TableRow>
      {headers.map((header) => (
        <TableCell
          key={header.key}
          style={{
            width: getColWidth(header.key),
            top: mobile ? 48 : 64,
            backgroundColor: isSticky ? 'var(--card)' : 'transparent',
          }}
          className={cn(
            'sticky z-10 border-b p-4 text-xs font-medium tracking-wide text-muted-foreground uppercase',
            header.key == 'row_id' ? 'text-center' : 'text-left'
          )}
        >
          {header.label === '#' ? '#' : header.label && t(header.label)}
        </TableCell>
      ))}
    </TableRow>
  );
}

export default function PlaylistTable({ tracks }: { tracks: Track[] }) {
  const { setScrollTop } = useContext(PlaylistContext);
  return (
    <div className="h-full w-full">
      <TableVirtuoso
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
