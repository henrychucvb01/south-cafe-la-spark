import { openSession, getMonitoring, saveDraft } from "./service";
import { supabase } from "../supabaseClient";
jest.mock("../supabaseClient", () => ({ supabase: { rpc: jest.fn() } }));
beforeEach(() => supabase.rpc.mockReset());
test("opens a school-scoped server session and rejects failed verification", async () => {
  supabase.rpc.mockResolvedValue({ data: null, error: null });
  await expect(openSession({ id: 3 }, { id: 7 }, "1234")).rejects.toThrow("could not be verified");
  expect(supabase.rpc).toHaveBeenCalledWith("open_supper_monitoring_session", { p_location_id: 3, p_employee_id: 7, p_pin: "1234", p_covering_name: null });
});
test("writes carry the revision and resumable section, not a client school override", async () => {
  supabase.rpc.mockResolvedValue({ data: { revision: 5 }, error: null });
  await saveDraft("token", { id: "record", revision: 4 }, { comments: "Saved" }, 6);
  expect(supabase.rpc).toHaveBeenCalledWith("save_supper_monitoring_draft", { p_token: "token", p_id: "record", p_revision: 4, p_section: 6, p_payload: { comments: "Saved" } });
});
test("read errors surface to the caller instead of masquerading as empty records", async () => {
  supabase.rpc.mockResolvedValue({ data: null, error: { message: "School access denied" } });
  await expect(getMonitoring("token", "id")).rejects.toThrow("School access denied");
});
