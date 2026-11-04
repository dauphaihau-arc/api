const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

/**
 * Escapes LIKE/ILIKE wildcard characters so a search term is matched literally.
 * Postgres treats `\` as the default escape character, so prefixing `\`, `%`, `_`
 * keeps a term like `%` from matching every conversation.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(LIKE_SPECIAL_CHARACTERS, (character) => `\\${character}`);
}

export function buildChatConversationSearchPattern(term: string): string {
  return `%${escapeLikeTerm(term)}%`;
}
