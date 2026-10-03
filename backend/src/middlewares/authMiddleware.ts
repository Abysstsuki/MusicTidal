import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../utils/httpError';

export interface AuthRequest extends Request {
  user?: { userId: number };
}

export function verifyAccessToken(token: unknown) {
  if (typeof token !== 'string' || !token) throw new HttpError(401, '请先登录');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (!Number.isSafeInteger(decoded.userId) || decoded.userId <= 0 || !decoded.exp) throw new Error();
    return { userId: decoded.userId as number, expiresAt: decoded.exp * 1000 };
  } catch { throw new HttpError(401, '登录已过期，请重新登录'); }
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  try {
    const token = authHeader?.match(/^Bearer (.+)$/i)?.[1];
    req.user = { userId: verifyAccessToken(token).userId }; next();
  } catch (error) { next(error); }
};
