import { styled } from '@mui/material/styles';
import { ReactSVG, Props } from 'react-svg';
const Icon = styled(ReactSVG)({
  '& svg': {
    width: '100%',
    height: '100%',
  },
});

export default function SvgIcon({ color, className, ...props }: Props) {
  return (
    <div className={className}>
      <Icon
        {...props}
        sx={{
          '& svg': {
            fill: color,
          },
        }}
      />
    </div>
  );
}
