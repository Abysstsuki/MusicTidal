'use client';

import { useState } from 'react';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { useMusicContext } from '@/contexts/MusicContext';
import AuthModal from './authmodal';

export default function UserInfo() {
  const { user, login, logout, isPreview } = useMusicContext();
  const [showAuth, setShowAuth] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  return <div className="account">
    <button className="account-button" onClick={() => user ? setShowMenu(value => !value) : setShowAuth(true)} aria-label={user ? '账户 ' + user.username : '登录或注册'} aria-expanded={user ? showMenu : showAuth}>
      <span className="listener-avatar"><AccountCircleOutlined /></span><span className="account-name">{user?.username || '登录'}</span>{user && <ExpandMoreRounded fontSize="small" />}
    </button>
    {showMenu && <><button className="account-menu-backdrop" aria-label="关闭账户菜单" onClick={() => setShowMenu(false)} /><div className="account-menu">
      <p>{user?.username}</p><span>{isPreview ? '这是视觉预览账户' : '和大家一起，让音乐发生'}</span>
      {isPreview ? <button onClick={() => window.location.assign('/')}>返回真实听歌</button> : <button onClick={() => { logout(); setShowMenu(false); }}><LogoutRounded fontSize="small" />退出登录</button>}
    </div></>}
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLoginSuccess={login} />}
  </div>;
}
