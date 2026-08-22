import { Router } from "express";
import {
  addDiaryNote,
  createClient,
  deleteClient,
  getClient,
  getClients,
  getClientStats,
  updateClient,
} from "../controllers/clientsController.js";
import { requireAdmin, requireRole } from "../middleware/roles.js";

const router = Router();

router.get("/", getClients);
router.get("/stats", requireAdmin, getClientStats);
router.get("/:id", getClient);
router.post("/", requireRole("Admin", "Beautician"), createClient);
router.put("/:id", requireRole("Admin", "Beautician", "Client"), updateClient);
router.patch("/:id", requireRole("Admin", "Beautician", "Client"), updateClient);
router.delete("/:id", requireRole("Admin", "Beautician"), deleteClient);
router.post("/:id/diary", requireAdmin, addDiaryNote);

export default router;
