import { ApiError } from './api';

const messages: Record<string, string> = {
  USERNAME_REQUIRED: '请输入昵称',
  USERNAME_TOO_LONG: '昵称不能超过 40 个字符',
  EMAIL_REQUIRED: '请输入邮箱',
  EMAIL_INVALID: '邮箱格式不正确，请检查后重试',
  PASSWORD_REQUIRED: '请输入密码',
  PASSWORD_TOO_SHORT: '密码至少需要 6 位',
  USERNAME_ALREADY_EXISTS: '该昵称已被使用，请换一个昵称',
  EMAIL_ALREADY_REGISTERED: '该邮箱已注册，请直接登录或使用其他邮箱',
  ACCOUNT_ALREADY_EXISTS: '账户信息已被使用，请更换昵称或邮箱',
  INVALID_CREDENTIALS: '邮箱或密码不正确，请检查后重试',
};

export function validateAuthInput(username: string, email: string, password: string, registering: boolean): string {
  if (registering && !username.trim()) return messages.USERNAME_REQUIRED;
  if (registering && username.trim().length > 40) return messages.USERNAME_TOO_LONG;
  if (!email.trim()) return messages.EMAIL_REQUIRED;
  if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return messages.EMAIL_INVALID;
  if (!password) return messages.PASSWORD_REQUIRED;
  if (registering && password.length < 6) return messages.PASSWORD_TOO_SHORT;
  return '';
}

export function authErrorMessage(error: unknown, registering: boolean): string {
  const action = registering ? '注册' : '登录';
  if (error instanceof ApiError) {
    if (error.code && Object.hasOwn(messages, error.code)) return messages[error.code];
    // Older deployments may still return database messages. Translate recognized
    // conflicts without displaying any part of the database diagnostic.
    if (/unique constraint|P2002/i.test(error.message)) {
      if (/username/i.test(error.message)) return messages.USERNAME_ALREADY_EXISTS;
      if (/email/i.test(error.message)) return messages.EMAIL_ALREADY_REGISTERED;
      return messages.ACCOUNT_ALREADY_EXISTS;
    }
    if (Object.values(messages).includes(error.message)) return error.message;
    if (error.message === '用户不存在' || error.message === '密码错误') return messages.INVALID_CREDENTIALS;
    if (error.status === 429) return '操作过于频繁，请稍后再试';
    if (error.status >= 500) return `${action}服务暂不可用，请稍后重试`;
    if (error.status === 409) return messages.ACCOUNT_ALREADY_EXISTS;
    if (!registering && (error.status === 400 || error.status === 401)) return messages.INVALID_CREDENTIALS;
    if (error.status === 400 || error.status === 422) return '注册信息不正确，请检查昵称、邮箱和密码';
  }
  if (error instanceof TypeError) return '网络连接失败，请检查网络后重试';
  if (error instanceof Error && error.name === 'TimeoutError') return '请求超时，请稍后重试';
  return `${action}暂未完成，请稍后重试`;
}
