import { api } from 'src/utils/api';
import axios from 'axios';
import { useEffect } from 'react';

export function useVisitor() {
  useEffect(() => {
    axios
      .get('https://ipgeolocation.abstractapi.com/v1/', {
        params: {
          api_key: process.env.REACT_APP_GEO_API_KEY,
        },
      })
      .then(({ data }) => {
        api.post('/monitor/visitors', {
          data,
        });
      })
      .catch(console.log);
  }, []);
}
