/** The code a TV shows to be linked (ABCD-EFGH): people type it in any case, with or without the dash. */
export const USER_CODE_LENGTH = 8;

export const normalizeUserCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, USER_CODE_LENGTH);

export const formatUserCode = (value: string) => {
  const code = normalizeUserCode(value);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
};
