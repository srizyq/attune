import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommunityAccess } from './useCommunityAccess';
import { useCommunity } from './useCommunity';
import ShareSheet from '../components/community/ShareSheet';

/**
 * Lets a page offer "Share to Community". `canShare` is false while Community is
 * switched off (so the page shows no button); `share(draft)` opens the sheet, or
 * sends someone who hasn't joined yet to the join screen first.
 * Render `sheet` anywhere in the page.
 */
export function useCommunityShare(onToast) {
  const navigate = useNavigate();
  const { enabled } = useCommunityAccess();
  const { me } = useCommunity({ enabled });
  const [draft, setDraft] = useState(null);

  const share = (d) => {
    if (!me) { navigate('/community'); return; }
    setDraft(d);
  };

  const sheet = draft && me
    ? <ShareSheet key={draft.payload.title + draft.kind} draft={draft} initialNote={draft.initialNote || ''} me={me} onClose={() => setDraft(null)} onPosted={onToast} />
    : null;

  return { canShare: enabled, me, share, sheet };
}
