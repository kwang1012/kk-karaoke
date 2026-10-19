import axios from 'axios';
import { getSchemesForAddress } from '.';

const { http: protocol, address } = getSchemesForAddress();
export const api = axios.create({
  baseURL: `${protocol}${address}/api`,
  timeout: 10000,
});
