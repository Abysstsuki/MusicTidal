'use client';

import { useState } from 'react';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from './authmodal';

export default function UserInfo({ isPreview = false }: { isPreview?: boolean }) {
  const { user, login, logout } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  return <div className="account">
    <button className="account-button" onClick={() => user ? setShowMenu(value => !value) : setShowAuth(true)} aria-label={user ? '账户 ' + user.username : '登录或注册'} aria-expanded={user ? showMenu : showAuth}>
      <span className="listener-avatar"><AccountCircleOutlined /></span><span className="account-name">{user?.username || '登录'}</span>{user && <ExpandMoreRounded fontSize="small" />}
    </button>
    {showMenu && <><button className="account-menu-backdrop" aria-label="关闭账户菜单" onClick={() => setShowMenu(false)} /><div className="account-menu">
      <p>{user?.username}</p>{isPreview && <span>这是视觉预览账户</span>}
      {isPreview ? <button onClick={() => window.location.assign('/')}>返回大厅</button> : <button onClick={() => { void logout(); setShowMenu(false); }}><LogoutRounded fontSize="small" />退出登录</button>}
    </div></>}
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLoginSuccess={login} />}
  </div>;
}
