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

export interface ExpenseItem {
  id?: string;
  paidBy: string;
  amount: number;
  desc: string;
  category?: string;
  splitBetween?: string[];
}

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
