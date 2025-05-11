import { CSS } from '@dnd-kit/utilities';
import {
  DndContext,
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Track } from 'src/models/spotify';
import SongCard from './SongCard';
import { usePlayer } from 'src/hooks/player';

function SortableItem({ id, children }: { id: string; children?: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={style}>
      {children}
    </div>
  );
}
import { useMemo, type PointerEvent } from 'react';
/**
 * An extended "PointerSensor" that prevent some
 * interactive html element(button, input, textarea, select, option...) from dragging
 */
export class SmartPointerSensor extends PointerSensor {
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

function isInteractiveElement(element: Element | null) {
  const interactiveElements = ['button', 'input', 'textarea', 'select', 'option', 'svg', 'path'];
  if (element?.classList?.contains('MuiBackdrop-root')) return true;
  if (element?.tagName && interactiveElements.includes(element.tagName.toLowerCase())) {
    return true;
  }

  return false;
}

function SortableList({
  items,
  children,
  onDragEnd,
}: {
  items: string[];
  children: React.ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(SmartPointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const onDragStart = (event: DragStartEvent) => {
    if ((event.active?.data?.current?.target as HTMLElement)?.tagName === 'BUTTON') {
      event.activatorEvent.preventDefault();
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} onDragStart={onDragStart}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

function getUniqueId(track: Track) {
  return track.index.toString() + track.timeAdded.toString();
}
export default function TrackQueue({ tracks }: { tracks: Track[] }) {
  const { queue, setQueue } = usePlayer();
  const { rmSongFromQueue } = usePlayer();
  const realQueue = queue.slice(1);
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = tracksWithUniqueId.findIndex((track) => track.uniqueId === active.id);
      const newIndex = tracksWithUniqueId.findIndex((track) => track.uniqueId === over?.id);
      const newItems = [...realQueue];
      newItems.splice(oldIndex, 1);
      const activeItem = realQueue[oldIndex];
      newItems.splice(newIndex, 0, activeItem);
      setQueue((prev) => [prev[0], ...newItems]);
    }
  };
  const tracksWithUniqueId = useMemo(() => {
    return tracks.map((track) => ({
      uniqueId: getUniqueId(track),
      ...track,
    }));
  }, [tracks]);
  return (
    <SortableList onDragEnd={handleDragEnd} items={tracksWithUniqueId.map((item) => item.uniqueId)}>
      {tracksWithUniqueId.map((track, index) => (
        <SortableItem key={track.uniqueId} id={track.uniqueId}>
          <SongCard className="mt-1" track={track} onDelete={() => rmSongFromQueue(track, index + 1)} />
        </SortableItem>
      ))}
    </SortableList>
  );
}
