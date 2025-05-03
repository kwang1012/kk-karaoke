import { Box, useTheme, Tooltip, AppTheme } from '@mui/material';
import gsap from 'gsap';
import { useRef } from 'react';
import styles from 'styles/PublicationCard.module.scss';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';
import { useEffect } from 'react';

gsap.registerPlugin(ScrollTrigger);

type Props = {
  pub: any;
  index: number;
};

export default function PublicationCard({ pub, index }: Props) {
  const theme = useTheme<AppTheme>();

  const ref = useRef();

  useEffect(() => {
    gsap.from(ref.current!, {
      scrollTrigger: {
        trigger: ref.current,
        toggleActions: 'play none none none',
      },
      // x: '-100vw',
      y: '50px',
      duration: 1,
      opacity: 0,
      delay: (index % 2) * 0.2,
    });
  }, []);

  return (
    <Box
      ref={ref}
      className={styles.writingCard}
      bgcolor="card.background"
      style={{ boxShadow: theme.palette.shadow }}
      onClick={
        pub.url
          ? () => {
              window.open(pub.url, '_blank');
            }
          : () => {}
      }
    >
      <div className={styles.wrapper}>
        <div className={styles.tags}>
          <span className={styles.tag}>{pub.venue.short}</span>
          <span className={styles.tag}>{pub.authorList.find((a: any) => a.name === 'Kai-Siang Wang').type}</span>
        </div>
        <Tooltip title={pub.title}>
          <div className={styles.title}>{pub.title}</div>
        </Tooltip>
        <div className={styles.content}>{pub.abstract}</div>
      </div>
    </Box>
  );
}
