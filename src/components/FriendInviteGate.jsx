import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { takePendingFriend } from '../lib/friends';

// Mounted once inside RequireAuth. A friend's invite link opened before the
// person had an account (or while logged out) leaves its code behind; once
// they're in, this sends them to the page that adds the friend.
export default function FriendInviteGate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const code = takePendingFriend();
    if (code) navigate(`/friends/join/${code}`, { replace: true });
  }, [userId, navigate]);
  return null;
}
