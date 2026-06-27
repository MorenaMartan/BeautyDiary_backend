import { Router } from "express";
import {
  cancelAppointment,
  createAppointment,
  deleteAppointment,
  getAppointments,
  getAvailability,
  updateAppointment,
} from "../controllers/appointmentsController.js";

const router = Router();

router.get("/", getAppointments);
router.get("/availability", getAvailability);
router.post("/", createAppointment);
router.put("/:id", updateAppointment);
router.patch("/:id", updateAppointment);
router.patch("/:id/cancel", cancelAppointment);
router.delete("/:id", deleteAppointment);

export default router;
