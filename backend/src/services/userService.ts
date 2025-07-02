import { PrismaClient } from '../generated/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

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
    return prisma.user.create({
        data: { username, email, password: hashed },
    });
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
