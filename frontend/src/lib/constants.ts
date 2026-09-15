import type { CSSProperties } from 'react';
import type { TripStatus } from '@shared/types';

// Design tokens — mirrors App.jsx warm paper & Georgia serif aesthetic
export const INK = '#24211C';
export const PAPER = '#F3EEE2';
export const PINE = '#2B4C3F';
export const PINE_DARK = '#1E3830';
export const CLAY = '#C1683F';
export const BORDER = '#DDD5C4';
export const MUTED = '#8A8272';

export const SERIF: CSSProperties = {
  fontFamily: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif',
};

// Filter arrays
export const DIETARY: string[] = [
  'Vegetarian',
  'Vegan',
  'Halal',
  'No restrictions',
];

export const STYLES: string[] = [
  'Relaxed',
  'Packed',
  'Foodie',
  'Outdoorsy',
  'Culture',
];

// Member definition
export interface Member {
  id: string;
  name: string;
  initials: string;
  submitted: boolean;
  role?: 'creator' | 'joiner';
}

export const MEMBERS: Member[] = [
  { id: 'alice', name: 'Alice', initials: 'AL', submitted: true, role: 'creator' },
  { id: 'bob', name: 'Bob', initials: 'BO', submitted: true, role: 'joiner' },
  { id: 'cara', name: 'Cara', initials: 'CA', submitted: false, role: 'joiner' },
];

export interface Stop {
  id?: string;
  time: string;
  name: string;
  cost: number;
  note: string | null;
  category?: string;
  lat?: number;
  lng?: number;
}

export const ITINERARY: Record<number, Stop[]> = {
  1: [
    {
      id: 'stop-1-1',
      time: '9:00 AM',
      name: 'Belem Tower',
      cost: 12,
      note: 'Arrive early, it gets busy by 11.',
      category: 'Sightseeing',
      lat: 38.6916,
      lng: -9.216,
    },
    {
      id: 'stop-1-2',
      time: '11:30 AM',
      name: 'Pasteis de Belem',
      cost: 8,
      note: null,
      category: 'Foodie',
      lat: 38.6975,
      lng: -9.2033,
    },
    {
      id: 'stop-1-3',
      time: '2:00 PM',
      name: 'LX Factory',
      cost: 0,
      note: '8 min walk from lunch — no backtracking.',
      category: 'Culture',
      lat: 38.7037,
      lng: -9.1789,
    },
  ],
  2: [
    {
      id: 'stop-2-1',
      time: '10:00 AM',
      name: 'Alfama walking tour',
      cost: 15,
      note: null,
      category: 'Culture',
      lat: 38.7119,
      lng: -9.1299,
    },
    {
      id: 'stop-2-2',
      time: '1:00 PM',
      name: 'Time Out Market',
      cost: 20,
      note: 'Vegetarian stalls confirmed for Alice.',
      category: 'Foodie',
      lat: 38.7071,
      lng: -9.1465,
    },
    {
      id: 'stop-2-3',
      time: '6:00 PM',
      name: 'Miradouro da Graca',
      cost: 0,
      note: 'Sunset viewpoint, 12 min from the market.',
      category: 'Relaxed',
      lat: 38.7163,
      lng: -9.1314,
    },
  ],
};

export interface ExpenseItem {
  id?: string;
  paidBy: string;
  amount: number;
  desc: string;
  category?: string;
  splitBetween?: string[];
}

export const EXPENSES: ExpenseItem[] = [
  { id: 'exp-1', paidBy: 'Bob', amount: 240, desc: 'Lodging, 2 nights', category: 'Lodging', splitBetween: ['Alice', 'Bob', 'Cara'] },
  { id: 'exp-2', paidBy: 'Alice', amount: 60, desc: 'Time Out Market lunch', category: 'Food', splitBetween: ['Alice', 'Bob', 'Cara'] },
];

export interface TripSummary {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  creator_id: string;
  status: TripStatus;
  member_ids: string[];
}

export const DEFAULT_TRIP: TripSummary = {
  id: 'trip-lisbon-202',
  title: 'Lisbon trip',
  destination: 'Lisbon, Portugal',
  start_date: '2026-06-12',
  end_date: '2026-06-14',
  creator_id: 'alice',
  status: 'collecting_constraints',
  member_ids: ['alice', 'bob', 'cara'],
};

export const INITIAL_TRIPS: TripSummary[] = [
  DEFAULT_TRIP,
  {
    id: 'trip-tokyo-101',
    title: 'Tokyo Autumn Expedition',
    destination: 'Tokyo, Japan',
    start_date: '2026-10-12',
    end_date: '2026-10-18',
    creator_id: 'alice',
    status: 'planned',
    member_ids: ['alice', 'bob'],
  },
];
