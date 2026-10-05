/**
 * ==============================================================================
 * CANONICAL SHARED TYPES CONTRACT
 * ==============================================================================
 * This file is the single source of truth for domain data contracts between
 * the FastAPI backend and the React frontend.
 *
 * Any changes here must be reflected in backend/app/models/ and packages/shared/openapi.yaml.
 */

export type TripStatus =
  | "collecting_constraints"
  | "planned"
  | "in_progress"
  | "completed"
  | "flagged";

export type ValidationStatus = "valid" | "invalid" | "partial";

export type DisruptionType =
  | "venue_closed"
  | "flight_delayed"
  | "weather_alert"
  | "custom";

export interface Trip {
  id: string;
  title: string;
  destination: string;
  start_date: string; // ISO 8601 date: YYYY-MM-DD
  end_date: string; // ISO 8601 date: YYYY-MM-DD
  creator_id: string;
  status: TripStatus;
  member_ids: string[];
  created_at: string; // ISO 8601 datetime
}

export interface CreateTripRequest {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  creator_id: string;
}

export interface Constraint {
  id: string;
  trip_id: string;
  user_id: string;
  budget_per_day: number;
  dietary: string[];
  style_tags: string[];
  must_see: string[];
  must_avoid: string[];
  updated_at?: string;
}

export interface SubmitConstraintRequest {
  user_id: string;
  budget_per_day: number;
  dietary?: string[];
  style_tags?: string[];
  must_see?: string[];
  must_avoid?: string[];
}

export interface OpeningHoursPeriod {
  open: { day: number; time: string }; // e.g. time: "0900"
  close?: { day: number; time: string }; // e.g. time: "1800"
}

export interface OpeningHours {
  open_now?: boolean;
  periods?: OpeningHoursPeriod[];
  weekday_text?: string[];
}

export interface Place {
  place_id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  est_cost: number;
  opening_hours?: OpeningHours | null;
}

export interface PlanItem {
  id?: string;
  place_id: string;
  place?: Place;
  day_index: number;
  start_time: string; // ISO 8601 datetime
  end_time: string; // ISO 8601 datetime
  cost: number;
}

export interface PlanDay {
  date: string; // ISO 8601 date: YYYY-MM-DD
  day_index: number;
  items: PlanItem[];
}

export interface Plan {
  id: string;
  trip_id: string;
  version: number;
  validation_status: ValidationStatus;
  days: PlanDay[];
  notes: string[];
  created_at: string;
}

export interface DisruptionEvent {
  type: DisruptionType;
  day_index: number;
  place_id?: string;
  delay_minutes?: number;
  description?: string;
}

export interface Expense {
  id: string;
  trip_id: string;
  paid_by: string;
  amount: number;
  description: string;
  category?: string;
  split_between: string[];
  created_at: string;
}

export interface CreateExpenseRequest {
  paid_by: string;
  amount: number;
  description: string;
  category?: string;
  split_between?: string[];
}

export interface DebtTransfer {
  debtor_id: string;
  creditor_id: string;
  amount: number;
}

export interface UserBalanceSummary {
  user_id: string;
  total_paid: number;
  total_share: number;
  net_balance: number;
}

export interface SettleUpReport {
  trip_id: string;
  user_balances: UserBalanceSummary[];
  transfers: DebtTransfer[];
}

export interface ValidationIssue {
  type: "budget" | "travel_time" | "open_hours";
  severity: "error" | "warning";
  day_index?: number;
  place_id?: string;
  user_id?: string;
  message: string;
  suggested_action?: string;
}

export interface ValidationResult {
  is_valid: boolean;
  status: ValidationStatus;
  issues: ValidationIssue[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  is_admin?: boolean;
  created_at: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface UpdateTripRequest {
  title?: string;
  destination?: string;
  start_date?: string;
  end_date?: string;
  status?: TripStatus;
  member_ids?: string[];
}

export interface CreatePlanItemRequest {
  day_index: number;
  place_name: string;
  category?: string;
  start_time: string; // ISO 8601 datetime
  end_time: string; // ISO 8601 datetime
  cost?: number;
  lat?: number;
  lng?: number;
}

export interface UpdatePlanItemRequest {
  day_index?: number;
  place_name?: string;
  category?: string;
  start_time?: string;
  end_time?: string;
  cost?: number;
  lat?: number;
  lng?: number;
}

export interface RefinePlanRequest {
  instruction: string;
  user_id?: string;
}

export interface AskAgentRequest {
  question: string;
}

export interface AskAgentResponse {
  question: string;
  answer: string;
}

export interface UpdateExpenseRequest {
  paid_by?: string;
  amount?: number;
  description?: string;
  category?: string;
  split_between?: string[];
}

export interface Member {
  id: string;
  name: string;
  initials: string;
  submitted: boolean;
  role: 'creator' | 'joiner';
}

export interface MemberResponse extends Member {
  access_token?: string | null;
}

export interface JoinTripRequest {
  name: string;
  user_id?: string;
}

export interface TripPermissions {
  can_manage: boolean;
  is_creator: boolean;
  role: 'creator' | 'joiner';
}

export type TripPermissionsResponse = TripPermissions;
