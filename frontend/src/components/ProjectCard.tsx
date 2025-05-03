import { Box, useTheme, Tooltip, AppTheme } from '@mui/material';
import gsap from 'gsap';
import { useRef } from 'react';
import styles from 'styles/ProjectCard.module.scss';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';
import { useEffect } from 'react';

gsap.registerPlugin(ScrollTrigger);

type Props = {
  project: any;
  index: number;
};

export default function ProjectCard({ project, index }: Props) {
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
    <Box ref={ref} className={styles.writingCard} bgcolor="card.background" style={{ boxShadow: theme.palette.shadow }}>
      <div className={styles.wrapper}>
        {/* <div className={styles.tags}>
          <span className={styles.tag}>{project.venueShort}</span>
          <span className={styles.tag}>{project.author}</span>
        </div> */}
        <Tooltip title={project.title}>
          <div className={styles.title}>{project.title}</div>
        </Tooltip>
        <div className={styles.content}>{project.abstract}</div>
      </div>
    </Box>
  );
}
