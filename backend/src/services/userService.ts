import { prisma } from '../utils/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Prisma } from '../generated/prisma';
import { HttpError } from '../utils/httpError';


export const getUserById = async (userId: number) => {
    return prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            username: true,
            email: true,
        },
    });
};

function validateEmail(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new HttpError(400, '请输入邮箱', 'EMAIL_REQUIRED');
    }
    const email = value.trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, '邮箱格式不正确，请检查后重试', 'EMAIL_INVALID');
    }
    return email;
}

function validatePassword(value: unknown, registering = false): string {
    if (typeof value !== 'string' || !value) {
        throw new HttpError(400, '请输入密码', 'PASSWORD_REQUIRED');
    }
    if (registering && value.length < 6) {
        throw new HttpError(400, '密码至少需要 6 位', 'PASSWORD_TOO_SHORT');
    }
    return value;
}

export async function registerUser(usernameValue: unknown, emailValue: unknown, passwordValue: unknown) {
    if (typeof usernameValue !== 'string' || !usernameValue.trim()) {
        throw new HttpError(400, '请输入昵称', 'USERNAME_REQUIRED');
    }
    const username = usernameValue.trim();
    if (username.length > 40) {
        throw new HttpError(400, '昵称不能超过 40 个字符', 'USERNAME_TOO_LONG');
    }
    const email = validateEmail(emailValue);
    const password = validatePassword(passwordValue, true);
    const hashed = await bcrypt.hash(password, 10);
    try {
        return await prisma.user.create({
            data: { username, email, password: hashed },
            select: { id: true, username: true, email: true },
        });
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            const target = err.meta?.target;
            const fields = (Array.isArray(target) ? target : [target]).map(String);
            if (fields.some(field => field === 'email' || field.endsWith('_email_key'))) {
                throw new HttpError(409, '该邮箱已注册，请直接登录或使用其他邮箱', 'EMAIL_ALREADY_REGISTERED');
            }
            if (fields.some(field => field === 'username' || field.endsWith('_username_key'))) {
                throw new HttpError(409, '该昵称已被使用，请换一个昵称', 'USERNAME_ALREADY_EXISTS');
            }
            throw new HttpError(409, '账户信息已被使用，请更换昵称或邮箱', 'ACCOUNT_ALREADY_EXISTS');
        }
        throw err;
    }
}

export async function loginUser(emailValue: unknown, passwordValue: unknown) {
    const email = validateEmail(emailValue);
    const password = validatePassword(passwordValue);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new HttpError(401, '邮箱或密码不正确，请检查后重试', 'INVALID_CREDENTIALS');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new HttpError(401, '邮箱或密码不正确，请检查后重试', 'INVALID_CREDENTIALS');

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
        expiresIn: '3d',
    });

    return { token, user: { id: user.id, username: user.username, email: user.email } };
}
