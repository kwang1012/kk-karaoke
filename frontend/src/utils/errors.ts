import { t } from 'src/i18n';
import { errorKind } from './errorKind';

/** A failed request in the person's language: what happened, never axios's or the server's own wording. */
export const errorText = (error: unknown): string => t(`error.${errorKind(error)}`);
