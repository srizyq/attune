import { useClosingTransition } from '../../hooks/useClosingTransition';
import DragSheet from '../DragSheet';
import MessagesTab from './MessagesTab';

// A client's conversation and private notes, in a sheet over whatever tab the
// coach was on — messaging is the thing a coach does most, so it's one tap away
// from anywhere on the client rather than the fourth of six tabs.
export default function MessagesSheet({ client, clientData, d, draft, onClose, onViewed }) {
  const { closing, close } = useClosingTransition(onClose);
  const first = String(clientData?.name || '').trim().split(/\s+/)[0];
  return (
    <DragSheet title={first ? `Messages — ${first}` : 'Messages'} onClose={close} closing={closing}>
      <MessagesTab client={client} clientData={clientData} d={d} onViewed={onViewed} initialDraft={draft} />
    </DragSheet>
  );
}
