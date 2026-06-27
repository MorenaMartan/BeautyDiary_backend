import { Router } from "express";
import {
  createTreatment,
  deleteTreatment,
  getTreatments,
  updateTreatment,
} from "../controllers/treatmentsController.js";
import { requireAdmin } from "../middleware/roles.js";

const router = Router();

router.get("/", getTreatments);
router.post("/", requireAdmin, createTreatment);
router.put("/:id", requireAdmin, updateTreatment);
router.patch("/:id", requireAdmin, updateTreatment);
router.delete("/:id", requireAdmin, deleteTreatment);

export default router;
