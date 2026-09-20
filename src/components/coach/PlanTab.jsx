import { useAuth } from '../../hooks/useAuth';
import { useCheckinFormAdmin } from '../../hooks/useCheckinForms';
import { useMealPlanAdmin } from '../../hooks/useMealPlans';
import RecipeShareCard from './RecipeShareCard';
import MealPlanEditor from './MealPlanEditor';
import CheckinFormEditor from './CheckinFormEditor';
import CheckinResponses from './CheckinResponses';

// What the coach hands the client: a weekly meal plan, recipes, and a
// recurring check-in form (with the answers that come back).
export default function PlanTab({ client, clientData }) {
  const { user } = useAuth();
  const admin = useCheckinFormAdmin(client.id);
  const planAdmin = useMealPlanAdmin(client.id);
  return (
    <div>
      <MealPlanEditor trainerId={user?.id} clientData={clientData} admin={planAdmin} />
      <RecipeShareCard trainerId={user?.id} client={clientData} />
      <CheckinFormEditor clientData={clientData} admin={admin} />
      {admin.supported && <CheckinResponses responses={admin.responses} />}
    </div>
  );
}
