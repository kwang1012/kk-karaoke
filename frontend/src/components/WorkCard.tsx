import styles from 'styles/WorkCard.module.scss';
import LanguageIcon from '@mui/icons-material/Language';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import { AppTheme, useTheme } from '@mui/material';
import gsap from 'gsap';
import { useRef } from 'react';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';
import { useEffect } from 'react';

gsap.registerPlugin(ScrollTrigger);

type Props = {
  work: any;
  index: number;
  sectionRef: any;
};

export default function WorkCard({ work, sectionRef }: Props) {
  const theme = useTheme<AppTheme>();
  const ref = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap
      .timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          toggleActions: 'play none none none',
          // scrub: true,
          start: 'top top',
          end: 'bottom',
          // markers: true
        },
      })
      .from(ref.current!, {
        rotate: 360,
        x: '-100vw',
        duration: 2,
      });
  }, []);

  return (
    <div
      className={styles.workCard}
      style={{ backgroundColor: work.color, boxShadow: theme.palette.shadow }}
      ref={ref}
      onClick={work.action}
    >
      {
        {
          web: <LanguageIcon style={{ fontSize: '30px' }} />,
          app: <WhatshotIcon style={{ fontSize: '30px' }} />,
          plane: <FlightTakeoffIcon style={{ fontSize: '30px' }} />,
        }[work.icon as 'web' | 'app' | 'plane']
      }
      <h2>{work.name}</h2>
      <h4>{work.description}</h4>
    </div>
  );
}
