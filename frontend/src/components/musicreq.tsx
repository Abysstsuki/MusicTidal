'use client';

import { Button, TextField } from '@mui/material';
import { useState } from 'react';

interface MusicRequestModalProps {
    onClose: () => void;
}

export default function MusicRequestModal({ onClose }: MusicRequestModalProps) {
    const [keyword, setKeyword] = useState('');

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
            <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full p-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">点歌</h2>
                    <Button onClick={onClose}>关闭</Button>
                </div>

                <TextField
                    fullWidth
                    variant="outlined"
                    label="输入歌曲关键词"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    sx={{ mb: 4 }}
                />

                <div className="text-gray-500 text-sm mb-6">
                    搜索结果将显示在这里（开发中）
                </div>

                <div className="flex justify-end space-x-2">
                    <Button onClick={onClose} variant="outlined" color="inherit">
                        取消
                    </Button>
                    <Button
                        onClick={() => alert(`搜索：${keyword}`)}
                        variant="contained"
                        color="primary"
                    >
                        搜索
                    </Button>
                </div>
            </div>
        </div>
    );
}
