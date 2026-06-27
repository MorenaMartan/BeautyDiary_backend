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
  updateEmployee,
} from "../controllers/employeesController.js";
import { requireAdmin } from "../middleware/roles.js";

const router = Router();

router.get("/", getEmployees);
router.get("/specialties", getSpecialties);
router.post("/specialties", requireAdmin, createSpecialty);
router.delete("/specialties/:name", requireAdmin, deleteSpecialty);
router.get("/:id", getEmployee);
router.post("/", requireAdmin, createEmployee);
router.patch("/:id/profile", updateEmployeeProfile);
router.put("/:id", requireAdmin, updateEmployee);
router.patch("/:id", requireAdmin, updateEmployee);
router.delete("/:id", requireAdmin, deleteEmployee);

export default router;
