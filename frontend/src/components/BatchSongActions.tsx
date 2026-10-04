'use client';

import { useEffect, useRef } from 'react';
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined';
import AddRounded from '@mui/icons-material/AddRounded';
import type { BatchSongSelection } from '@/hooks/useBatchSongSelection';
import { MAX_BATCH_SONGS } from '@/hooks/useBatchSongSelection';
import { providerName, songKey, type Song } from '@/types/music';
import styles from './batch-song.module.css';

export function BatchSongCheckbox({ batch, song, index }: { batch: BatchSongSelection; song: Song; index: number }) {
  const checked = batch.selected.has(songKey(song));
  return <input type="checkbox" className={styles.checkbox} aria-label={'选择 ' + providerName(song.provider) + '歌曲 ' + song.name}
    checked={checked} disabled={batch.locked || (!checked && !batch.available(song))}
    title={batch.unavailableReason(song) || '选择歌曲'} onChange={() => batch.toggle(song, index)} />;
}

export default function BatchSongActions({ batch, loading = false, canStart = true }: { batch: BatchSongSelection; loading?: boolean; canStart?: boolean }) {
  const allRef = useRef<HTMLInputElement>(null);
  const entryRef = useRef<HTMLButtonElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  const previousActive = useRef(batch.active);
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = batch.indeterminate; }, [batch.indeterminate, batch.active]);
  useEffect(() => {
    if (previousActive.current !== batch.active) (batch.active ? exitRef.current : entryRef.current)?.focus();
    previousActive.current = batch.active;
  }, [batch.active]);
  if (!batch.active) return <div className={styles.entry}><button ref={entryRef} type="button" disabled={batch.locked || loading || !canStart} onClick={batch.start}><CheckBoxOutlined aria-hidden="true" />批量选择</button></div>;
  const problems = batch.items.filter(item => item.failure || !batch.available(item.song));
  return <div className={styles.container} aria-busy={batch.pending}>
    <div className={styles.header}>
      <span className={styles.modeTitle}><CheckBoxOutlined aria-hidden="true" />批量选择</span>
      <span className={styles.count} title="最多选择 100 首，翻页保留选择">已选 <strong>{batch.selected.size}</strong>／{MAX_BATCH_SONGS}</span>
      <button ref={exitRef} type="button" className={styles.exit} disabled={batch.locked} onClick={batch.cancel}>退出选择</button>
    </div>
    <div className={styles.actions} role="group" aria-label="批量添加歌曲">
      <div className={styles.selectionControls}>
        <label className={styles.selectAll} title="仅选择当前页可入队的歌曲"><input ref={allRef} className={styles.checkbox} type="checkbox" checked={batch.allChecked}
          disabled={batch.locked || loading || !batch.hasEligiblePage} onChange={batch.togglePage} />当页全选</label>
        <button type="button" disabled={batch.locked || !batch.selected.size} onClick={batch.clear}>清空选择</button>
      </div>
      <button type="button" className={styles.primary} aria-label="加入常规待播" disabled={batch.locked || !batch.canSubmit} onClick={() => void batch.submit()}>
        <AddRounded aria-hidden="true" />{batch.pending ? '正在加入…' : '加入常规待播'}
      </button>
    </div>
    {batch.notice && <p className={styles.notice} role="status">{batch.notice}</p>}
    {problems.length > 0 && <details className={styles.problems} open>
      <summary>失败或授权不可用 · {problems.length} 首</summary>
      <ul>{problems.map(({ song, failure }) => <li key={songKey(song)}>
        <div><strong>{song.name} · {providerName(song.provider)}</strong><span>{batch.unavailableReason(song) || failure?.message}</span></div>
        <button type="button" disabled={batch.locked} aria-label={'取消选择 ' + song.name} onClick={() => batch.toggle(song, 0)}>取消选择</button>
      </li>)}</ul>
      {batch.items.some(item => item.failure) && <button type="button" disabled={batch.locked || !batch.canRetry} onClick={() => void batch.submit(true)}>重试失败项</button>}
    </details>}
  </div>;
}
