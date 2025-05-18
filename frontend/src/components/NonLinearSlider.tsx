import { useRef, useState, useEffect } from 'react';
import { useSpring, animated, to } from '@react-spring/web';
import { styled } from '@mui/material/styles';

const Svg = styled('svg')(({ theme }) => ({
  cursor: 'pointer',
  '& rect': {
    fill: '#dadbdc10',
  },
  '& g .track': {
    fill: '#dadbdc',
    opacity: 0.8,
  },
  '& g .circle': {
    fill: '#eaebec',
    opacity: 0.5,
  },
  '&:hover rect, &.active rect': {
    fill: '#dadbdc70',
  },
  '&:hover g *, &.active g *': {
    opacity: 1,
  },
}));

const G = styled('g')(({ theme }) => ({
  filter: 'url(#goo)',
  // '& .track': {
  //   fill: '#dadbdc',
  //   opacity: 0.8,
  // },
  // '& .circle': {
  //   fill: '#eaebec',
  //   opacity: 0.5,
  // },
  // '&:hover *, &.active *': {
  //   opacity: 1,
  // },
}));

export default function NonLinearSlider({
  value,
  onChange,
  onDragStart,
  onDragEnd,
}: {
  value?: number;
  onChange?: (value: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mouseY, setMouseY] = useState(value || 200);
  const [isDragging, setIsDragging] = useState(false);
  const height = 400;
  const width = 30;

  const radius = width / 2;
  const centerX = width / 2;
  const resolution = 2;

  const [{ y }, api] = useSpring(() => ({ y: mouseY }));

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < radius || y > height - radius) return;
    setMouseY(y);
    api.start({ y });
  };

  const handleMouseDown = () => {
    setIsDragging(true);
    if (onDragStart) {
      onDragStart();
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (onDragEnd) {
      onDragEnd();
    }
  };
  const handleMouseClick = (e: MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < radius || y > height - radius) return;
    setMouseY(y);
    api.start({ y });
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('click', handleMouseClick);
    svg.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      svg.removeEventListener('click', handleMouseClick);
      svg.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isDragging]);

  useEffect(() => {
    const min = -30;
    const max = 30;
    const mouseMin = 15;
    const mouseMax = height - 15;
    const value = ((mouseY - mouseMin) / (mouseMax - mouseMin)) * (max - min) + min;
    if (onChange) {
      onChange(value);
    }
  }, [mouseY]);

  return (
    <Svg ref={svgRef} width={width} height={height} className={isDragging ? 'active' : ''}>
      <defs>
        <filter id="goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>

      <rect
        x={width / 2}
        y={5}
        width="3"
        height={height - 10}
        rx="3"
        ry="3"
        fill="#dadbdc10"
        style={{ transition: 'fill 0.2s ease-in-out' }}
      />
      <G>
        <animated.path
          style={{ transition: !isDragging ? 'opacity 0.2s ease-in-out' : '' }}
          className="track"
          d={to(y, (yy) => {
            const maxWidth = 8;
            const segments = Math.ceil(height / resolution);
            let leftPath = '';
            let rightPath = '';
            for (let i = 0; i <= segments; i++) {
              const cy = (i * height) / segments;
              const dist = Math.abs(cy - yy);
              const stretch = Math.max(2, maxWidth - (dist / height) * maxWidth);
              leftPath += `L${centerX - stretch},${cy} `;
              rightPath = `L${centerX + stretch},${cy} ` + rightPath;
            }
            return `M${centerX - maxWidth},0 ${leftPath}${rightPath}Z`;
          })}
        />
        <animated.circle
          style={{ transition: 'opacity 0.2s ease-in-out' }}
          onDoubleClick={() => {
            setMouseY(200);
            api.start({ y: 200 });
          }}
          cx={centerX}
          cy={y}
          r={radius}
          className="circle"
        />
      </G>
    </Svg>
  );
}
