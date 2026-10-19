import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDebounce } from 'src/hooks/debounce';
import { IconButton } from 'src/components/ui/button';
import { cn } from 'src/lib/utils';

export default function SearchBox({
  className = '',
  value,
  onChange,
}: {
  className?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [input, setInput] = useState(value);
  const debouncedInput = useDebounce(input, 300);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    onChange(debouncedInput);
    if (!location.pathname.startsWith('/search') && debouncedInput.length > 0) {
      navigate(`/search?q=${encodeURIComponent(debouncedInput)}`);
    }
  }, [debouncedInput]);
  return (
    <div
      className={cn(
        'group flex h-11 w-full items-center gap-2 rounded-full border bg-card px-4 text-foreground transition-[border-color,box-shadow] hover:border-input focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15',
        className
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground group-focus-within:text-primary" />
      <input
        className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        placeholder="Search songs, albums, playlists"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        aria-label="search"
      />
      {input.length > 0 && (
        <IconButton size="small" aria-label="Clear search" onClick={() => setInput('')}>
          <X className="size-4" />
        </IconButton>
      )}
    </div>
  );
}
