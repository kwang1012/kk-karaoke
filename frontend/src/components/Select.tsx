import { styled } from '@mui/material/styles';
import { NativeSelect } from '@mui/material';
const AppSelect = styled(NativeSelect)(({ theme }) => ({
  border: 'none',
  backgroundColor: '#333333',
  borderRadius: 4,
  fontSize: 12,
  color: '#b3b3b3',
  height: 32,
  '& .MuiNativeSelect-select': {
    border: 'none',
    height: '100%',
    padding: '0 12px',
  },
  '& svg': {
    right: 4,
  },
}));

export default AppSelect;
