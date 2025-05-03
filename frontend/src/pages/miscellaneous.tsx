import React, { ElementRef, useState } from 'react';
import ContactCard from 'src/components/ContactCard';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { Button } from '@mui/material';
import { simpleProviders } from 'src/const';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useRef } from 'react';
import { onClickProvider } from 'src/utils';
import { useSelector } from 'react-redux';
import { RootState } from 'src/store';

export default function MiscellaneousView() {
  const setting = useSelector((state: RootState) => state.setting);
  const themeValue = useSelector((state: RootState) => state.theme.value);
  const [open, setOpen] = useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const card = useRef<ElementRef<typeof ContactCard>>(null);

  return (
    <>
      <div
        className={`mt-20 pt-24 max-w-[650px] mx-auto ${
          themeValue === 'light' ? 'bg-[#f8f9fb]' : 'dark:bg-[#131313]'
        } rounded-md shadow-app flex flex-col items-center relative text-center duration-400`}
      >
        <div className="absolute -top-[60px]">
          <img src="/avatar.jpg" width={150} height={150} className="rounded-full object-cover" />
        </div>
        <div className="flex flex-col items-center self-stretch">
          <h2 className="mb-0">Kai-Siang Wang (Kai)</h2>
          <div className="text-gray-400 text-sm mt-2 tracking-tighter">
            I am a slow walker, but I never walk backwards.
          </div>
          <p className="text-sm px-8 pb-2 text-justify leading-[1.2] tracking-tighter">
            Hi, this is Kai Wang, an ordinary person who took several years to figure out his goal in life. Luckily, I
            finally found it -- I want to built systems that can benefit people's daily lives. It is a challenging goal,
            but I will try until the last moment. Wish me luck! ✨
            {/* <br />
            <br />
            This site will serve as a personal blog as I will record my life here. Stay tuned if you are interested, and
            I would be grateful if you give me any advice! 😊 */}
          </p>
          <div className="text-sm tracking-tighter py-3 border-0 border-gray-300 border-solid self-stretch border-t">
            Interests: anime, movies, baseball
          </div>
          <div className="py-3 border-0 border-gray-300 border-solid self-stretch border-t">
            {simpleProviders.map((provider, i) => (
              <FontAwesomeIcon
                key={i}
                className="cursor-pointer mr-4"
                icon={provider}
                size="2x"
                onClick={() => onClickProvider(provider as string, setting)}
              />
            ))}
          </div>
          <div className="py-3 border-0 border-gray-300 border-solid self-stretch border-t">
            <Button
              variant="contained"
              disableElevation
              size="small"
              className="normal-case"
              onClick={() => window.open('mailto:kw37@illinois.edu', '_blank')}
            >
              Email me
            </Button>
            <div className="my-1 text-sm">or</div>
            <Button onClick={handleClickOpen} variant="contained" disableElevation size="small" className="normal-case">
              Send message
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Drop me a line</DialogTitle>
        <DialogContent>
          <ContactCard inputOnly ref={card} />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} className="text-[#a9a9a9]">
            Cancel
          </Button>
          <Button
            onClick={() => {
              card.current?.submit().then(() => {
                setOpen(false);
              });
            }}
          >
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
