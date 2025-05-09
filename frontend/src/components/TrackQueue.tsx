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
import type { PointerEvent } from 'react';
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
export default function TrackQueue({ tracks }: { tracks: Track[] }) {
  const { currentSong, queue, setQueue, queueIdx } = usePlayer();
  const { addToQueue, getRandomTracks, rmFromQueue, rmSongFromQueue } = usePlayer();
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = tracks.findIndex((track) => track.index.toString() === active.id);
      const newIndex = tracks.findIndex((track) => track.index.toString() === over?.id);
      const newItems = [...queue];
      newItems.splice(oldIndex, 1);
      const activeItem = tracks[Number(active.id)];
      newItems.splice(newIndex, 0, activeItem);
      setQueue(newItems);
    }
  };
  return (
    <SortableList onDragEnd={handleDragEnd} items={tracks.map((item) => item.index.toString())}>
      {tracks.map((track, index) => (
        <SortableItem key={track.index} id={track.index.toString()}>
          <SongCard key={index} className="mt-1" track={track} onDelete={() => rmSongFromQueue(track, index + 1)} />
        </SortableItem>
      ))}
    </SortableList>
  );
}
