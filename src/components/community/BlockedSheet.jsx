import { useEffect, useState } from 'react';
import DragSheet from '../DragSheet';
import PersonRow from './PersonRow';
import { useAuth } from '../../hooks/useAuth';
import { useClosingTransition } from '../../hooks/useClosingTransition';
import { getBlockedPeople, unblockUser, friendlyCommunityError } from '../../lib/community';

/** People you've blocked, with a way to undo it. */
export default function BlockedSheet({ onClose, onToast }) {
  const { user } = useAuth();
  const { closing, close } = useClosingTransition(onClose);
  const [people, setPeople] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getBlockedPeople().then((rows) => { if (!cancelled) setPeople(rows); }).catch(() => { if (!cancelled) setPeople([]); });
    return () => { cancelled = true; };
  }, []);

  async function unblock(person) {
    try {
      await unblockUser(user.id, person.user_id);
      setPeople((rows) => rows.filter((r) => r.user_id !== person.user_id));
      onToast?.(`Unblocked @${person.username}`);
    } catch (err) {
      onToast?.(friendlyCommunityError(err), true);
    }
  }

  return (
    <DragSheet title="Blocked people" onClose={close} closing={closing}>
      {people === null ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>
        : people.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>You haven't blocked anyone.</p>
        : people.map((p) => (
          <PersonRow key={p.user_id} person={{ ...p, is_private: false }}>
            <button type="button" onClick={() => unblock(p)} style={{ flexShrink: 0, minHeight: 36, padding: '7px 14px', borderRadius: 14, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>Unblock</button>
          </PersonRow>
        ))}
    </DragSheet>
  );
}
