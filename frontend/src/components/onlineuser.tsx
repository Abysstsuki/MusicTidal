'use client';

import { useState } from 'react';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import HeadphonesRounded from '@mui/icons-material/HeadphonesRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { useMusicContext } from '@/contexts/MusicContext';
import StageDialog from './StageDialog';

export default function OnlineUser() {
  const { onlineUsers, user } = useMusicContext();
  const [open, setOpen] = useState(false);
  return <>
    <button className="online-listeners" onClick={() => setOpen(true)} aria-label={'查看在线听众，' + onlineUsers.length + ' 人'}>
      <span className="listener-stack">{onlineUsers.slice(0, 4).map((name, index) => <span className={'listener-avatar avatar-tone-' + index} key={name} title={name}><AccountCircleOutlined /></span>)}</span>
      <span>{onlineUsers.length ? onlineUsers.length + ' 人一起听' : '暂无在线听众'}</span>
    </button>
    {open && <StageDialog label="在线听众" onClose={() => setOpen(false)}>
      <div className="popover-heading"><h2><HeadphonesRounded />在线听众</h2><button className="icon-button" onClick={() => setOpen(false)} aria-label="关闭在线听众"><CloseRounded /></button></div>
      <div className="listener-list">{onlineUsers.map(name => <div className="listener-row" key={name}><span className="listener-avatar"><AccountCircleOutlined /></span><span>{name}</span>{name === user?.username && <small>你</small>}</div>)}
        {!onlineUsers.length && <div className="panel-empty"><HeadphonesRounded /><p>暂无在线听众</p><span>登录后，你的名字会出现在这里</span></div>}
      </div>
    </StageDialog>}
  </>;
}
