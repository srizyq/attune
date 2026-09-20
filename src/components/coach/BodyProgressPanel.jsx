import { useBodyMeasurements, useProgressPhotos } from '../../hooks/useBodyProgress';
import { formatMeasurement, kindLabel, latestByKind } from '../../lib/bodyProgress';
import PhotoGallery from '../PhotoGallery';
import { Card, SectionLabel } from './shared';

// A connected client's body measurements and progress photos, read-only.
// Renders nothing until the database update that creates the tables is applied.
export default function BodyProgressPanel({ client }) {
  const measurements = useBodyMeasurements(client.id);
  const photos = useProgressPhotos(client.id);
  if (!measurements.supported && !photos.supported) return null;

  const latest = latestByKind(measurements.rows);
  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionLabel icon="ti-ruler-measure">Body &amp; photos</SectionLabel>
      {measurements.supported && (
        latest.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 16px' }}>No measurements logged.</p>
        ) : (
          <div style={{ marginBottom: 20 }}>
            {latest.map(({ kind, latest: l, delta, entries }) => (
              <div key={kind} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-default)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>{kindLabel(kind)} <span style={{ color: 'var(--text-hint)', fontSize: 11 }}>· {entries} {entries === 1 ? 'entry' : 'entries'}</span></span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {formatMeasurement(l.value, l.unit)}
                  {delta != null && delta !== 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>{delta > 0 ? '+' : '−'}{Math.abs(delta)} since previous</span>}
                </span>
              </div>
            ))}
          </div>
        )
      )}
      {photos.supported && <PhotoGallery photos={photos.photos} urls={photos.urls} emptyText="No progress photos." />}
    </Card>
  );
}
