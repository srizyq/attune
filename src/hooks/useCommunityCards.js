import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { recheckPending } from '../lib/communityPhotos';

const PAGE = 20;

// A paged list of posts (the feed, someone's profile, saved). `fetchPage(before)`
// returns up to PAGE cards, newest first; the next page asks for posts older
// than the last one shown. Rows can be patched or removed locally so a heart,
// a save or a delete feels instant.
export function useCommunityCards(fetchPage, { enabled = true } = {}) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const fetchRef = useRef(fetchPage);
  useEffect(() => { fetchRef.current = fetchPage; });
  const seq = useRef(0);

  const refetch = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const rows = await fetchRef.current(null);
      if (mine !== seq.current) return;
      setCards(rows);
      setHasMore(rows.length >= PAGE);
      setError(null);
    } catch (err) {
      if (mine !== seq.current) return;
      console.error('Failed to load posts:', err);
      setError(err);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { if (enabled) refetch(); else setLoading(false); }, [enabled, refetch]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cards.length) return;
    setLoadingMore(true);
    try {
      const rows = await fetchRef.current(cards[cards.length - 1].created_at);
      setCards((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
      setHasMore(rows.length >= PAGE);
    } catch (err) {
      console.error('Failed to load more posts:', err);
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  }, [cards, loadingMore]);

  // One of your own photos still waiting on its check (it failed last time): try again.
  const { user } = useAuth();
  const userId = user?.id || null;
  useEffect(() => {
    if (!userId) return;
    cards.filter((c) => c.author_id === userId && c.photo_status === 'pending' && c.photo_path).forEach(async (c) => {
      const status = await recheckPending({ kind: 'post', postId: c.id, path: c.photo_path });
      if (status) setCards((prev) => prev.map((x) => (x.id === c.id ? { ...x, photo_status: status } : x)));
    });
  }, [cards, userId]);

  const patch = useCallback((id, fields) => setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...fields } : c))), []);
  const remove = useCallback((id) => setCards((prev) => prev.filter((c) => c.id !== id)), []);

  return { cards, loading, loadingMore, hasMore, error, refetch, loadMore, patch, remove };
}
