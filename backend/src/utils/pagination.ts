import type { PaginationMeta } from '@bbms/shared';

export interface PageRequest {
  page: number;
  limit: number;
}

export function pageToSkip({ page, limit }: PageRequest): number {
  return (page - 1) * limit;
}

export function buildPaginationMeta({ page, limit }: PageRequest, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Escapes user input for safe use inside a regular expression (search boxes). */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
