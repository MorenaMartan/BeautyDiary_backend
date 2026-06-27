import { Router } from "express";
import { getDailySales, getMonthlySales, getTreatmentStats } from "../controllers/salesController.js";

const router = Router();

router.get("/daily", getDailySales);
router.get("/monthly", getMonthlySales);
router.get("/treatments", getTreatmentStats);

export default router;
