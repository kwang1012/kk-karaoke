import { useEffect } from 'react';
import { useState } from 'react';
import { flat } from 'src/utils';
import { IconButton, Menu } from '@mui/material';
import { Menu as MenuIcon } from '@mui/icons-material';

type HeaderType = {
  title: string;
  el: any;
  children: HeaderType[];
  active: boolean;
  id: string;
};

function collectHeaders(el: any, n: number, position: number, prefix = ''): HeaderType {
  if (n === 6)
    return {
      title: el.textContent,
      el,
      children: [],
      active: false,
      id: `${prefix}-app-outline-` + String(n) + String(position),
    };
  const list: any[] = [];
  let nextEl = el.nextElementSibling;
  while (nextEl && nextEl.tagName !== el.tagName) {
    if (nextEl.tagName === `H${n + 1}`) {
      list.push(nextEl);
    }
    nextEl = nextEl.nextElementSibling;
  }
  const subHeaders = list.map((h, i) => collectHeaders(h, n + 1, i, prefix));
  return {
    title: el.textContent,
    el,
    children: subHeaders,
    active: false,
    id: `${prefix}-app-outline-` + String(n) + String(position),
  };
}

function Header({ h, level }: { h: HeaderType; level: number }) {
  return (
    <>
      <div
        id={h.id}
        onClick={() => {
          const y = h.el.offsetTop - 70;
          scrollTo({
            top: y,
            behavior: 'smooth',
          });
        }}
        style={{
          paddingLeft: `${level * 8}px`,
          fontSize: `${13 - level}px`,
          fontWeight: h.active ? 'bold' : 'normal',
          color: h.active ? '#CC3363' : '#767676',
        }}
        className="cursor-pointer mb-1"
      >
        {h.title}
      </div>
      {h.children.map((child, i) => (
        <Header key={i} h={child} level={level + 1} />
      ))}
    </>
  );
}

type HeaderListProps = {
  id?: string;
  className?: string;
  scrollOffset: number;
  content: string;
  width: number;
};

function HeaderList({ id = '', className, scrollOffset, content, width }: HeaderListProps) {
  // menu
  const [anchorEl, setAnchorEl] = useState<null | any>(null);
  const [openOutline, setOpenOutline] = useState(false);
  const handleClick = (event: any) => {
    setOpenOutline(true);
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setOpenOutline(false);
  };

  const [headerList, setHeaderList] = useState<HeaderType[]>([]);

  const updateHeaderList = () => {
    // top level header
    for (let h = 1; h <= 6; h++) {
      const list: any[] = [];
      const hs = document.querySelectorAll(`.markdown-content h${h}`);
      hs.forEach((h2, i) => {
        list.push(collectHeaders(h2, h, i, id));
      });
      if (hs.length !== 0) {
        setHeaderList(list);
        return;
      }
    }
  };
  useEffect(updateHeaderList, [content, width]);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const flatList = flat(headerList);
    let height = 0;
    for (const [i, h] of Object.entries(flatList)) {
      if (h.el.getBoundingClientRect().y > 80 || parseInt(i) === flatList.length - 1) {
        flatList.forEach((el, idx) => {
          if (idx < parseInt(i) || (i === '0' && idx === 0) || h.el.getBoundingClientRect().y <= 80) {
            const tab = document.getElementById(el.id);
            if (!tab) return;
            const style = getComputedStyle(tab);
            height += parseFloat(style.height) + parseFloat(style.marginBottom);
          }
          if (h.el.getBoundingClientRect().y <= 80) {
            el.active = parseInt(i) === flatList.length - 1 && idx === flatList.length - 1;
          } else el.active = idx === parseInt(i) - 1 || (i === '0' && idx === 0);
        });
        return setProgress(height - 4);
      }
    }
  }, [scrollOffset, headerList]);

  const component = (
    <div className={className || 'flex'}>
      <div className="w-[2px] h-10 bg-primary mr-5 transition-all" style={{ height: `${progress}px` }} />
      <div>
        {headerList.map((h, i) => (
          <Header key={i} h={h} level={0} />
        ))}
      </div>
      {!className && <div className="w-[2px] h-10 ml-5" />}
    </div>
  );
  return id === 'menu' ? (
    headerList.length ? (
      <>
        <IconButton
          className="xl:opacity-0 transition-opacity fixed bottom-2 left-2 sm:bottom-4 sm:left-4 md:bottom-8 md:left-8 lg:bottom-16 lg:left-16 bg-[#e6e6e6] text-[#868686] rounded-md shadow-app"
          onClick={handleClick}
          sx={{
            '&:hover': {
              backgroundColor: '#b6b6b6',
            },
          }}
        >
          <MenuIcon fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={openOutline}
          onClose={handleClose}
          anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
          transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
          elevation={0}
          container={anchorEl?.parentNode}
          className="xl:hidden"
          sx={{
            '& .MuiPaper-root': {
              padding: 2,
              border: '1px solid rgba(229, 231, 235, 1)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            },
            '& .MuiList-root': {
              padding: 0,
            },
          }}
        >
          {component}
        </Menu>
      </>
    ) : (
      <></>
    )
  ) : (
    component
  );
}

type Props = {
  content: string;
  scrollOffset: number;
  width: number;
};

export default function BlogOutline({ content, scrollOffset, width }: Props) {
  return (
    <>
      <HeaderList
        content={content}
        scrollOffset={scrollOffset}
        width={width}
        className="opacity-0 xl:opacity-100 transition-opacity flex fixed left-0 pt-24 pr-10 h-screen w-[calc(50%-400px)] flex-shrink-0 justify-end"
      />
      <HeaderList id="menu" content={content} scrollOffset={scrollOffset} width={width} />
    </>
  );
}
