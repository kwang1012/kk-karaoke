import Nav from 'src/components/nav';
import { ReactNode } from 'react';
import SimpleFooter from 'src/components/SimpleFooter';
import { Outlet } from 'react-router-dom';

type Props = {
  contentWidth?: number;
  paddingTop?: number;
  layout?: any;
};

export default function SimpleLayout({ contentWidth = 800, paddingTop = 100, layout = {} }: Props) {
  return (
    <>
      <Nav isSimple />
      {layout === null ? (
        <Outlet />
      ) : (
        <div
          className={'mx-auto min-h-screen px-5'}
          style={{
            paddingTop: `${paddingTop}px`,
            maxWidth: `${contentWidth}px`,
          }}
        >
        <Outlet />
        </div>
      )}
      <SimpleFooter />
    </>
  );
}
