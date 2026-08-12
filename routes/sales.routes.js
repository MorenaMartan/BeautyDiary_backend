import { Router } from "express";
import { getDailySales, getMonthlySales, getTreatmentStats } from "../controllers/salesController.js";
import { requireAdmin } from "../middleware/roles.js";

const router = Router();

router.get("/daily", requireAdmin, getDailySales);
router.get("/monthly", requireAdmin, getMonthlySales);
router.get("/treatments", requireAdmin, getTreatmentStats);

export default router;
