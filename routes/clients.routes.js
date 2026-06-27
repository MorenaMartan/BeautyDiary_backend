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

const router = Router();

router.get("/", getClients);
router.get("/stats", getClientStats);
router.get("/:id", getClient);
router.post("/", createClient);
router.put("/:id", updateClient);
router.patch("/:id", updateClient);
router.delete("/:id", deleteClient);
router.post("/:id/diary", addDiaryNote);

export default router;
