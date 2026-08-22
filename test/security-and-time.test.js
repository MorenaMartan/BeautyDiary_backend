import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = "test-only-secret";

const { createAccessToken, requireAuth } = await import("../middleware/auth.js");
const { requireAdmin, requireRole } = await import("../middleware/roles.js");
const { overlaps } = await import("../utils/time.js");
const {
  appointmentHasStarted,
  calculateAvailableBeautyPoints,
  calculateCancellationFee,
  calculateDiscountedPrice,
  employeeCanPerformTreatment,
  getAppointments,
  isFutureAppointment,
} = await import("../controllers/appointmentsController.js");
const {
  updateEmployee,
  updateEmployeeProfile,
  updateEmployeeSchedule,
  updateEmployeeTreatments,
  updateEmployeeVacations,
  updateVacationAllowance,
} = await import("../controllers/employeesController.js");
const {
  getProductOrders,
  updateProductOrder,
} = await import("../controllers/productOrdersController.js");
const { signup } = await import("../controllers/authController.js");
const { createClient, sanitizeClientUpdates } = await import("../controllers/clientsController.js");
const { models } = await import("../db.js");

test("signup requires a password with at least 8 characters", async () => {
  for (const password of [undefined, "", "short"]) {
    let status;
    let response;
    const req = { body: { name: "New", password } };
    const res = {
      status: (code) => { status = code; return res; },
      json: (body) => { response = body; },
    };

    await signup(req, res);

    assert.equal(status, 400);
    assert.equal(response.message, "Password must contain at least 8 characters");
  }
});

test("employee password updates require at least 8 characters", async () => {
  let status;
  let response;
  const req = { params: { id: "2" }, body: { password: "short" } };
  const res = {
    status: (code) => { status = code; return res; },
    json: (body) => { response = body; },
  };

  await updateEmployee(req, res);

  assert.equal(status, 400);
  assert.equal(response.message, "Password must contain at least 8 characters");
});

test("beauticians can update only their own employee profile", async () => {
  for (const user of [
    { id: 3, role: "Beautician", type: "employee" },
    { id: 2, role: "Client", type: "client" },
  ]) {
    let status;
    const req = { params: { id: "2" }, user, body: { name: "Changed" } };
    const res = { status: (code) => { status = code; return res; }, json: () => {} };

    await updateEmployeeProfile(req, res);
    assert.equal(status, 403);
  }
});

test("beauticians can assign treatments only to their own employee profile", async () => {
  let status;
  const req = {
    params: { id: "3" },
    user: { id: 2, role: "Beautician", type: "employee" },
    body: { treatments: ["Haircut"] },
  };
  const res = { status: (code) => { status = code; return res; }, json: () => {} };

  await updateEmployeeTreatments(req, res);
  assert.equal(status, 403);
});

test("clients added by employees require a password with at least 8 characters", async () => {
  let status;
  let response;
  const req = { body: { name: "New client", username: "new-client", password: "short" } };
  const res = {
    status: (code) => { status = code; return res; },
    json: (body) => { response = body; },
  };

  await createClient(req, res);

  assert.equal(status, 400);
  assert.equal(response.message, "Password must contain at least 8 characters");
});

test("clients cannot update balances, points or other system-managed fields", () => {
  const updates = sanitizeClientUpdates({
    name: "Allowed name",
    email: "allowed@example.com",
    wallet: 100000,
    spentBeautyPoints: 0,
    termins: 999,
    cancelled: 0,
    diary: [{ text: "Changed by client" }],
    createdAt: "2000-01-01",
  }, "Client");

  assert.deepEqual(updates, {
    name: "Allowed name",
    email: "allowed@example.com",
  });
});

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

test("role middleware allows a beautician to manage clients", () => {
  const middleware = requireRole("Admin", "Beautician");
  const req = { user: { id: 2, role: "Beautician", type: "employee" } };
  const res = { status: () => res, json: () => {} };
  let continued = false;

  middleware(req, res, () => {
    continued = true;
  });

  assert.equal(continued, true);
});

test("admin middleware prevents beauticians from changing vacation allowances", () => {
  const req = { user: { id: 2, role: "Beautician", type: "employee" } };
  let status;
  const res = { status: (code) => { status = code; return res; }, json: () => {} };

  requireAdmin(req, res, () => assert.fail("middleware must not continue"));
  assert.equal(status, 403);
});

test("admin middleware permits employees with the Admin role", () => {
  const req = { user: { id: 1, role: "Admin", type: "employee" } };
  const res = { status: () => res, json: () => {} };
  let continued = false;

  requireAdmin(req, res, () => {
    continued = true;
  });

  assert.equal(continued, true);
});

