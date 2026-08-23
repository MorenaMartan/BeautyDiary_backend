import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";

process.env.JWT_SECRET = "test-only-secret";

const { createAccessToken, requireAuth } = await import("../middleware/auth.js");
const { requireAdmin, requireRole } = await import("../middleware/roles.js");
const { overlaps } = await import("../utils/time.js");
const {
  appointmentHasStarted,
  calculateAvailableBeautyPoints,
  calculateCancellationFee,
  calculateDiscountedPrice,
  createAppointment,
  deleteAppointment,
  employeeCanPerformTreatment,
  getAppointments,
  isFutureAppointment,
  updateAppointment,
} = await import("../controllers/appointmentsController.js");
const {
  createEmployee,
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
const {
  createClient,
  deleteClient,
  getClientStats,
  sanitizeClientUpdates,
} = await import("../controllers/clientsController.js");
const { createReview } = await import("../controllers/reviewsController.js");
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

test("employees with the same name receive surname-initial usernames and a lowercase initial password", async () => {
  const originals = {
    employeeFind: models.Employee.find,
    employeeFindOne: models.Employee.findOne,
    employeeCreate: models.Employee.create,
    employeeBulkWrite: models.Employee.bulkWrite,
    clientFind: models.Client.find,
    userExists: models.User.exists,
    userBulkWrite: models.User.bulkWrite,
  };
  const existingEmployee = {
    id: 4,
    name: "Maja",
    surname: "Kovac",
    username: "Maja",
    password: "existing-hash",
    role: "Beautician",
  };
  let createdEmployee;
  let employeeUpdates;

  models.Employee.find = (query) => ({
    lean: async () => query ? [existingEmployee] : [existingEmployee, createdEmployee],
  });
  models.Employee.findOne = () => ({
    sort: () => ({ select: () => ({ lean: async () => ({ id: 4 }) }) }),
  });
  models.User.exists = async () => null;
  models.Employee.create = async (employee) => {
    createdEmployee = employee;
    return employee;
  };
  models.Employee.bulkWrite = async (updates) => { employeeUpdates = updates; };
  models.Client.find = () => ({ lean: async () => [] });
  models.User.bulkWrite = async () => {};

  try {
    let status;
    let response;
    const req = { body: { name: "Maja", surname: "Horvat" } };
    const res = {
      status: (code) => { status = code; return res; },
      json: (body) => { response = body; },
    };

    await createEmployee(req, res);

    assert.equal(status, 201);
    assert.equal(response.username, "MajaH");
    assert.equal(await bcrypt.compare("majah", createdEmployee.password), true);
    assert.deepEqual(employeeUpdates, [{
      updateOne: {
        filter: { id: 4 },
        update: { $set: { username: "MajaK" } },
      },
    }]);
  } finally {
    models.Employee.find = originals.employeeFind;
    models.Employee.findOne = originals.employeeFindOne;
    models.Employee.create = originals.employeeCreate;
    models.Employee.bulkWrite = originals.employeeBulkWrite;
    models.Client.find = originals.clientFind;
    models.User.exists = originals.userExists;
    models.User.bulkWrite = originals.userBulkWrite;
  }
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

test("beauticians cannot update client balances or Beauty Points", () => {
  const updates = sanitizeClientUpdates({
    name: "Allowed name",
    wallet: 5000,
    spentBeautyPoints: 0,
    termins: 999,
    cancelled: 0,
    diary: [{ _id: "internal", text: "Allowed diary note" }],
  }, "Beautician");

  assert.deepEqual(updates, {
    name: "Allowed name",
    diary: [{ text: "Allowed diary note" }],
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
  const originalFindOne = models.Employee.findOne;
  const originalFindOneAndUpdate = models.Employee.findOneAndUpdate;
  const originalCountDocuments = models.Employee.countDocuments;
  const originalAppointmentFind = models.Appointment.find;
  let savedQuery;

  models.Employee.findOne = () => ({
    lean: async () => ({ id: 2, name: "Maja", role: "Beautician", schedule }),
  });
  models.Employee.findOneAndUpdate = (query, updates) => ({
    lean: async () => {
      savedQuery = { query, updates };
      return { id: 2, name: "Maja", role: "Beautician", schedule };
    },
  });
  models.Employee.countDocuments = async () => 1;
  models.Appointment.find = () => ({ lean: async () => [] });

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
    models.Employee.findOne = originalFindOne;
    models.Employee.findOneAndUpdate = originalFindOneAndUpdate;
    models.Employee.countDocuments = originalCountDocuments;
    models.Appointment.find = originalAppointmentFind;
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

test("a booked appointment can be completed without a time limit after it starts", async () => {
  const originalAppointmentFindOne = models.Appointment.findOne;
  const originalAppointmentUpdate = models.Appointment.findOneAndUpdate;
  const originalClientUpdate = models.Client.updateOne;
  let savedQuery;
  let savedUpdates;
  let clientQuery;

  models.Appointment.findOne = () => ({
    lean: async () => ({
      id: 12,
      clientId: 4,
      client_email: "client@example.com",
      dayandhour: "2020-01-01 10:00",
      price: 50,
      status: "booked",
    }),
  });
  models.Appointment.findOneAndUpdate = (query, updates) => ({
    lean: async () => {
      savedQuery = query;
      savedUpdates = updates;
      return { id: 12, client_email: "client@example.com", price: 50, status: updates.status };
    },
  });
  models.Client.updateOne = async (query) => { clientQuery = query; };

  try {
    let response;
    const req = { params: { id: "12" }, body: { status: "completed" } };
    const res = { status: () => res, json: (data) => { response = data; } };

    await updateAppointment(req, res);

    assert.deepEqual(savedQuery, { id: 12, status: "booked" });
    assert.deepEqual(savedUpdates, { status: "completed", earningsAmount: 50 });
    assert.deepEqual(clientQuery, { email: "client@example.com" });
    assert.equal(response.status, "completed");
  } finally {
    models.Appointment.findOne = originalAppointmentFindOne;
    models.Appointment.findOneAndUpdate = originalAppointmentUpdate;
    models.Client.updateOne = originalClientUpdate;
  }
});

test("a booked appointment can be marked no-show without a time limit after it starts", async () => {
  const originalAppointmentFindOne = models.Appointment.findOne;
  const originalAppointmentUpdate = models.Appointment.findOneAndUpdate;
  let savedUpdates;

  models.Appointment.findOne = () => ({
    lean: async () => ({ id: 13, dayandhour: "2020-01-01 10:00", price: 50, status: "booked" }),
  });
  models.Appointment.findOneAndUpdate = (_query, updates) => ({
    lean: async () => {
      savedUpdates = updates;
      return { id: 13, status: updates.status };
    },
  });

  try {
    let response;
    const req = { params: { id: "13" }, body: { status: "no_show" } };
    const res = { status: () => res, json: (data) => { response = data; } };

    await updateAppointment(req, res);

    assert.deepEqual(savedUpdates, { status: "no_show", earningsAmount: 0 });
    assert.equal(response.status, "no_show");
  } finally {
    models.Appointment.findOne = originalAppointmentFindOne;
    models.Appointment.findOneAndUpdate = originalAppointmentUpdate;
  }
});

test("clients with the same name are separated by email", async () => {
  const originalClientFindOne = models.Client.findOne;
  const originalAppointmentFind = models.Appointment.find;
  models.Client.findOne = () => ({
    lean: async () => ({ id: 9, name: "Marta", surname: "Maric", email: "first@example.com" }),
  });
  models.Appointment.find = () => ({
    sort: () => ({
      lean: async () => [
        {
          id: 1,
          client_email: "first@example.com",
          client_name: "Marta",
          client_surname: "Maric",
          treatment: "Massage",
          dayandhour: "2099-01-05 10:00",
          beautician: "Maja",
          duration: 60,
          status: "booked",
        },
        {
          id: 2,
          client_email: "second@example.com",
          client_name: "Marta",
          client_surname: "Maric",
          treatment: "Private treatment",
          dayandhour: "2099-01-05 11:00",
          beautician: "Maja",
          duration: 60,
          status: "booked",
        },
      ],
    }),
  });

  try {
    let response;
    const req = { query: {}, user: { id: 9, role: "Client" } };
    const res = { status: () => res, json: (data) => { response = data; } };

    await getAppointments(req, res);

    assert.equal(response[0].id, 1);
    assert.equal(response[1].isBusy, true);
    assert.equal(response[1].id, undefined);
    assert.equal(response[1].treatment, undefined);
  } finally {
    models.Client.findOne = originalClientFindOne;
    models.Appointment.find = originalAppointmentFind;
  }
});

test("appointment updates reject price, duration and client changes", async () => {
  const originalFindOne = models.Appointment.findOne;
  models.Appointment.findOne = () => ({ lean: async () => ({ id: 12, status: "booked" }) });

  try {
    let status;
    const req = { params: { id: "12" }, body: { status: "completed", price: -100 } };
    const res = { status: (code) => { status = code; return res; }, json: () => {} };

    await updateAppointment(req, res);
    assert.equal(status, 400);
  } finally {
    models.Appointment.findOne = originalFindOne;
  }
});

test("appointments cannot be created on a beautician vacation day", async () => {
  const originalTreatmentFindOne = models.Treatment.findOne;
  const originalClientFindOne = models.Client.findOne;
  const originalAppointmentFindOne = models.Appointment.findOne;
  const originalEmployeeFindOne = models.Employee.findOne;
  const date = "2099-01-05";
  const schedule = Object.fromEntries(
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
      .map((day) => [day, { start: "09:00", end: "17:00" }]),
  );

  models.Treatment.findOne = () => ({
    lean: async () => ({ name: "Massage", specialty: "Massage", price: 50, duration: 60 }),
  });
  models.Client.findOne = () => ({
    lean: async () => ({ id: 9, name: "Marta", surname: "Maric", email: "marta@example.com" }),
  });
  models.Appointment.findOne = () => ({
    sort: () => ({ select: () => ({ lean: async () => ({ id: 12 }) }) }),
  });
  models.Employee.findOne = () => ({
    lean: async () => ({ name: "Maja", treatments: ["Massage"], vacations: [date], schedule }),
  });

  try {
    let status;
    let response;
    const req = {
      user: { id: 9, role: "Client" },
      body: { treatment: "Massage", dayandhour: `${date} 10:00`, beautician: "Maja" },
    };
    const res = {
      status: (code) => { status = code; return res; },
      json: (data) => { response = data; },
    };

    await createAppointment(req, res);
    assert.equal(status, 400);
    assert.equal(response.message, "Selected beautician is on vacation on this day");
  } finally {
    models.Treatment.findOne = originalTreatmentFindOne;
    models.Client.findOne = originalClientFindOne;
    models.Appointment.findOne = originalAppointmentFindOne;
    models.Employee.findOne = originalEmployeeFindOne;
  }
});

test("review ratings must be whole numbers from 1 to 5", async () => {
  const originalClientFindOne = models.Client.findOne;
  const originalAppointmentFindOne = models.Appointment.findOne;
  models.Client.findOne = () => ({
    lean: async () => ({ id: 9, name: "Marta", surname: "Maric", email: "marta@example.com" }),
  });
  models.Appointment.findOne = () => ({
    lean: async () => ({
      id: 12,
      client_email: "marta@example.com",
      beautician: "Maja",
      status: "completed",
    }),
  });

  try {
    for (const rating of [-1, 1.5, 6]) {
      let status;
      const req = {
        user: { id: 9, role: "Client" },
        params: { employee: "Maja" },
        body: { appointmentId: 12, rating },
      };
      const res = { status: (code) => { status = code; return res; }, json: () => {} };

      await createReview(req, res);
      assert.equal(status, 400);
    }
  } finally {
    models.Client.findOne = originalClientFindOne;
    models.Appointment.findOne = originalAppointmentFindOne;
  }
});

test("top spender statistics count only completed appointments", async () => {
  const originalClientFind = models.Client.find;
  const originalAppointmentFind = models.Appointment.find;
  const today = new Date().toISOString().slice(0, 10);
  models.Client.find = () => ({
    lean: async () => [{ id: 9, name: "Marta", surname: "Maric", email: "marta@example.com" }],
  });
  models.Appointment.find = () => ({
    lean: async () => [
      { client_email: "marta@example.com", dayandhour: `${today} 09:00`, status: "completed", price: 20 },
      { client_email: "marta@example.com", dayandhour: `${today} 10:00`, status: "booked", price: 100 },
      { client_email: "marta@example.com", dayandhour: `${today} 11:00`, status: "cancelled", price: 100 },
    ],
  });

  try {
    let response;
    await getClientStats({ user: { role: "Admin" } }, { json: (data) => { response = data; } });
    assert.equal(response.topSpenders[0].spentLast30Days, 20);
  } finally {
    models.Client.find = originalClientFind;
    models.Appointment.find = originalAppointmentFind;
  }
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

test("deleting a client also deletes appointments, reviews and login data", async () => {
  const originals = {
    clientFindOne: models.Client.findOne,
    clientDeleteOne: models.Client.deleteOne,
    appointmentFind: models.Appointment.find,
    appointmentDeleteMany: models.Appointment.deleteMany,
    employeeUpdateMany: models.Employee.updateMany,
    userDeleteOne: models.User.deleteOne,
  };
  const calls = {};

  models.Client.findOne = () => ({ lean: async () => ({ id: 7, email: " Client@Example.com " }) });
  models.Appointment.find = (query) => ({
    select: () => ({ lean: async () => {
      calls.findAppointments = query;
      return [{ id: 31 }, { id: 32 }];
    } }),
  });
  models.Employee.updateMany = async (query, update) => { calls.reviews = { query, update }; };
  models.Appointment.deleteMany = async (query) => { calls.appointments = query; };
  models.User.deleteOne = async (query) => { calls.user = query; };
  models.Client.deleteOne = async (query) => { calls.client = query; };

  try {
    let status;
    const req = { params: { id: "7" } };
    const res = { sendStatus: (code) => { status = code; } };

    await deleteClient(req, res);

    const identities = [{ clientId: 7 }, { client_email: "client@example.com" }];
    assert.equal(status, 204);
    assert.deepEqual(calls.findAppointments, { $or: identities });
    assert.deepEqual(calls.appointments, { $or: identities });
    assert.deepEqual(calls.reviews.query, { "reviews.appointmentId": { $in: [31, 32] } });
    assert.deepEqual(calls.user, { sourceId: 7, sourceType: "client" });
    assert.deepEqual(calls.client, { id: 7 });
  } finally {
    models.Client.findOne = originals.clientFindOne;
    models.Client.deleteOne = originals.clientDeleteOne;
    models.Appointment.find = originals.appointmentFind;
    models.Appointment.deleteMany = originals.appointmentDeleteMany;
    models.Employee.updateMany = originals.employeeUpdateMany;
    models.User.deleteOne = originals.userDeleteOne;
  }
});

test("completed appointments cannot be deleted", async () => {
  const originalFindOne = models.Appointment.findOne;
  const originalFindOneAndDelete = models.Appointment.findOneAndDelete;
  let deletionAttempted = false;
  models.Appointment.findOne = () => ({ lean: async () => ({ id: 12, status: "completed" }) });
  models.Appointment.findOneAndDelete = async () => { deletionAttempted = true; };

  try {
    let status;
    let response;
    const req = { params: { id: "12" } };
    const res = {
      status: (code) => { status = code; return res; },
      json: (body) => { response = body; },
    };

    await deleteAppointment(req, res);

    assert.equal(status, 409);
    assert.equal(response.message, "Completed appointments cannot be deleted");
    assert.equal(deletionAttempted, false);
  } finally {
    models.Appointment.findOne = originalFindOne;
    models.Appointment.findOneAndDelete = originalFindOneAndDelete;
  }
});

test("vacation cannot be added on a day with a booked appointment", async () => {
  const originals = {
    findOne: models.Employee.findOne,
    findOneAndUpdate: models.Employee.findOneAndUpdate,
    countDocuments: models.Employee.countDocuments,
    appointmentFind: models.Appointment.find,
  };
  let updateAttempted = false;
  models.Employee.findOne = () => ({
    select: () => ({
      lean: async () => ({ id: 2, name: "Maja", vacations: [], vacationAllowance: 20 }),
    }),
  });
  models.Employee.countDocuments = async () => 1;
  models.Appointment.find = () => ({
    lean: async () => [{ id: 41, beauticianId: 2, dayandhour: "2099-01-05 10:00", status: "booked" }],
  });
  models.Employee.findOneAndUpdate = () => { updateAttempted = true; };

  try {
    let status;
    let response;
    const req = {
      params: { id: "2" },
      user: { id: 2, role: "Beautician", type: "employee" },
      body: { vacations: ["2099-01-05"] },
    };
    const res = {
      status: (code) => { status = code; return res; },
      json: (body) => { response = body; },
    };

    await updateEmployeeVacations(req, res);

    assert.equal(status, 409);
    assert.match(response.message, /booked appointment/);
    assert.equal(updateAttempted, false);
  } finally {
    models.Employee.findOne = originals.findOne;
    models.Employee.findOneAndUpdate = originals.findOneAndUpdate;
    models.Employee.countDocuments = originals.countDocuments;
    models.Appointment.find = originals.appointmentFind;
  }
});

test("schedule cannot be changed across an existing future booking", async () => {
  const originals = {
    findOne: models.Employee.findOne,
    findOneAndUpdate: models.Employee.findOneAndUpdate,
    countDocuments: models.Employee.countDocuments,
    appointmentFind: models.Appointment.find,
  };
  const closedSchedule = Object.fromEntries(
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
      .map((day) => [day, { start: "-", end: "-" }]),
  );
  let updateAttempted = false;
  models.Employee.findOne = () => ({ lean: async () => ({ id: 2, name: "Maja" }) });
  models.Employee.countDocuments = async () => 1;
  models.Appointment.find = () => ({
    lean: async () => [{ id: 42, dayandhour: "2099-01-05 10:00", duration: 60, status: "booked" }],
  });
  models.Employee.findOneAndUpdate = () => { updateAttempted = true; };

  try {
    let status;
    let response;
    const req = {
      params: { id: "2" },
      user: { id: 1, role: "Admin", type: "employee" },
      body: { schedule: closedSchedule },
    };
    const res = {
      status: (code) => { status = code; return res; },
      json: (body) => { response = body; },
    };

    await updateEmployeeSchedule(req, res);

    assert.equal(status, 409);
    assert.match(response.message, /existing booked appointment/);
    assert.equal(updateAttempted, false);
  } finally {
    models.Employee.findOne = originals.findOne;
    models.Employee.findOneAndUpdate = originals.findOneAndUpdate;
    models.Employee.countDocuments = originals.countDocuments;
    models.Appointment.find = originals.appointmentFind;
  }
});

test("renaming a beautician keeps existing appointments linked by employee id", async () => {
  const originals = {
    employeeFindOne: models.Employee.findOne,
    employeeFindOneAndUpdate: models.Employee.findOneAndUpdate,
    employeeFind: models.Employee.find,
    employeeCountDocuments: models.Employee.countDocuments,
    clientFind: models.Client.find,
    appointmentUpdateMany: models.Appointment.updateMany,
    userBulkWrite: models.User.bulkWrite,
  };
  const oldEmployee = {
    id: 2,
    name: "Maja",
    surname: "Stara",
    email: "old@example.com",
    username: "maja",
    password: "hashed-password",
    role: "Beautician",
  };
  const renamedEmployee = {
    ...oldEmployee,
    name: "Marija",
    surname: "Nova",
    email: "new@example.com",
  };
  let appointmentQuery;
  let appointmentUpdate;

  models.Employee.findOne = () => ({ lean: async () => oldEmployee });
  models.Employee.findOneAndUpdate = () => ({ lean: async () => renamedEmployee });
  models.Employee.countDocuments = async () => 0;
  models.Appointment.updateMany = async (query, update) => {
    appointmentQuery = query;
    appointmentUpdate = update;
  };
  models.Employee.find = () => ({ lean: async () => [renamedEmployee] });
  models.Client.find = () => ({ lean: async () => [] });
  models.User.bulkWrite = async () => {};

  try {
    let response;
    const req = {
      params: { id: "2" },
      body: { name: "Marija", surname: "Nova", email: "NEW@example.com" },
    };
    const res = { status: () => res, json: (body) => { response = body; } };

    await updateEmployee(req, res);

    assert.deepEqual(appointmentQuery, {
      $or: [
        { beauticianId: 2 },
        { beauticianId: null, beautician: "Maja" },
      ],
    });
    assert.deepEqual(appointmentUpdate, {
      $set: {
        beauticianId: 2,
        beautician: "Marija",
        beautician_surname: "Nova",
        beautician_email: "new@example.com",
      },
    });
    assert.equal(response.name, "Marija");
  } finally {
    models.Employee.findOne = originals.employeeFindOne;
    models.Employee.findOneAndUpdate = originals.employeeFindOneAndUpdate;
    models.Employee.find = originals.employeeFind;
    models.Employee.countDocuments = originals.employeeCountDocuments;
    models.Client.find = originals.clientFind;
    models.Appointment.updateMany = originals.appointmentUpdateMany;
    models.User.bulkWrite = originals.userBulkWrite;
  }
});
