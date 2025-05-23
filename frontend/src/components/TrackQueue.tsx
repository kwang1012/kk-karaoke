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

function SortableItem({
  id,
  children,
  dragging,
}: { id: string; dragging?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  const { attributes, listeners, setNodeRef, transform, transition, active } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isActive = active?.id === id;
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));

  return (
    <div
      ref={setNodeRef}
      {...(mobile ? {} : listeners)}
      {...attributes}
      className="flex items-center my-2"
      style={{
        ...style,
        touchAction: !mobile && dragging ? 'none' : 'manipulation',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        ...(isActive && {
          scale: 0.98,
          zIndex: 50,
          borderRadius: 8,
          backgroundColor: '#12121270',
          boxShadow: '0 0 0 4px rgba(204, 51, 99, 0.8)',
        }),
      }}
    >
      {mobile && (
        <DragIndicator
          className={isActive ? 'cursor-grabbing' : 'cursor-grab'}
          sx={{ color: '#cacaca' }}
          {...listeners}
          style={{ touchAction: 'none' }}
        />
      )}
      {children}
    </div>
  );
}
import { useState, type PointerEvent } from 'react';
import { api } from 'src/utils/api';
import { useActiveRoomId, useRoomStore } from 'src/store/room';
import { useMediaQuery } from '@mui/material';
import { DragIndicator } from '@mui/icons-material';
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
  onDragStart,
  onDragCancel,
}: {
  items: string[];
  children: React.ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onDragCancel?: (event: DragStartEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(SmartPointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <DndContext
      sensors={sensors}
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
  const items = tracks.map((item) => item.uniqueId);
  const [dragging, setDragging] = useState(false);
  const handleDragEnd = (event: DragEndEvent) => {
    setDragging(false);
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
      onDragStart={() => setDragging(true)}
      onDragCancel={() => setDragging(false)}
      items={items}
    >
      {tracks.map((track, index) => (
        <SortableItem key={track.uniqueId} id={track.uniqueId} dragging={dragging}>
          <SongCard
            className="flex-1"
            track={track}
            onInsert={() => onInsert(track, index)}
            onDelete={() => rmSongFromQueue(track)}
          />
        </SortableItem>
      ))}
    </SortableList>
  );
}