test("admin product orders are loaded from all actual employee profiles", async () => {
  const originalFind = models.Employee.find;
  let query;
  models.Employee.find = (employeeQuery) => {
    query = employeeQuery;
    return {
      sort: () => ({
        lean: async () => [{ id: 1, name: "Tara", surname: "", role: "Admin", productOrders: [] }],
      }),
    };
  };

  try {
    const req = { user: { id: 1, role: "Admin", type: "employee" } };
    let response;
    const res = { json: (data) => { response = data; } };

    await getProductOrders(req, res);
    assert.deepEqual(query, {});
    assert.equal(response[0].name, "Tara");
    assert.equal(response[0].role, "Admin");
  } finally {
    models.Employee.find = originalFind;
  }
});

test("only admin can mark a product order as purchased", async () => {
  const originalFindOne = models.Employee.findOne;
  models.Employee.findOne = () => ({ lean: async () => ({ id: 2 }) });

  try {
    const req = {
      params: { employeeId: "2", index: "0" },
      user: { id: 2, role: "Beautician", type: "employee" },
      body: { checked: true },
    };
    let status;
    const res = { status: (code) => { status = code; return res; }, json: () => {} };

    await updateProductOrder(req, res);
    assert.equal(status, 403);
  } finally {
    models.Employee.findOne = originalFindOne;
  }
});

test("admin purchase status is persisted on the Beautician order", async () => {
  const originalFindOne = models.Employee.findOne;
  let saved = false;
  const employee = {
    productOrders: [{ text: "Ručnici", checked: false }],
    save: async () => { saved = true; },
  };
  models.Employee.findOne = async () => employee;

  try {
    const req = {
      params: { employeeId: "3", index: "0" },
      user: { id: 1, role: "Admin", type: "employee" },
      body: { checked: true },
    };
    let response;
    const res = { json: (data) => { response = data; } };

    await updateProductOrder(req, res);
    assert.equal(saved, true);
    assert.equal(response.checked, true);
    assert.ok(response.checkedAt instanceof Date);
  } finally {
    models.Employee.findOne = originalFindOne;
  }
});

test("clients receive their appointments and anonymized occupied calendar slots", async () => {
  const originalClientFindOne = models.Client.findOne;
  const originalAppointmentFind = models.Appointment.find;
  const currentClient = { id: 9, name: "Marta", surname: "Maric" };
  models.Client.findOne = () => ({ lean: async () => currentClient });
  models.Appointment.find = () => ({
    sort: () => ({
      lean: async () => [
        {
          id: 1,
          clientId: 9,
          client_name: "Marta",
          client_surname: "Maric",
          treatment: "Massage",
          dayandhour: "2026-08-20 10:00",
          beautician: "Maja",
          duration: 60,
          status: "booked",
        },
        {
          id: 2,
          clientId: 10,
          client_name: "Other",
          client_surname: "Client",
          treatment: "Private treatment",
          dayandhour: "2026-08-20 11:00",
          beautician: "Maja",
          duration: 30,
          status: "booked",
        },
        {
          id: 3,
          clientId: 10,
          client_name: "Other",
          client_surname: "Client",
          treatment: "Cancelled treatment",
          dayandhour: "2026-08-20 12:00",
          beautician: "Maja",
          duration: 30,
          status: "cancelled",
        },
      ],
    }),
  });

  try {
    const req = { query: {}, user: { id: 9, role: "Client", type: "client" } };
    let response;
    const res = { status: () => res, json: (data) => { response = data; } };

    await getAppointments(req, res);
    assert.equal(response.length, 2);
    assert.equal(response[0].id, 1);
    assert.deepEqual(response[1], {
      dayandhour: "2026-08-20 11:00",
      beautician: "Maja",
      duration: 30,
      status: "booked",
      isBusy: true,
    });
  } finally {
    models.Client.findOne = originalClientFindOne;
    models.Appointment.find = originalAppointmentFind;
  }
});

test("beauticians cannot update another employee's vacation days", async () => {
  const req = {
    params: { id: "3" },
    user: { id: 2, role: "Beautician", type: "employee" },
    body: { vacations: ["2026-08-20"] },
  };
  let status;
  const res = { status: (code) => { status = code; return res; }, json: () => {} };

  await updateEmployeeVacations(req, res);
  assert.equal(status, 403);
});

