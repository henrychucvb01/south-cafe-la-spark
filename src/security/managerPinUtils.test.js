import { cleanManagerPin, shouldAutoVerifyManagerPin } from "./managerPinUtils";

test("cleans manager PIN input without changing four-digit security", () => {
  expect(cleanManagerPin("12a34-5")).toBe("1234");
});

test("auto-verifies only complete existing or covering manager PINs", () => {
  expect(shouldAutoVerifyManagerPin({ pin: "1234", mode: "verify", submitting: false })).toBe(true);
  expect(shouldAutoVerifyManagerPin({ pin: "1234", mode: "verify-covering", submitting: false })).toBe(true);
  expect(shouldAutoVerifyManagerPin({ pin: "123", mode: "verify", submitting: false })).toBe(false);
  expect(shouldAutoVerifyManagerPin({ pin: "1234", mode: "create", submitting: false })).toBe(false);
  expect(shouldAutoVerifyManagerPin({ pin: "1234", mode: "verify", submitting: true })).toBe(false);
});
