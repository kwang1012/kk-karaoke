import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';

/** Styled dropdown for a short list of `{ value, label }` options. */
export default function AppSelect({
  value,
  onValueChange,
  options,
  disabled,
  className,
}: {
  value: string;
  onValueChange?: (value: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
