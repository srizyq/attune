import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import {
  getBodyMeasurements, upsertBodyMeasurement, deleteBodyMeasurement,
  getProgressPhotos, uploadProgressPhoto, deleteProgressPhoto, getSignedPhotoUrls,
} from '../lib/db';
import { resizeToJpeg } from '../lib/imageResize';

// `userIdOverride` lets a coach read a connected client's data with the same
// hook (RLS allows the read either way); the write helpers are only ever wired
// up for the signed-in user's own data.
export function useBodyMeasurements(userIdOverride) {
  const { user } = useAuth();
  const userId = userIdOverride || user?.id;
  const [rows, setRows] = useState([]);
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) { setRows([]); setLoading(false); return; }
    try {
      const data = await getBodyMeasurements(userId);
      setSupported(data !== null);
      setRows(data || []);
    } catch (err) {
      console.error('Failed to load measurements:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  const save = useCallback(async (entry) => {
    await upsertBodyMeasurement(userId, entry);
    await refetch();
  }, [userId, refetch]);

  const remove = useCallback(async (id) => {
    await deleteBodyMeasurement(id);
    await refetch();
  }, [refetch]);

  return { rows, supported, loading, save, remove };
}

export function useProgressPhotos(userIdOverride) {
  const { user } = useAuth();
  const userId = userIdOverride || user?.id;
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [supported, setSupported] = useState(true);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) { setPhotos([]); setLoading(false); return; }
    try {
      const data = await getProgressPhotos(userId);
      setSupported(data !== null);
      setPhotos(data || []);
      // A failure to sign links leaves the list without thumbnails, not broken.
      try { setUrls(await getSignedPhotoUrls((data || []).map((p) => p.path))); } catch (err) { console.error('Failed to sign photo links:', err); setUrls({}); }
    } catch (err) {
      console.error('Failed to load photos:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { setLoading(true); refetch(); }, [refetch]);

  const add = useCallback(async (file, takenDate, note = null) => {
    const blob = await resizeToJpeg(file);
    await uploadProgressPhoto(userId, blob, takenDate, note);
    await refetch();
  }, [userId, refetch]);

  const remove = useCallback(async (photo) => {
    await deleteProgressPhoto(photo);
    await refetch();
  }, [refetch]);

  return { photos, urls, supported, loading, add, remove };
}
