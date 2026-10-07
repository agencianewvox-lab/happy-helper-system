import { z } from "zod";
import { meetingPlanSchema, type MeetingPlan } from "./onboarding-plan";

const recordSchema = z.object({
  response_id: z.string().uuid(), group_id: z.string().min(1).max(200),
  plan: meetingPlanSchema, version: z.number().int().positive(),
  updated_at: z.string().datetime({ offset: true }), updated_by: z.string().uuid(),
});
export type SavedMeetingPlan = z.infer<typeof recordSchema>;
type Result = { data: unknown; error: { code?: string } | null };
export interface MeetingPlanTransport {
  read: (responseId: string) => Promise<Result>;
  insert: (row: { response_id: string; group_id: string; plan: MeetingPlan }) => Promise<Result>;
  update: (responseId: string, expectedVersion: number, plan: MeetingPlan) => Promise<Result>;
}
export class MeetingPlanStoreError extends Error {
  constructor(public readonly kind: "unavailable" | "denied" | "conflict" | "invalid" | "network") {
    super(kind); this.name = "MeetingPlanStoreError";
  }
}
function checkError(error: Result["error"]) {
  if (!error) return;
  if (["42P01", "PGRST205"].includes(error.code || "")) throw new MeetingPlanStoreError("unavailable");
  if (["42501", "PGRST301", "PGRST302"].includes(error.code || "")) throw new MeetingPlanStoreError("denied");
  if (error.code === "23505") throw new MeetingPlanStoreError("conflict");
  throw new MeetingPlanStoreError("network");
}
function parseRecord(value: unknown, responseId: string, groupId: string) {
  const result = recordSchema.safeParse(value);
  if (!result.success || result.data.response_id !== responseId || result.data.group_id !== groupId)
    throw new MeetingPlanStoreError("invalid");
  return result.data;
}
function validateIdentity(responseId: string, groupId: string) {
  if (!z.string().uuid().safeParse(responseId).success || !groupId || groupId.length > 200)
    throw new MeetingPlanStoreError("invalid");
}
async function request(operation: () => Promise<Result>) {
  try { const result = await operation(); checkError(result.error); return result; }
  catch (error) { if (error instanceof MeetingPlanStoreError) throw error; throw new MeetingPlanStoreError("network"); }
}

/** Separate from public form answers. A conflict never overwrites another operator's work. */
export function createMeetingPlanStore(transport: MeetingPlanTransport) {
  return {
    async load(responseId: string, groupId: string): Promise<SavedMeetingPlan | null> {
      validateIdentity(responseId, groupId);
      const { data } = await request(() => transport.read(responseId));
      return data === null ? null : parseRecord(data, responseId, groupId);
    },
    async save(responseId: string, groupId: string, plan: MeetingPlan, expectedVersion: number): Promise<SavedMeetingPlan> {
      validateIdentity(responseId, groupId);
      const parsed = meetingPlanSchema.strict().safeParse(plan);
      if (!parsed.success || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0
        || new TextEncoder().encode(JSON.stringify(parsed.data)).length > 30000)
        throw new MeetingPlanStoreError("invalid");
      const { data } = await request(() => expectedVersion === 0
        ? transport.insert({ response_id: responseId, group_id: groupId, plan: parsed.data })
        : transport.update(responseId, expectedVersion, parsed.data));
      if (!Array.isArray(data) || data.length !== 1) throw new MeetingPlanStoreError("conflict");
      const saved = parseRecord(data[0], responseId, groupId);
      if (saved.version !== expectedVersion + 1) throw new MeetingPlanStoreError("invalid");
      return saved;
    },
  };
}
