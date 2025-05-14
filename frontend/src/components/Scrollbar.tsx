import { OverlayScrollbarsComponent, OverlayScrollbarsComponentProps } from 'overlayscrollbars-react';

export default function AppScrollbar(props: OverlayScrollbarsComponentProps) {
  return <OverlayScrollbarsComponent options={{ scrollbars: { autoHide: 'leave', autoHideDelay: 500 } }} {...props} />;
}
