import { useAuth } from '../../hooks/useAuth';
import { useCheckinFormAdmin } from '../../hooks/useCheckinForms';
import RecipeShareCard from './RecipeShareCard';
import CheckinFormEditor from './CheckinFormEditor';
import CheckinResponses from './CheckinResponses';

// What the coach hands the client: recipes, and a recurring check-in form
// (with the answers that come back).
export default function PlanTab({ client, clientData }) {
  const { user } = useAuth();
  const admin = useCheckinFormAdmin(client.id);
  return (
    <div>
      <RecipeShareCard trainerId={user?.id} client={clientData} />
      <CheckinFormEditor clientData={clientData} admin={admin} />
      {admin.supported && <CheckinResponses responses={admin.responses} />}
    </div>
  );
}
