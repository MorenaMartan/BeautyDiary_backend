import { Router } from "express";
import {
  createEmployee,
  createSpecialty,
  deleteEmployee,
  deleteSpecialty,
  getEmployee,
  getEmployees,
  getSpecialties,
  updateEmployeeProfile,
  updateEmployeeSchedule,
  updateEmployeeTreatments,
  updateEmployeeVacations,
  updateVacationAllowance,
  updateEmployee,
  updateSpecialty,
} from "../controllers/employeesController.js";
import { requireAdmin } from "../middleware/roles.js";

const router = Router();

router.get("/", getEmployees);
router.get("/specialties", getSpecialties);
router.post("/specialties", requireAdmin, createSpecialty);
router.patch("/specialties/:name", requireAdmin, updateSpecialty);
router.delete("/specialties/:name", requireAdmin, deleteSpecialty);
router.get("/:id", getEmployee);
router.post("/", requireAdmin, createEmployee);
router.patch("/:id/profile", updateEmployeeProfile);
router.patch("/:id/schedule", updateEmployeeSchedule);
router.patch("/:id/treatments", updateEmployeeTreatments);
router.patch("/:id/vacations", updateEmployeeVacations);
router.patch("/:id/vacation-allowance", requireAdmin, updateVacationAllowance);
router.put("/:id", requireAdmin, updateEmployee);
router.patch("/:id", requireAdmin, updateEmployee);
router.delete("/:id", requireAdmin, deleteEmployee);

export default router;
