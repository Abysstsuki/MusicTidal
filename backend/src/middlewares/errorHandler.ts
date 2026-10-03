import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/httpError';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const status = err instanceof HttpError ? err.status : err.status === 400 ? 400 : 500;
  if (status >= 500) console.warn('API request failed:', req.method, req.path);
  res.status(status).json({
    success: false,
    error: err instanceof HttpError ? err.message : status === 400 ? '请求格式错误' : '服务暂不可用，请稍后重试',
    code: err instanceof HttpError ? err.code : undefined,
  });
}
