import { models } from "../db.js";

export async function getProductOrders(req, res) {
  if (req.user.role === "Client") return res.status(403).json({ message: "Clients cannot access product orders" });
  const query = req.user.role === "Beautician"
    ? { id: req.user.id, role: "Beautician" }
    : {};
  const employees = await models.Employee.find(query).sort({ id: 1 }).lean();

  res.json(employees.map((employee) => ({
    id: employee.id,
    name: employee.name,
    surname: employee.surname,
    role: employee.role,
    productOrders: employee.productOrders || [],
  })));
}

export async function createProductOrder(req, res) {
  const employeeId = Number(req.params.employeeId);
  if (!(await canManageEmployeeOrders(req, employeeId))) {
    return res.status(403).json({ message: "You can manage only your own product orders" });
  }

  if (typeof req.body.text !== "string") {
    return res.status(400).json({ message: "Product order text must be a string" });
  }
  const order = {
    text: req.body.text,
    checked: false,
  };
  const employee = await models.Employee.findOneAndUpdate(
    { id: employeeId },
    { $push: { productOrders: order } },
    { new: true },
  ).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  res.status(201).json(order);
}

export async function updateProductOrder(req, res) {
  const employeeId = Number(req.params.employeeId);
  if (!(await canManageEmployeeOrders(req, employeeId))) {
    return res.status(403).json({ message: "You can manage only your own product orders" });
  }
  if ("checked" in req.body && req.user.role !== "Admin") {
    return res.status(403).json({ message: "Only admin can mark products as purchased" });
  }

  const employee = await models.Employee.findOne({ id: employeeId });
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  const order = employee.productOrders[Number(req.params.index)];
  if (!order) return res.status(404).json({ message: "Product order not found" });

  if ("text" in req.body) {
    if (typeof req.body.text !== "string") {
      return res.status(400).json({ message: "Product order text must be a string" });
    }
    order.text = req.body.text;
  }
  if ("checked" in req.body) order.checked = Boolean(req.body.checked);
  if (order.checked && !order.checkedAt) order.checkedAt = new Date();
  if (!order.checked) order.checkedAt = undefined;

  await employee.save();
  res.json(order);
}

export async function deleteProductOrder(req, res) {
  const employeeId = Number(req.params.employeeId);
  if (!(await canManageEmployeeOrders(req, employeeId))) {
    return res.status(403).json({ message: "You can manage only your own product orders" });
  }

  const employee = await models.Employee.findOne({ id: employeeId });
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  employee.productOrders.splice(Number(req.params.index), 1);
  if (!employee.productOrders.length) employee.productOrders.push({ text: "", checked: false });

  await employee.save();
  res.sendStatus(204);
}

export async function cleanupProductOrders(req, res) {
  if (req.user.role !== "Admin") return res.status(403).json({ message: "Only admin can clean up product orders" });
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const employees = await models.Employee.find();

  for (const employee of employees) {
    employee.productOrders = employee.productOrders.filter((order) => !order.checked || !order.checkedAt || order.checkedAt > threeDaysAgo);
    await employee.save();
  }

  res.json({ message: "Cleanup completed" });
}

async function canManageEmployeeOrders(req, employeeId) {
  if (!Number.isInteger(employeeId) || employeeId < 1) return false;
  if (req.user.role === "Admin") return true;
  if (req.user.role !== "Beautician") return false;

  const employee = await models.Employee.findOne({
    id: req.user.id,
    role: "Beautician",
  }).lean();
  return Boolean(employee && employee.id === employeeId);
}
