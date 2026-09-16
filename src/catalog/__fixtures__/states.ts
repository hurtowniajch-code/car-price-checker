/** Real-shape trimmed copy of Otomoto's filters.states (captured 2026-09-15). */
const value = (id: string, name: string, counter: number) => ({
  __typename: 'AdvertSearchFilterValue', id, name, description: null, counter,
});

const state = (filterId: string, conditions: { filterId: string; value: string }[], values: any[]) => ({
  filterId,
  conditions: conditions.map((c) => ({ __typename: 'AdvertSearchFilterStateCondition', ...c, type: 'IS' })),
  values: [{ values }],
});

export const CAR_STATES = [
  state('filter_enum_make', [], [
    value('volkswagen', 'Volkswagen', 300),
    value('fiat', 'Fiat', 50),
    value('doosan', 'Doosan', 0),
  ]),
  state('filter_enum_model', [{ filterId: 'filter_enum_make', value: 'volkswagen' }], [
    value('polo', 'Polo', 120),
    value('golf', 'Golf', 180),
    value('buggy', 'Buggy', 0),
  ]),
  state('filter_enum_model', [{ filterId: 'filter_enum_make', value: 'fiat' }], [
    value('500', '500', 30),
    value('500l', '500L', 20),
  ]),
  state('filter_enum_generation', [
    { filterId: 'filter_enum_make', value: 'volkswagen' },
    { filterId: 'filter_enum_model', value: 'polo' },
  ], [
    value('gen-v-2009-2017', 'V (2009-2017)', 0),
    value('gen-vi-2017', 'VI (2017-)', 0),
  ]),
];

/** Same as CAR_STATES but with an extra conditioned filter_enum_make state placed first. */
export const CAR_STATES_WITH_CONDITIONED_MAKE = [
  state('filter_enum_make', [{ filterId: 'filter_enum_body_type', value: 'kombi' }], [
    value('audi', 'Audi', 10),
  ]),
  ...CAR_STATES,
];

export const MOTO_STATES = [
  state('filter_enum_make', [], [value('yamaha', 'Yamaha', 90)]),
  state('filter_enum_model', [{ filterId: 'filter_enum_make', value: 'yamaha' }], [
    value('fz6', 'FZ6', 60),
    value('mt-07', 'MT-07', 30),
  ]),
];

/** Wrap states the way a real Otomoto page does. */
export function pageHtml(states: unknown[]): string {
  const nextData = {
    props: { pageProps: { urqlState: {
      abc: { data: JSON.stringify({ __typename: 'Query', filters: { states } }) },
      def: { data: JSON.stringify({ advertSearch: { edges: [] } }) },
    } } },
  };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}
