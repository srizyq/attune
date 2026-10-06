import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import ActionSheet from '../components/community/ActionSheet';
import CopySheet from '../components/community/CopySheet';
import EditNoteSheet from '../components/community/EditNoteSheet';
import ReportSheet from '../components/community/ReportSheet';
import { blockUser, deletePost, friendlyCommunityError, setReaction, setSaved, updatePost } from '../lib/community';

/**
 * Everything a list of posts can do — heart, flame, save, copy, edit, delete,
 * report, block — shared by the feed, a profile and Saved. `list` is the
 * useCommunityCards result; `me` is your Community profile.
 */
export function useCommunityPostActions({ list, me, onToast }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [copying, setCopying] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [confirm, setConfirm] = useState(null); // { title, label, run }

  const fail = (err) => onToast(friendlyCommunityError(err), true);

  async function react(post, kind) {
    const field = kind === 'heart' ? 'my_heart' : 'my_flame';
    const count = kind === 'heart' ? 'hearts' : 'flames';
    const on = !post[field];
    list.patch(post.id, { [field]: on, [count]: Math.max(0, post[count] + (on ? 1 : -1)) });
    try { await setReaction(user.id, post.id, kind, on); } catch (err) {
      list.patch(post.id, { [field]: !on, [count]: post[count] });
      fail(err);
    }
  }

  async function save(post) {
    const on = !post.saved;
    list.patch(post.id, { saved: on });
    try { await setSaved(user.id, post.id, on); onToast(on ? 'Saved' : 'Removed from saved'); } catch (err) {
      list.patch(post.id, { saved: !on });
      fail(err);
    }
  }

  const menuActions = (post) => {
    if (post.author_id === user.id) {
      return [
        { label: 'Edit post', icon: 'ti-pencil', onSelect: () => setEditing(post) },
        { label: 'Delete post', icon: 'ti-trash', danger: true, onSelect: () => setConfirm({
          title: 'Delete this post?', label: 'Delete post',
          run: async () => { await deletePost(post.id, post.photo_path); list.remove(post.id); onToast('Post deleted'); },
        }) },
      ];
    }
    return [
      { label: 'Report post', icon: 'ti-flag', onSelect: () => setReporting({ postId: post.id, userId: post.author_id, username: post.username }) },
      { label: `Block @${post.username}`, icon: 'ti-ban', danger: true, onSelect: () => setConfirm({
        title: `Block @${post.username}? You won't see each other's posts, and you'll stop following each other.`, label: 'Block',
        run: async () => { await blockUser(user.id, post.author_id); list.refetch(); onToast(`Blocked @${post.username}`); },
      }) },
    ];
  };

  const handlers = {
    onReact: react,
    onSave: save,
    onCopy: setCopying,
    onMenu: setMenuFor,
    onOpenProfile: (username) => navigate(`/community/u/${username}`),
  };

  const sheets = (
    <>
      {copying && <CopySheet key={copying.id} post={copying} onClose={() => setCopying((c) => (c === copying ? null : c))} onDone={(m) => onToast(m)} />}
      {menuFor && <ActionSheet title={`Post by @${menuFor.username}`} actions={menuActions(menuFor)} onClose={() => setMenuFor(null)} />}
      {editing && (
        <EditNoteSheet
          post={editing}
          isPrivate={!!me?.is_private}
          onClose={() => setEditing(null)}
          onSave={async (fields) => { await updatePost(editing.id, fields); list.patch(editing.id, { ...fields, edited_at: new Date().toISOString() }); onToast('Post updated'); }}
        />
      )}
      {reporting && <ReportSheet {...reporting} onClose={() => setReporting(null)} onDone={(m) => onToast(m)} />}
      {confirm && (
        <ActionSheet
          title={confirm.title}
          actions={[{ label: confirm.label, icon: 'ti-check', danger: true, onSelect: async () => { try { await confirm.run(); } catch (err) { fail(err); } } }]}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );

  return { handlers, sheets };
}