test("beauticians can update only their own work schedule", async () => {
  const schedule = Object.fromEntries(
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
      .map((day) => [day, day === "Monday" ? { start: "09:00", end: "17:00" } : { start: "-", end: "-" }]),
  );
  const originalFindOneAndUpdate = models.Employee.findOneAndUpdate;
  let savedQuery;

  models.Employee.findOneAndUpdate = (query, updates) => ({
    lean: async () => {
      savedQuery = { query, updates };
      return { id: 2, name: "Maja", role: "Beautician", schedule };
    },
  });

  try {
    const ownRequest = {
      params: { id: "2" },
      user: { id: 2, role: "Beautician", type: "employee" },
      body: { schedule },
    };
    let response;
    const ownResponse = { status: () => ownResponse, json: (data) => { response = data; } };

    await updateEmployeeSchedule(ownRequest, ownResponse);
    assert.deepEqual(savedQuery, { query: { id: 2 }, updates: { schedule } });
    assert.deepEqual(response.schedule, schedule);

    const otherRequest = {
      params: { id: "3" },
      user: { id: 2, role: "Beautician", type: "employee" },
      body: { schedule },
    };
    let status;
    const otherResponse = { status: (code) => { status = code; return otherResponse; }, json: () => {} };

    await updateEmployeeSchedule(otherRequest, otherResponse);
    assert.equal(status, 403);
  } finally {
    models.Employee.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("admins pass authorization when updating another employee's vacation days", async () => {
  const req = {
    params: { id: "2" },
    user: { id: 1, role: "Admin", type: "employee" },
    body: { vacations: ["2026-02-31"] },
  };
  let status;
  const res = { status: (code) => { status = code; return res; }, json: () => {} };

  await updateEmployeeVacations(req, res);
  assert.equal(status, 400);
});

test("vacation endpoint rejects invalid calendar dates", async () => {
  const req = {
    params: { id: "1" },
    user: { id: 1, role: "Admin", type: "employee" },
    body: { vacations: ["2026-02-31"] },
  };
  let status;
  const res = { status: (code) => { status = code; return res; }, json: () => {} };

  await updateEmployeeVacations(req, res);
  assert.equal(status, 400);
});

test("vacation allowance must be a whole number between 0 and 365", async () => {
  for (const vacationAllowance of [-1, 1.5, 366, "20"]) {
    const req = { params: { id: "2" }, body: { vacationAllowance } };
    let status;
    const res = { status: (code) => { status = code; return res; }, json: () => {} };

    await updateVacationAllowance(req, res);
    assert.equal(status, 400);
  }
});

test("vacation allowance cannot be lower than already selected days", async () => {
  const originalFindOne = models.Employee.findOne;
  models.Employee.findOne = () => ({
    select: () => ({
      lean: async () => ({ vacations: ["2026-08-20", "2026-08-21"] }),
    }),
  });

  try {
    const req = { params: { id: "2" }, body: { vacationAllowance: 1 } };
    let status;
    const res = { status: (code) => { status = code; return res; }, json: () => {} };

    await updateVacationAllowance(req, res);
    assert.equal(status, 400);
  } finally {
    models.Employee.findOne = originalFindOne;
  }
});

test("time overlap detects partial conflicts but permits adjacent appointments", () => {
  assert.equal(overlaps("10:00", 60, "10:30", 60), true);
  assert.equal(overlaps("10:00", 60, "11:00", 30), false);
});

test("attendance statuses are allowed only after an appointment starts", () => {
  const now = new Date("2026-08-17T10:00:00").getTime();
  assert.equal(appointmentHasStarted("2026-08-17 09:59", now), true);
  assert.equal(appointmentHasStarted("2026-08-17 10:01", now), false);
});

test("appointments can be booked only for a future date and time", () => {
  const now = new Date("2026-08-17T10:00:00").getTime();
  assert.equal(isFutureAppointment("2026-08-17 09:59", now), false);
  assert.equal(isFutureAppointment("2026-08-17 10:00", now), false);
  assert.equal(isFutureAppointment("2026-08-17 10:01", now), true);
  assert.equal(isFutureAppointment("invalid", now), false);
});

test("assigned treatment names take precedence over legacy employee categories", () => {
  const facial = { name: "Deep facial", specialty: "Facial" };

  assert.equal(employeeCanPerformTreatment({ treatments: ["Deep facial"], specialties: [] }, facial), true);
  assert.equal(employeeCanPerformTreatment({ treatments: ["Basic facial"], specialties: ["Facial"] }, facial), false);
  assert.equal(employeeCanPerformTreatment({ treatments: [], specialties: ["Facial"] }, facial), true);
});

test("late cancellation fee is half of the treatment price", () => {
  assert.equal(calculateCancellationFee(50), 25);
});

test("Beauty Points follow the configured earning rule and exclude spent points", () => {
  const settings = { eurosSpent: 15, pointsEarned: 2, pointsRequired: 10, discountPercentage: 10 };
  assert.equal(calculateAvailableBeautyPoints({ wallet: 90, spentBeautyPoints: 3 }, settings), 9);
});

test("Beauty Points discount is calculated to currency precision", () => {
  assert.equal(calculateDiscountedPrice(55.55, 10), 50);
});
