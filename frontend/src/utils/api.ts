import axios from 'axios';
import { getSchemesForAddress } from '.';

const protocol = getSchemesForAddress(import.meta.env.VITE_API_ADDR).http;
export const api = axios.create({
  baseURL: `${protocol}${import.meta.env.VITE_API_ADDR}/api`,
  timeout: 10000,
});
