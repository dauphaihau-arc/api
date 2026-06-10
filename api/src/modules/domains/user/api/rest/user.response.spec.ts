import {
  toUserListResponse,
  toUserResponse
} from './user.response';

describe('user.response', () => {
  it('maps a user into snake_case', () => {
    expect(toUserResponse({
      id: 'user-1',
      version: 3,
      email: 'user@example.com',
      displayName: 'Arc User',
      avatar: 'https://cdn.example.com/avatar.png',
      status: 'active' as never,
    })).toEqual({
      id: 'user-1',
      version: 3,
      email: 'user@example.com',
      display_name: 'Arc User',
      avatar: 'https://cdn.example.com/avatar.png',
      status: 'active',
    });
  });

  it('maps paginated users into snake_case', () => {
    expect(toUserListResponse({
      items: [
        {
          id: 'user-1',
          version: 3,
          email: 'user@example.com',
          displayName: 'Arc User',
          avatar: undefined,
          status: 'active' as never,
        },
      ],
      meta: {
        page: 2,
        limit: 10,
        total: 11,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    })).toEqual({
      items: [
        {
          id: 'user-1',
          version: 3,
          email: 'user@example.com',
          display_name: 'Arc User',
          avatar: undefined,
          status: 'active',
        },
      ],
      meta: {
        page: 2,
        limit: 10,
        total: 11,
        total_pages: 2,
        has_next_page: false,
        has_previous_page: true,
      },
    });
  });
});
