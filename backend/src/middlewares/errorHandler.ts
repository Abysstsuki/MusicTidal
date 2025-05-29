import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误',
  });
}
