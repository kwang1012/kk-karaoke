import { OverlayScrollbarsComponent, OverlayScrollbarsComponentProps } from 'overlayscrollbars-react';

export default function AppScrollbar(props: OverlayScrollbarsComponentProps) {
  return (
    <OverlayScrollbarsComponent
      events={{
        scroll: (_, e) => {
          props.onScroll?.(e as any);
        },
      }}
      options={{ scrollbars: { autoHide: 'leave', autoHideDelay: 500 } }}
      {...props}
    />
  );
}
