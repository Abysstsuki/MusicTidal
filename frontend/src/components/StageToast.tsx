'use client';

import { useEffect } from 'react';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

export default function StageToast({ message, error = false, onDismiss }: { message: string; error?: boolean; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2600);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  return <div className={'stage-toast' + (error ? ' is-error' : '')} role="status" aria-live="polite">
    {error ? <InfoOutlined fontSize="small" /> : <CheckCircleOutlineRounded fontSize="small" />}<span>{message}</span>
  </div>;
}
