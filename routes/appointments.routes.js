import { Router } from "express";
import {
  cancelAppointment,
  createAppointment,
  deleteAppointment,
  getAppointments,
  getAvailability,
  updateAppointment,
} from "../controllers/appointmentsController.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.get("/", getAppointments);
router.get("/availability", getAvailability);
router.post("/", createAppointment);
router.put("/:id", requireRole("Admin", "Beautician"), updateAppointment);
router.patch("/:id", requireRole("Admin", "Beautician"), updateAppointment);
router.patch("/:id/cancel", cancelAppointment);
router.delete("/:id", requireRole("Admin", "Beautician"), deleteAppointment);

export default router;
