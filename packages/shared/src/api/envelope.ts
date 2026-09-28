import type { ErrorCode } from '../constants/errorCodes.js';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  message: string;
  errorCode: ErrorCode;
  details?: FieldError[];
  /** Correlates a client-visible failure with server logs. */
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface HealthStatus {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  version: string;
  checks: {
    database: 'up' | 'down';
  };
}
