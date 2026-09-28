import type { Response } from 'express';
import type { ApiSuccess, PaginationMeta } from '@bbms/shared';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, meta?: PaginationMeta) {
  const body: ApiSuccess<T> = { success: true, data, ...(meta && { meta }) };
  return res.status(statusCode).json(body);
}
