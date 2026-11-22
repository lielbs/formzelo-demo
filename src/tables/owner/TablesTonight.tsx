import { listVenues } from '../data/client';
import { useLoad } from '../ui';
import { Today } from './VenueOverview';

/**
 * Tonight at each venue, on the business's home screen (UX audit A1.3 / B4.1): bookings, who is
 * next, what waits for a decision, and the shift one tap away. Renders nothing for a business
 * without Tables or for staff without access to it.
 */
export function TablesTonight({ organizationId }: { organizationId: string }) {
  const { data } = useLoad(() => listVenues(organizationId).catch(() => null), [organizationId], 'tables-tonight');
  const venues = (data?.enabled ? data.venues : []).filter((v) => v.published && v.status !== 'archived').slice(0, 3);
  if (!venues.length) return null;
  return (
    <div className="grid gap-4">
      {venues.map((v) => <Today key={v.id} venueId={v.id} timezone={v.timezone} title={`הערב ב־${v.name}`} />)}
    </div>
  );
}
