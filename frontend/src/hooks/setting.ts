import { RootState } from 'src/store';
import { setSetting } from 'src/store/setting';
import { normalize } from 'src/utils';
import { api } from 'src/utils/api';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

export function useSetting() {
  const setting = useSelector((state: RootState) => state.setting);
  const dispatch = useDispatch()
  useEffect(() => {
    if (setting.avatarURL == undefined || setting.resumeURL == undefined) {
      api.get('/setting').then(({data}) => dispatch(setSetting(normalize(data))));
    }
  }, [setting]);
}
