import { TextField } from '@mui/material';
import { styled, alpha } from '@mui/material/styles';

const Input = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-root': {
    paddingLeft: '0',
    overflow: 'hidden',
    lineHeight: '1em',
  },
  '& .MuiInputBase-input': {
    height: '1em',
    padding: '8.5px 8px',
  },
  '& .MuiInputAdornment-root': {
    alignSelf: 'stretch',
    height: 'unset',
    padding: '0 12px',
    margin: '0',
    borderRightColor: theme.palette.mode === 'light' ? alpha('#000', 0.23) : alpha('#fff', 0.23),
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    backgroundColor: alpha('#ccc', 0.23),
  },
}));

export default Input;
