export const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

export const MOCK_USER = {
  id: TEST_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'test@portfelik.test',
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { name: 'Test User', full_name: 'Test User' },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const MOCK_PROFILE = {
  id: TEST_USER_ID,
  email: 'test@portfelik.test',
  name: 'Test User',
  role: 'user',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const MOCK_CATEGORIES = [
  { id: 'cat-1', name: 'Jedzenie', type: 'expense', user_id: null },
  { id: 'cat-2', name: 'Transport', type: 'expense', user_id: null },
  { id: 'cat-3', name: 'Wynagrodzenie', type: 'income', user_id: null },
];

export const MOCK_TRANSACTIONS = [
  {
    id: 'tx-1',
    date: '2026-05-01',
    description: 'Zakupy spożywcze',
    amount: 150.5,
    type: 'expense',
    status: 'paid',
    category_id: 'cat-1',
    category_name: 'Jedzenie',
    is_recurring: false,
    recurring_day: null,
    currency: 'PLN',
    user_id: TEST_USER_ID,
    group_id: null,
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
  },
  {
    id: 'tx-2',
    date: '2026-05-02',
    description: 'Bilet miesięczny',
    amount: 80,
    type: 'expense',
    status: 'paid',
    category_id: 'cat-2',
    category_name: 'Transport',
    is_recurring: false,
    recurring_day: null,
    currency: 'PLN',
    user_id: TEST_USER_ID,
    group_id: null,
    created_at: '2026-05-02T10:00:00Z',
    updated_at: '2026-05-02T10:00:00Z',
  },
];

export const MOCK_NEW_TRANSACTION = {
  id: 'tx-new',
  date: '2026-05-07',
  description: 'Nowa transakcja testowa',
  amount: 99.99,
  type: 'expense',
  status: 'paid',
  category_id: 'cat-1',
  category_name: 'Jedzenie',
  is_recurring: false,
  recurring_day: null,
  currency: 'PLN',
  user_id: TEST_USER_ID,
  group_id: null,
  created_at: '2026-05-07T10:00:00Z',
  updated_at: '2026-05-07T10:00:00Z',
};

// Raw Supabase shape for fetchShoppingLists (has nested items array for counting)
export const MOCK_SHOPPING_LISTS_RAW = [
  {
    id: 'list-1',
    name: 'Tygodniowe zakupy',
    status: 'active',
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: null,
    total_amount: null,
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
    shopping_list_items: [
      { id: 'item-1', completed: false },
      { id: 'item-2', completed: true },
      { id: 'item-3', completed: false },
    ],
  },
];

// Single list with full items — returned by fetchShoppingListById (.single())
export const MOCK_SHOPPING_LIST_DETAIL = {
  id: 'list-1',
  name: 'Tygodniowe zakupy',
  status: 'active',
  user_id: TEST_USER_ID,
  group_id: null,
  category_id: null,
  total_amount: null,
  created_at: '2026-05-01T10:00:00Z',
  updated_at: '2026-05-01T10:00:00Z',
  shopping_list_items: [
    {
      id: 'item-1',
      name: 'Mleko',
      quantity: 2,
      unit: 'l',
      completed: false,
      position: 1,
      shopping_list_id: 'list-1',
      created_at: '2026-05-01T10:00:00Z',
      updated_at: '2026-05-01T10:00:00Z',
    },
    {
      id: 'item-2',
      name: 'Chleb',
      quantity: 1,
      unit: null,
      completed: true,
      position: 2,
      shopping_list_id: 'list-1',
      created_at: '2026-05-01T10:00:00Z',
      updated_at: '2026-05-01T10:00:00Z',
    },
  ],
};

export const MOCK_NEW_LIST = {
  id: 'list-new',
  name: 'Nowa lista testowa',
  status: 'active',
  user_id: TEST_USER_ID,
  group_id: null,
  category_id: null,
  total_amount: null,
  created_at: '2026-05-07T10:00:00Z',
  updated_at: '2026-05-07T10:00:00Z',
};
