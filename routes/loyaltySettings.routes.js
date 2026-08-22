import { Router } from "express";
import { getLoyaltySettings, updateLoyaltySettings } from "../controllers/loyaltySettingsController.js";
import { requireAdmin } from "../middleware/roles.js";

const router = Router();
router.get("/", getLoyaltySettings);
router.put("/", requireAdmin, updateLoyaltySettings);
export default router;
