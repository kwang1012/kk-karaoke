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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Track } from 'src/models/spotify';
import SongCard from './SongCard';
import { usePlayer } from 'src/store/player';

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
import { api } from 'src/utils/api';
import { useActiveRoomId, useRoomStore } from 'src/store/room';
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

function isInteractiveElement(element: any | null) {
  const interactiveParent = element.closest('.interactive-section');
  if (interactiveParent) return true;
  const interactiveElements = ['button', 'input', 'textarea', 'select', 'option'];
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
  const { reorderQueue, queueIdx } = usePlayer();
  const { rmSongFromQueue } = usePlayer();
  const roomId = useRoomStore((state) => state.roomId);
  const activeRoomId = useActiveRoomId();
  const items = tracks.map((item) => item.uniqueId);
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = tracks.findIndex((track) => track.uniqueId === active.id);
      const newIndex = tracks.findIndex((track) => track.uniqueId === over?.id);
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
  return (
    <SortableList onDragEnd={handleDragEnd} items={items}>
      {tracks.map((track) => (
        <SortableItem key={track.uniqueId} id={track.uniqueId}>
          <SongCard className="mt-1" track={track} onDelete={() => rmSongFromQueue(track)} />
        </SortableItem>
      ))}
    </SortableList>
  );
}
