import axios from 'axios';
import { isHostname } from '.';

const protocol = isHostname(import.meta.env.VITE_API_ADDR) ? 'https' : 'http';
export const api = axios.create({
  baseURL: `${protocol}://${import.meta.env.VITE_API_ADDR}/api`,
  timeout: 10000,
});
