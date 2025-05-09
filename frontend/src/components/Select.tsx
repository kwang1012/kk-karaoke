import { styled } from '@mui/material/styles';
import { NativeSelect } from '@mui/material';
const AppSelect = styled(NativeSelect)(({ theme }) => ({
  border: 'none',
  backgroundColor: '#333333',
  borderRadius: 4,
  color: '#b3b3b3',
  '& .MuiNativeSelect-select': {
    border: 'none',
    padding: '4px 12px 4px 12px',
  },
  '& svg': {
    right: 4,
  },
}));

export default AppSelect;
