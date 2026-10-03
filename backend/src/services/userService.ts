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

export async function registerUser(username: string, email: string, password: string) {
    const hashed = await bcrypt.hash(password, 10);
    try {
        return await prisma.user.create({
            data: { username, email, password: hashed },
            select: { id: true, username: true, email: true },
        });
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            const target = err.meta?.target;
            const fields = Array.isArray(target) ? target : [target];
            if (fields.includes('email')) {
                throw new HttpError(409, '该邮箱已注册，请直接登录或使用其他邮箱', 'EMAIL_ALREADY_REGISTERED');
            }
            if (fields.includes('username')) {
                throw new HttpError(409, '该昵称已被使用，请换一个昵称', 'USERNAME_ALREADY_EXISTS');
            }
            throw new HttpError(409, '账户信息已被使用，请更换昵称或邮箱', 'ACCOUNT_ALREADY_EXISTS');
        }
        throw err;
    }
}

export async function loginUser(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('用户不存在');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error('密码错误');

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
        expiresIn: '3d',
    });

    return { token, user: { id: user.id, username: user.username, email: user.email } };
}
