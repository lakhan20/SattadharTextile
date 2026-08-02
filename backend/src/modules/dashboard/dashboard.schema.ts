import { z } from 'zod';

/**
 * The only knob on the dashboard: how far back the ADMIN trend chart reaches.
 * STAFF get no trend at all, so this is ignored for them.
 */
export const dashboardQuerySchema = z.object({
  range: z.enum(['7D', '30D']).default('7D'),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
