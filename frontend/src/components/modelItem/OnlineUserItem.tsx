// OnlineUserItem.tsx
'use client';
import { motion } from 'framer-motion';

interface OnlineUserItemProps {
    id: string;
}

export default function OnlineUserItem({ id }: OnlineUserItemProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all text-white font-medium text-sm w-[calc(50%-0.25rem)]"
        >
            {id}
        </motion.div>
    );
}
