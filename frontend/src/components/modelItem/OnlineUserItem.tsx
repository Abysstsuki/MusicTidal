'use client';
import { motion } from 'framer-motion';

interface OnlineUserItemProps {
    id: string;
    currentUser?: string | null;
}

export default function OnlineUserItem({ id, currentUser }: OnlineUserItemProps) {
    const isCurrentUser = id === currentUser;
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
            style={{
                padding: '3px 8px',
                border: isCurrentUser
                    ? '1px solid var(--accent-blue-line)'
                    : '1px solid var(--line)',
                fontSize: '9px',
                letterSpacing: '0.1em',
                color: isCurrentUser ? 'var(--accent-blue)' : 'var(--text-secondary)',
                background: 'transparent'
            }}
        >
            {id}
        </motion.div>
    );
}
