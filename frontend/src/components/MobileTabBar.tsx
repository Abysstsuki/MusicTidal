'use client';

type TabKey = 'info' | 'request' | 'lyrics' | 'chat' | 'queue';

interface MobileTabBarProps {
    activeTab: TabKey;
    onTabChange: (tab: TabKey) => void;
}

const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'info', label: '在线', icon: '◉' },
    { key: 'request', label: '点歌', icon: '♫' },
    { key: 'lyrics', label: '歌词', icon: '♪' },
    { key: 'chat', label: '聊天', icon: '◬' },
    { key: 'queue', label: '队列', icon: '☰' },
];

export default function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
    return (
        <nav
            className="mobile-tabbar"
            style={{
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'space-around',
                borderTop: '1px solid var(--line)',
                background: 'var(--bg-panel)',
                backdropFilter: 'blur(20px)',
                flexShrink: 0,
            }}
        >
            {tabs.map(({ key, label, icon }) => {
                const isActive = activeTab === key;
                return (
                    <button
                        key={key}
                        onClick={() => onTabChange(key)}
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 2,
                            padding: '8px 4px 6px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: isActive ? 'var(--accent-blue)' : 'var(--text-muted)',
                            borderTop: isActive ? '2px solid var(--accent-blue)' : '2px solid transparent',
                            transition: 'color 0.2s, border-color 0.2s',
                            outline: 'none',
                        }}
                    >
                        <span style={{ fontSize: '16px', lineHeight: 1 }}>{icon}</span>
                        <span style={{
                            fontSize: '9px',
                            letterSpacing: '0.2em',
                            lineHeight: 1,
                        }}>
                            {label}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}
