import { useEffect, useState } from 'react';
import DragSheet from '../DragSheet';
import PersonRow from './PersonRow';
import { useClosingTransition } from '../../hooks/useClosingTransition';
import { getFollowList } from '../../lib/community';

/** Who follows someone / who they follow. */
export default function PeopleSheet({ title, userId, kind, onClose, onOpen }) {
  const { closing, close } = useClosingTransition(onClose);
  const [people, setPeople] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getFollowList(userId, kind).then((rows) => { if (!cancelled) setPeople(rows); }).catch(() => { if (!cancelled) setPeople([]); });
    return () => { cancelled = true; };
  }, [userId, kind]);
  return (
    <DragSheet title={title} onClose={close} closing={closing}>
      {people === null ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>
        : people.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nobody yet.</p>
        : people.map((p) => <PersonRow key={p.user_id} person={p} onOpen={(u) => { close(); setTimeout(() => onOpen(u), 170); }} />)}
    </DragSheet>
  );
}
