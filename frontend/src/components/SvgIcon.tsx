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
  },
});

export default function SvgIcon({ color, className, fill, stroke, ...props }: Props) {
  return (
    <div className={className}>
      <Icon
        {...props}
        sx={{
          '& svg': {
            color,
            fill,
            stroke,
          },
        }}
      />
    </div>
  );
}
