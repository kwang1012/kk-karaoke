import axios from 'axios';

export const api = axios.create({
  baseURL: `http://${process.env.REACT_APP_API_ADDR}/api`,
  timeout: 10000,
});
