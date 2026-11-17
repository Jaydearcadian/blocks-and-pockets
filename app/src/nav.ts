import { VIEWS } from './views';

// Every section on the dashboard, in view order.
export const NAV: { id: string; label: string }[] = VIEWS.flatMap((v) => v.sections);
