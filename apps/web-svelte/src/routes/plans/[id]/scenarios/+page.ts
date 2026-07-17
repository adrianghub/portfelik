import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

/** Scenarios UI is deferred — send users back to the plan detail. */
export const load: PageLoad = ({ params }) => {
  redirect(307, `/plans/${params.id}`);
};
