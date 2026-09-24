import React, { act } from "react";
import { createRoot } from "react-dom/client";
import SupperMonitoringPage from "./SupperMonitoringPage";
import { newDraft } from "./model";
import * as service from "./service";
jest.mock("./service", () => ({ openSession: jest.fn(), getContext: jest.fn(), closeSession: jest.fn(), listMonitorings: jest.fn(), getMonitoring: jest.fn(), saveDraft: jest.fn() }));
jest.mock("./SignaturePad", () => function Pad() { return <div>Signature pad</div>; });
let container, root;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  service.getContext.mockResolvedValue({actor_role:"manager",employee_id:11,monitor_name:"Test Monitor",allow_manager_uploads:true});
  service.openSession.mockResolvedValue("scoped-token"); service.listMonitorings.mockResolvedValue([]);
  service.saveDraft.mockImplementation(async (_token, record, payload, section) => ({ id: "draft-id", revision: (record?.revision || 0) + 1, status: "draft", source: "generated", monitor_role: "manager", created_by_employee_id: 11, school_year: "2026-27", monitoring_slot: "manager_1", payload, current_section: section }));
  await act(async () => root.render(<SupperMonitoringPage location={{ id: 1, school_name: "Test School", location_code: "1001" }} employee={{ id: 11, employee_name: "Test Monitor" }} managerPin="1234" onBack={() => {}} />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); globalThis.IS_REACT_ACT_ENVIRONMENT = false; });
async function click(text) {
  const button = [...container.querySelectorAll("button")].find(b => b.textContent === text);
  expect(button).toBeDefined();
  await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}
async function input(selector, value) {
  await act(async () => { const el = container.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
test("starts, saves, and resumes at the server's saved section", async () => {
  await click("+ Start New Monitoring");
  await input("#monitoringDate", "2026-09-23");
  await click("Save Draft");
  expect(service.saveDraft.mock.calls[0][2].monitoringDate).toBe("2026-09-23");
  expect(service.saveDraft.mock.calls[0][3]).toBe(0);
  const payload = { ...newDraft("Test Monitor"), monitoringDate: "2026-09-23" };
  service.listMonitorings.mockResolvedValue([{ id: "draft-id", status: "draft", source: "generated", monitor_role: "manager", created_by_employee_id: 11, school_year: "2026-27", monitoring_slot: "manager_1", current_section: 1, updated_at: "2026-09-23T10:00:00Z" }]);
  service.getMonitoring.mockResolvedValue({ id: "draft-id", status: "draft", source: "generated", monitor_role: "manager", created_by_employee_id: 11, school_year: "2026-27", monitoring_slot: "manager_1", revision: 2, payload, current_section: 1 });
  await click("Save & Return to Monitorings"); await click("Resume");
  expect(container.querySelector("h2").textContent).toBe("Five-Day History");
});
test("a failed save preserves data and prevents navigation", async () => {
  await click("+ Start New Monitoring"); await input("#monitoringDate", "2026-09-23");
  service.saveDraft.mockRejectedValue(new Error("Connection unavailable"));
  await click("Save Draft");
  expect(container.querySelector("#monitoringDate").value).toBe("2026-09-23");
  expect(container.querySelector("[role=alert]").textContent).toContain("Connection unavailable");
  expect(container.querySelector("h2").textContent).toBe("Monitoring Information");
});
test("completed history opens read-only and final submission is unavailable", async () => {
  service.listMonitorings.mockResolvedValue([{ id: "complete", status: "completed", school_year: "2025-26", monitoring_date: "2026-06-01", submitted_at: "2026-06-01T17:00:00Z" }]);
  service.getMonitoring.mockResolvedValue({ id: "complete", status: "completed", payload: newDraft("Previous Monitor"), current_section: 9 });
  await click("Refresh"); await click("View"); await click("View Guided Monitoring");
  expect(container.textContent).toContain("read-only");
  await act(async () => {
    const select = container.querySelector("select");
    select.value = "7";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelector("fieldset").disabled).toBe(true);
  expect(container.querySelector("#monitorName").value).toBe("Previous Monitor");
  expect(service.saveDraft).not.toHaveBeenCalled();
});

test("opens with the existing manager sign-in without a second PIN prompt", () => {
  expect(service.openSession).toHaveBeenCalledTimes(1);
  expect(service.openSession).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 11 }), "1234");
  expect(container.querySelector('input[type=password]')).toBeNull();
  expect(container.textContent).toContain("+ Start New Monitoring");
});
