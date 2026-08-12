import { models } from "../db.js";

export async function getProductOrders(req, res) {
  const { employee } = req.query;
  const query = employee ? { name: employee } : {};
  if (req.user.role === "Beautician") query.id = req.user.id;
  if (req.user.role === "Client") return res.status(403).json({ message: "Clients cannot access product orders" });
  const employees = await models.Employee.find(query).sort({ id: 1 }).lean();

  res.json(employees.map((e) => ({ employee: e.name, productOrders: e.productOrders || [] })));
}

export async function createProductOrder(req, res) {
  if (!(await canManageEmployeeOrders(req, req.params.employee))) {
    return res.status(403).json({ message: "You can manage only your own product orders" });
  }

  const order = {
    text: req.body.text || "",
    checked: false,
  };
  const employee = await models.Employee.findOneAndUpdate(
    { name: req.params.employee },
    { $push: { productOrders: order } },
    { new: true },
  ).lean();

  if (!employee) return res.status(404).json({ message: "Employee not found" });
  res.status(201).json(order);
}

export async function updateProductOrder(req, res) {
  if (!(await canManageEmployeeOrders(req, req.params.employee))) {
    return res.status(403).json({ message: "You can manage only your own product orders" });
  }

  const employee = await models.Employee.findOne({ name: req.params.employee });
  if (!employee) return res.status(404).json({ message: "Employee not found" });

  const order = employee.productOrders[Number(req.params.index)];
  if (!order) return res.status(404).json({ message: "Product order not found" });

  Object.assign(order, req.body);
  if (order.checked && !order.checkedAt) order.checkedAt = new Date();
  if (!order.checked) order.checkedAt = undefined;

  await employee.save();
  res.json(order);
}

export async function deleteProductOrder(req, res) {
  if (!(await canManageEmployeeOrders(req, req.params.employee))) {
    return res.status(403).json({ message: "You can manage only your own product orders" });
  }

  const employee = await models.Employee.findOne({ name: req.params.employee });
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

async function canManageEmployeeOrders(req, employeeName) {
  if (req.user.role === "Admin") return true;
  if (req.user.role !== "Beautician") return false;

  const employee = await models.Employee.findOne({ id: req.user.id, name: employeeName }).lean();
  return Boolean(employee);
}
