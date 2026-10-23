import { CSS } from '@dnd-kit/utilities';
import { Fragment, useEffect, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  useSortable,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Track } from 'src/models/spotify';
import SongCard from './SongCard';
import { usePlayer } from 'src/store/player';
import { api } from 'src/utils/api';
import { useActiveRoomId, useRoomStore } from 'src/store/room';
import { useBreakpointDown } from 'src/hooks/media';
import { useT } from 'src/i18n';

function SortableItem({
  id,
  children,
  dragging,
  name,
}: { id: string; name: string; dragging?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, active } = useSortable({ id });
  const t = useT();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isActive = active?.id === id;
  const mobile = useBreakpointDown('md');

  return (
    <div
      ref={setNodeRef}
      {...(mobile ? {} : listeners)}
      {...(mobile ? {} : attributes)}
      className="my-0.5 flex items-center"
      style={{
        ...style,
        // The mobile overlay follows the finger; this row remains a fixed-size placeholder.
        ...(mobile && isActive && { transform: undefined, opacity: 0.3 }),
        touchAction: !mobile && dragging ? 'none' : 'manipulation',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        ...(isActive && !mobile && {
          scale: 0.98,
          zIndex: 50,
          borderRadius: 12,
          backgroundColor: 'var(--popover)',
          boxShadow: '0 0 0 2px var(--primary), var(--shadow-app)',
        }),
      }}
    >
      {mobile && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('queue.reorder', { name })}
          className="flex h-14 w-11 shrink-0 touch-none items-center justify-center rounded-lg text-muted-foreground select-none hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
          style={{ cursor: isActive ? 'grabbing' : 'grab' }}
        >
          <GripVertical aria-hidden="true" className="pointer-events-none size-6" />
        </button>
      )}
      {children}
    </div>
  );
}
/**
 * An extended "PointerSensor" that prevent some
 * interactive html element(button, input, textarea, select, option...) from dragging
 */
class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as any,
      handler: ({ nativeEvent: event }: PointerEvent) => {
        if (!event.isPrimary || event.button !== 0 || isInteractiveElement(event.target as Element)) {
          return false;
        }

        return true;
      },
    },
  ];
}

function isInteractiveElement(element: any | null) {
  return !!element?.closest?.('button, input, textarea, select, option, a, .interactive-section, [data-radix-popper-content-wrapper]');
}

function SortableList({
  items,
  children,
  onDragEnd,
  onDragStart,
  onDragCancel,
}: {
  items: string[];
  children: React.ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onDragCancel?: (event: DragStartEvent) => void;
}) {
  const mobile = useBreakpointDown('md');
  const sensors = useSensors(
    // Mobile events originate only from the handle, so no long press is needed.
    useSensor(mobile ? PointerSensor : SmartPointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <DndContext
      sensors={sensors}
      autoScroll={!mobile}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export default function TrackQueue({ tracks }: { tracks: Track[] }) {
  const { reorderQueue, queueIdx } = usePlayer();
  const { rmSongFromQueue } = usePlayer();
  const roomId = useRoomStore((state) => state.roomId);
  const activeRoomId = useActiveRoomId();
  const t = useT();
  // Songs people ordered come first; the ones the server suggested follow, under a heading (when nothing was
  // ordered, the section's own heading says so).
  const firstSuggested = tracks.findIndex((track) => track.recommended);
  const items = tracks.map((item) => item.uniqueId);
  const mobile = useBreakpointDown('md');
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragging = activeId !== null;
  const activeTrack = tracks.find((track) => track.uniqueId === activeId);
  useEffect(() => {
    if (!mobile || !dragging) return;
    const preventScroll = (event: TouchEvent) => event.preventDefault();
    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => document.removeEventListener('touchmove', preventScroll);
  }, [mobile, dragging]);
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = tracks.findIndex((track) => track.uniqueId === active.id);
      const newIndex = tracks.findIndex((track) => track.uniqueId === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const newItems = [...tracks];
      const [element] = newItems.splice(oldIndex, 1);
      newItems.splice(newIndex, 0, element);
      reorderQueue(newItems);
      // The offset 0 of the queue is at the offset queueIdx + 1 in the total queue.
      api
        .post(`queue/${activeRoomId}/reorder`, {
          oldIndex: queueIdx + oldIndex + 1,
          newIndex: queueIdx + newIndex + 1,
          id: roomId,
        })
        .catch((err) => {
          console.error(err);
        });
    }
  };
  const onInsert = (track: Track, index: number) => {
    const oldIndex = index;
    const newIndex = 0;
    const newItems = [...tracks];
    const [element] = newItems.splice(oldIndex, 1);
    newItems.splice(newIndex, 0, element);
    reorderQueue(newItems);
    // The offset 0 of the queue is at the offset queueIdx + 1 in the total queue.
    api
      .post(`queue/${activeRoomId}/reorder`, {
        oldIndex: queueIdx + oldIndex + 1,
        newIndex: queueIdx + newIndex + 1,
        id: roomId,
      })
      .catch((err) => {
        console.error(err);
      });
  };
  return (
    <SortableList
      onDragEnd={handleDragEnd}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      items={items}
    >
      {tracks.map((track, index) => (
        <Fragment key={track.uniqueId}>
          {index === firstSuggested && index > 0 && (
            <div className="px-2 pt-4 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t('queue.suggested')}
            </div>
          )}
          <SortableItem id={track.uniqueId} name={track.name} dragging={dragging}>
            <SongCard
              className="flex-1"
              track={track}
              onInsert={() => onInsert(track, index)}
              onDelete={() => rmSongFromQueue(track)}
            />
          </SortableItem>
        </Fragment>
      ))}
      {mobile && createPortal(
        <DragOverlay dropAnimation={null}>
          {activeTrack && (
            <div aria-hidden="true" className="pointer-events-none flex items-center rounded-xl bg-card shadow-app ring-2 ring-primary">
              <div className="flex h-14 w-11 shrink-0 items-center justify-center text-muted-foreground">
                <GripVertical className="size-6" />
              </div>
              <SongCard className="min-w-0 flex-1" track={activeTrack} disableHover />
            </div>
          )}
        </DragOverlay>,
        document.body
      )}
    </SortableList>
  );
}
