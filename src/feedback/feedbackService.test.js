const mockRpc = jest.fn();
jest.mock("../supabaseClient", () => ({ supabase: { rpc: (...args) => mockRpc(...args) } }));

import { changeFeedbackStatus, loadSupervisorFeedback, submitFeedback } from "./feedbackService";

beforeEach(() => mockRpc.mockReset());

it("submits manager context and the current SPARK page through the protected RPC", async () => {
  mockRpc.mockResolvedValue({ data: "feedback-id", error: null });
  await submitFeedback({ location: { id: 8, location_code: "8575", school_name: "CARSON HS" }, employee: { id: 12, employee_name: "TEST MANAGER" }, category: "Bug", message: "  Marker is missing  ", pageRoute: "locationInformation" });
  expect(mockRpc).toHaveBeenCalledWith("submit_spark_feedback", expect.objectContaining({ p_location_id: 8, p_location_code: "8575", p_employee_id: 12, p_category: "Bug", p_message: "Marker is missing", p_page_route: "locationInformation" }));
});

it("uses supervisor-authorized RPCs for listing and status changes", async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ id: "one" }], error: null }).mockResolvedValueOnce({ data: null, error: null });
  await expect(loadSupervisorFeedback("1234", "New")).resolves.toEqual([{ id: "one" }]);
  await changeFeedbackStatus("1234", "one", "Resolved");
  expect(mockRpc).toHaveBeenNthCalledWith(1, "list_spark_feedback", { p_supervisor_pin: "1234", p_status: "New" });
  expect(mockRpc).toHaveBeenNthCalledWith(2, "update_spark_feedback_status", { p_supervisor_pin: "1234", p_feedback_id: "one", p_status: "Resolved" });
});
