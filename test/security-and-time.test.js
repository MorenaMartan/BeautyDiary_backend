import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = "test-only-secret";

const { createAccessToken, requireAuth } = await import("../middleware/auth.js");
const { overlaps } = await import("../utils/time.js");

test("JWT middleware accepts a valid token and exposes its user", () => {
  const token = createAccessToken({ id: 3, role: "Client", type: "client" });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = { status: () => res, json: () => {} };
  let continued = false;

  requireAuth(req, res, () => {
    continued = true;
  });

  assert.equal(continued, true);
  assert.equal(req.user.id, 3);
  assert.equal(req.user.role, "Client");
});

test("JWT middleware rejects a missing token", () => {
  const req = { headers: {} };
  let status;
  const res = { status: (code) => { status = code; return res; }, json: () => {} };

  requireAuth(req, res, () => assert.fail("middleware must not continue"));
  assert.equal(status, 401);
});

test("time overlap detects partial conflicts but permits adjacent appointments", () => {
  assert.equal(overlaps("10:00", 60, "10:30", 60), true);
  assert.equal(overlaps("10:00", 60, "11:00", 30), false);
});
