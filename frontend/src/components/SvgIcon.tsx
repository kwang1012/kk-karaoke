import { styled } from '@mui/material/styles';
import { ReactSVG, Props } from 'react-svg';
const Icon = styled(ReactSVG)({
  '& svg': {
    width: '100%',
    height: '100%',
    fill: 'white',
  },
});

export default function SvgIcon({ className, ...props }: Props) {
  return (
    <div className={className}>
      <Icon {...props} />
    </div>
  );
}
