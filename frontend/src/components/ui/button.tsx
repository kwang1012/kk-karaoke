import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from 'src/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-card text-card-foreground hover:bg-accent',
        outline: 'border border-input bg-card text-card-foreground hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 gap-1.5 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'size-9 rounded-full',
        'icon-sm': 'size-8 rounded-full',
        'icon-lg': 'size-12 rounded-full',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };

/** Round, padded, borderless button for icons (the MUI `IconButton` look). */
function IconButton({
  className,
  size = 'medium',
  ...props
}: Omit<React.ComponentProps<'button'>, 'size'> & { size?: 'small' | 'medium' | 'large' }) {
  return (
    <button
      data-slot="icon-button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none',
        size === 'small' && 'p-1',
        size === 'medium' && 'p-2',
        size === 'large' && 'p-3',
        className
      )}
      {...props}
    />
  );
}

export { IconButton };
