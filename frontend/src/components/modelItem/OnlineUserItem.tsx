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
                    ? '0.5px solid rgba(58,107,255,0.3)'
                    : '0.5px solid rgba(255,255,255,0.08)',
                fontSize: '9px',
                letterSpacing: '0.1em',
                color: isCurrentUser ? '#3A6BFF' : '#8B8FA3',
                background: 'transparent'
            }}
        >
            {id}
        </motion.div>
    );
}
