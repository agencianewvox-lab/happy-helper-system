import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { createMeetingPlanStore, type SavedMeetingPlan } from "./onboarding-plan-store";
import type { MeetingPlan } from "./onboarding-plan";

type PlanDatabase = { public: { Tables: { onboarding_meeting_plans: {
  Row: SavedMeetingPlan;
  Insert: { response_id: string; group_id: string; plan: MeetingPlan };
  Update: { plan: MeetingPlan };
  Relationships: [];
} }; Views: Record<string, never>; Functions: Record<string, never> } };
// Same authenticated client/session. No administrative key or second auth store.
const db = supabase as unknown as SupabaseClient<PlanDatabase>;
const columns = "response_id,group_id,plan,version,updated_at,updated_by";
export const sharedMeetingPlanStore = createMeetingPlanStore({
  read: async responseId => db.from("onboarding_meeting_plans").select(columns).eq("response_id", responseId).maybeSingle(),
  insert: async row => db.from("onboarding_meeting_plans").insert(row).select(columns),
  update: async (responseId, version, plan) => db.from("onboarding_meeting_plans").update({ plan }).eq("response_id", responseId).eq("version", version).select(columns),
});
