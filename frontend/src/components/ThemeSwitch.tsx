import { useState, useEffect } from 'react';
import styles from 'src/styles/ThemeSwitch.module.scss';
import NightStayIcon from '@mui/icons-material/NightsStay';
import Brightness7Icon from '@mui/icons-material/Brightness7';

type Props = {
  inMenu?: boolean;
  size?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  className?: string;
};

export default function ThemeSwitch({ inMenu = false, size = '', ...props }: Props) {
  const [value, setValue] = useState<boolean>(props.checked);

  useEffect(() => {
    setValue(props.checked);
  }, [props.checked]);

  useEffect(() => {
    props.onChange(value);
  }, [value]);

  function onClick() {
    setValue((prevValue) => !prevValue);
  }

  return (
    <div className={props.className}>
      <div
        className={[styles.container, styles[size]].join(' ')}
        onClick={onClick}
        style={{ backgroundColor: value ? '#cacbcc' : '#5a5b5c' }}
      >
        <NightStayIcon className={[styles.icon, styles.night].join(' ')} />
        <Brightness7Icon className={[styles.icon, styles.day].join(' ')} />
        <div className={[styles.handler, value ? styles.light : styles.dark].join(' ')}></div>
      </div>
    </div>
  );
}
