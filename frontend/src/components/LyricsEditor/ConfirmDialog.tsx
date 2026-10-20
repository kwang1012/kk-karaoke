import { Button } from 'src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'src/components/ui/dialog';

/** A yes/no question that must be answered before something that cannot be undone. */
export default function ConfirmDialog({
  open, title, children, confirmLabel, cancelLabel, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="mt-1 space-y-1">{children}</div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 px-6 pt-3 pb-6">
          <Button variant="outline" onClick={onCancel}>{cancelLabel}</Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
