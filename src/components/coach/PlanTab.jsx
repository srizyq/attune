import { useAuth } from '../../hooks/useAuth';
import RecipeShareCard from './RecipeShareCard';

// What the coach hands the client to eat: recipes for now.
export default function PlanTab({ clientData }) {
  const { user } = useAuth();
  return (
    <div>
      <RecipeShareCard trainerId={user?.id} client={clientData} />
    </div>
  );
}
