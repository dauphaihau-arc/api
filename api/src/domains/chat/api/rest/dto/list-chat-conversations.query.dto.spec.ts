import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListChatConversationsQueryDto } from './list-chat-conversations.query.dto';

describe('ListChatConversationsQueryDto', () => {
  it.each([
    ['true', true],
    ['false', false],
    ['1', true],
    [true, true],
    [false, false],
    ['', undefined],
    [null, undefined],
    [undefined, undefined],
  ])('coerces unread %p to %p', (input, expected) => {
    const query = plainToInstance(ListChatConversationsQueryDto, { unread: input });

    expect(validateSync(query)).toEqual([]);
    expect(query.unread).toBe(expected);
  });

  it('leaves unread undefined when the query parameter is absent', () => {
    const query = plainToInstance(ListChatConversationsQueryDto, {});

    expect(validateSync(query)).toEqual([]);
    expect(query.unread).toBeUndefined();
  });

  it('trims surrounding whitespace from q', () => {
    const query = plainToInstance(ListChatConversationsQueryDto, { q: '  Reed  ' });

    expect(validateSync(query)).toEqual([]);
    expect(query.q).toBe('Reed');
  });

  it.each(['', '   ', '\t\n'])('maps the whitespace-only q %p to undefined', (input) => {
    const query = plainToInstance(ListChatConversationsQueryDto, { q: input });

    expect(validateSync(query)).toEqual([]);
    expect(query.q).toBeUndefined();
  });

  it('leaves q undefined when the query parameter is absent', () => {
    const query = plainToInstance(ListChatConversationsQueryDto, {});

    expect(validateSync(query)).toEqual([]);
    expect(query.q).toBeUndefined();
  });

  it('rejects a q longer than 100 characters', () => {
    const query = plainToInstance(ListChatConversationsQueryDto, { q: 'a'.repeat(101) });
    const errors = validateSync(query);
    const qError = errors.find((error) => error.property === 'q');

    expect(qError?.constraints).toEqual({
      maxLength: 'q must be shorter than or equal to 100 characters',
    });
  });

  it('accepts a q of exactly 100 characters', () => {
    const term = 'a'.repeat(100);
    const query = plainToInstance(ListChatConversationsQueryDto, { q: term });

    expect(validateSync(query)).toEqual([]);
    expect(query.q).toBe(term);
  });
});
