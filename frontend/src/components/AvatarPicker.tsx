import { cn } from 'src/lib/utils';

/** Even grid of round avatars; the selected one gets a primary ring. */
export default function AvatarPicker({
  avatars,
  value,
  onChange,
  className,
  itemClassName,
}: {
  avatars: string[];
  value: string | null | undefined;
  onChange: (avatar: string) => void;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div role="radiogroup" className={className}>
      {avatars.map((avatar, index) => {
        const selected = avatar === value;
        return (
          <button
            key={avatar}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Avatar ${index + 1}`}
            onClick={() => onChange(avatar)}
            className={cn(
              'aspect-square overflow-hidden rounded-full bg-secondary ring-2 ring-transparent ring-offset-2 ring-offset-card transition-all hover:bg-accent hover:ring-border',
              selected && 'bg-primary/15 ring-primary hover:ring-primary',
              itemClassName
            )}
          >
            <img src={avatar} alt="" className="size-full object-cover" />
          </button>
        );
      })}
    </div>
  );
}
