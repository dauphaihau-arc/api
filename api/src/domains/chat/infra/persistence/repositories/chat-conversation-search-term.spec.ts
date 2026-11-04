import {
  escapeLikeTerm,
  buildChatConversationSearchPattern,
} from './chat-conversation-search-term';

describe('escapeLikeTerm', () => {
  it.each([
    ['Reed', 'Reed'],
    ['reed@example.com', 'reed@example.com'],
    ['%', '\\%'],
    ['_', '\\_'],
    ['\\', '\\\\'],
    ['100%_off\\sale', '100\\%\\_off\\\\sale'],
  ])('escapes LIKE special characters in %p', (input, expected) => {
    expect(escapeLikeTerm(input)).toBe(expected);
  });

  it('wraps the escaped term in match-anywhere wildcards', () => {
    expect(buildChatConversationSearchPattern('50%')).toBe('%50\\%%');
  });
});
