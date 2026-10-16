import { Card, SectionLabel } from './shared';
import ListRow from '../ListRow';
import { relativeLabel } from '../../lib/coachInbox';
import { totalUnread } from '../../lib/coachUnread';

// Who has written to the coach since they last looked, newest first — the
// coach-side counterpart of the client's bell. Tapping a row opens that
// client's messages. Renders nothing when there's nothing new.
export default function ClientMessagesInbox({ unread, clients, onOpen }) {
  const total = totalUnread(unread);
  if (total === 0) return null;
  const byId = new Map(clients.map((r) => [r.client?.id, r]));
  const items = [...unread.entries()]
    .filter(([id]) => byId.has(id))
    .sort((a, b) => new Date(b[1].latestAt) - new Date(a[1].latestAt));
  if (items.length === 0) return null;

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <SectionLabel icon="ti-message-circle">Messages</SectionLabel>
        <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600, marginBottom: 18 }} data-testid="inbox-total">{total} new</span>
      </div>
      {items.map(([id, info]) => {
        const row = byId.get(id);
        return (
          <ListRow
            key={id}
            avatar={<ListRow.SquareAvatar name={row.client?.name} />}
            title={row.client?.name || 'Unnamed client'}
            subtitleParts={[info.latestBody.length > 90 ? `${info.latestBody.slice(0, 90)}…` : info.latestBody, relativeLabel(info.latestAt)]}
            trailing={<ListRow.Badge tone="accent" withChevron label={`${info.unread} new ${info.unread === 1 ? 'message' : 'messages'}`}>{info.unread}</ListRow.Badge>}
            onClick={() => onOpen(row.client)}
          />
        );
      })}
    </Card>
  );
}
