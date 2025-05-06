import { styled, alpha } from '@mui/material/styles';
import { IconButton, InputBase } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconName, IconPrefix } from '@fortawesome/free-solid-svg-icons';
import { faCircleXmark } from '@fortawesome/free-regular-svg-icons';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const SerachInput = styled(InputBase)(({ theme }) => ({
  'label + &': {
    marginTop: theme.spacing(3),
  },
  backgroundColor: '#1f1f1f',
  border: '2px solid transparent',
  borderRadius: 48,
  height: 48,
  color: '#cfcfcf',
  '&:hover': {
    backgroundColor: '#2f2f2f',
    borderColor: '#3f3f3f',
    '& .search': {
      color: 'white',
    },
  },
  '& .search': {
    color: '#cfcfcf',
  },
  '&:focus-within': {
    boxShadow: `${alpha(theme.palette.primary.main, 0.25)} 0 0 0 0.2rem`,
    borderWidth: 3,
    borderColor: theme.palette.primary.main,
    '& .search': {
      color: 'white',
    },
  },
  '& input:placeholder': {
    color: '#cfcfcf',
  },
  '& .MuiInputBase-input': {
    position: 'relative',
    fontSize: '1rem',
    width: '100%',
    padding: '1px 36px 1px 0',
  },
  transition: theme.transitions.create(['border-color', 'background-color', 'box-shadow']),
  [theme.breakpoints.down('md')]: {
    backgroundColor: 'white',
    borderRadius: 8,
    color: 'black',
    '&:hover': {
      backgroundColor: 'white',
      borderColor: '#3f3f3f',
      '& .search': {
        color: 'black',
      },
    },
    '& .search': {
      color: '#cfcfcf',
    },
  },
}));

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default function SearchBox({ className = '', value, onChange }) {
  const [input, setInput] = useState(value);
  const debouncedInput = useDebounce(input, 300);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    onChange(debouncedInput);
    if (!location.pathname.startsWith('/search') && debouncedInput.length > 0) {
      navigate(`/search?q=${encodeURIComponent(debouncedInput)}`);
    }
  }, [debouncedInput]);
  return (
    <SerachInput
      className={'w-full ' + className}
      placeholder="What do you want to play?"
      startAdornment={
        <div className="search w-12 h-12 p-3">
          <FontAwesomeIcon size="xl" icon={['fac' as IconPrefix, 'search' as IconName]} />
        </div>
      }
      value={input}
      onChange={(e) => setInput(e.target.value)}
      inputProps={{ 'aria-label': 'search' }}
      endAdornment={
        input.length > 0 ? (
          <IconButton className="w-10 h-10 mr-1" onClick={() => setInput('')}>
            <FontAwesomeIcon size="sm" icon={faCircleXmark} color="#afafaf" />
          </IconButton>
        ) : (
          <></>
        )
      }
    />
  );
}
