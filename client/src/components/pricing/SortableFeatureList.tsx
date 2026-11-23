// components/pricing/SortableFeatureList.tsx — a plan's feature list in the
// Pricing editor. Rows are reordered by dragging the grip (mouse, touch or
// finger) or from the keyboard: focus a grip, press Space to pick the row up,
// the arrow keys to move it, Space to drop it and Escape to cancel.
import { useState } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface Props {
  features: string[]
  max: number
  onChange: (features: string[]) => void
}

// The features are plain strings, so each row is given a stable id to follow
// it around while it is dragged. The ids live only here.
let nextId = 0
const newId = () => `feature-${++nextId}`

interface RowProps {
  id: string
  index: number
  value: string
  onText: (value: string) => void
  onRemove: () => void
}

function FeatureRow({ id, index, value, onText, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <li
      ref={setNodeRef}
      style={{
        // Rows only ever move up and down.
        transform: CSS.Transform.toString(transform && { ...transform, x: 0, scaleX: 1, scaleY: 1 }),
        transition,
      }}
      className={cn(
        "relative flex items-center gap-1 rounded-md bg-background",
        isDragging && "z-10 shadow-lg ring-1 ring-brand/50",
      )}
      data-cy={`pricing-feature-row`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder feature ${index + 1}`}
        className={cn(
          "inline-flex size-9 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        data-cy="pricing-feature-handle"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <Input value={value} maxLength={120} aria-label={`Feature ${index + 1}`} onChange={(e) => onText(e.target.value)} />
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove feature ${index + 1}`}>
        <Trash2 className="size-4" />
      </Button>
    </li>
  )
}

export function SortableFeatureList({ features, max, onChange }: Props) {
  const [ids, setIds] = useState<string[]>(() => features.map(newId))

  // The list can be replaced from outside (Discard changes, Reset, a save):
  // when the count no longer matches, start fresh ids.
  if (ids.length !== features.length) setIds(features.map(newId))

  const sensors = useSensors(
    // A few pixels of movement first, so a click on the grip is never a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const position = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up feature ${position(active.id)} of ${ids.length}.`,
    onDragOver: ({ active, over }) =>
      over ? `Feature ${position(active.id)} is over position ${position(over.id)} of ${ids.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `Feature ${position(active.id)} dropped at position ${position(over.id)} of ${ids.length}.` : "Dropped.",
    onDragCancel: ({ active }) => `Cancelled. Feature ${position(active.id)} stays where it was.`,
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    setIds(arrayMove(ids, from, to))
    onChange(arrayMove(features, from, to))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Features</Label>
        <span className="text-xs text-muted-foreground">
          {features.length} / {max}
        </span>
      </div>
      {features.length === 0 && <p className="text-sm text-muted-foreground">No features listed.</p>}
      {features.length > 1 && (
        <p className="text-xs text-muted-foreground">Drag the grip on the left to reorder.</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To reorder, press Space to pick up this feature, use the up and down arrow keys to move it, then press Space to drop it. Press Escape to cancel.",
          },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {features.map((feature, i) => (
              <FeatureRow
                key={ids[i] ?? i}
                id={ids[i] ?? String(i)}
                index={i}
                value={feature}
                onText={(value) => onChange(features.map((f, j) => (j === i ? value : f)))}
                onRemove={() => {
                  setIds(ids.filter((_, j) => j !== i))
                  onChange(features.filter((_, j) => j !== i))
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={features.length >= max}
        onClick={() => {
          setIds([...ids, newId()])
          onChange([...features, ""])
        }}
      >
        <Plus className="size-4" /> Add feature
      </Button>
    </div>
  )
}
