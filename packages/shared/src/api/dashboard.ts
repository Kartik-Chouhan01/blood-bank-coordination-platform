import type { BloodGroup } from '../constants/blood.js';
import type { Urgency } from '../constants/statuses.js';

/** Public, coarse stock level per blood group — never exact counts. */
export type StockLevel = 'LOW' | 'MODERATE' | 'GOOD';

export interface PublicStats {
  stock: { bloodGroup: BloodGroup; level: StockLevel }[];
  /** When the levels were computed (they are cached for a few minutes). */
  updatedAt: string;
}

/** Blood-bank staff / administrator home: what needs attention right now. */
export interface StaffOverview {
  requests: {
    open: number;
    pendingReview: number;
    overdue: number;
    openByUrgency: Record<Urgency, number>;
  };
  /** Usable units (available, tested, in date) per blood group, all components, in scope. */
  stockByGroup: { bloodGroup: BloodGroup; units: number }[];
  expiringSoon: number;
  expiryWarningDays: number;
  /** Reserved units not yet issued, in scope. */
  awaitingIssue: number;
  outreach: { awaitingReply: number; interested: number };
  verification: {
    /** null when the viewer may not verify hospitals. */
    hospitalsPending: number | null;
    donorsPending: number;
  };
  /** The bank the stock figures cover; null = whole network. */
  bloodBank: { id: string; name: string } | null;
}

export type AnalyticsBucket = 'day' | 'week' | 'month';

export interface AnalyticsPoint {
  /** Start of the bucket as a local calendar date (YYYY-MM-DD) in the platform time zone. */
  bucket: string;
  requestsRaised: number;
  requestsFulfilled: number;
  unitsIssued: number;
  donations: number;
  unitsExpired: number;
}

export interface AnalyticsReport {
  range: { from: string; to: string; days: number; bucket: AnalyticsBucket; timeZone: string };
  /** Units and donations are scoped to this bank; requests are always network-wide. */
  bloodBank: { id: string; name: string } | null;
  totals: {
    requestsRaised: number;
    emergencyRequests: number;
    requestsFulfilled: number;
    /** Share of closed requests raised in the period that were fulfilled (rejections excluded). */
    fulfilmentRate: number | null;
    /** From creation to FULFILLED, requests fulfilled in the period. */
    medianHoursToFulfil: number | null;
    emergencyMedianHoursToFulfil: number | null;
    unitsIssued: number;
    donations: number;
    unitsExpired: number;
    /** Discarded for any other reason (failed testing, damage) — excludes disposal of expired units. */
    unitsDiscarded: number;
    /** Expired ÷ (issued + expired): the share of usable stock lost to expiry. */
    expiryWastageRate: number | null;
    donorsContacted: number;
    donorsInterested: number;
  };
  series: AnalyticsPoint[];
  /** Requests raised in the period: units asked for vs issued, per requested group. */
  byBloodGroup: { bloodGroup: BloodGroup; unitsRequested: number; unitsIssued: number }[];
}

/** A hospital's own recent performance. */
export interface HospitalDashboard {
  days: number;
  requestsRaised: number;
  requestsFulfilled: number;
  fulfilmentRate: number | null;
  medianHoursToFulfil: number | null;
  unitsReceived: number;
  awaitingReceipt: number;
}
