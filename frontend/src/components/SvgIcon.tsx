import { styled } from '@mui/material/styles';
import { ReactSVG, Props } from 'react-svg';
const Icon = styled(ReactSVG)({
  background: 'transparent',
  '& svg': {
    width: '100%',
    height: '100%',
  },
  '& path': {
    fill: 'inherit',
    stroke: 'inherit',
    strokeWidth: 'inherit',
  },
});

export default function SvgIcon({ color, className, fill, stroke, strokeWidth, ...props }: Props) {
  return (
    <div className={className}>
      <Icon
        {...props}
        sx={{
          '& svg': {
            color,
            fill,
            stroke,
            strokeWidth,
          },
        }}
      />
    </div>
  );
}
