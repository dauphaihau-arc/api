/**
 * Category public identities are positive decimal integers without leading
 * zeros. They are always handled as strings so values beyond JavaScript's
 * safe integer range survive transport unchanged.
 */
export const CATEGORY_PUBLIC_ID_PATTERN = /^[1-9][0-9]*$/;
