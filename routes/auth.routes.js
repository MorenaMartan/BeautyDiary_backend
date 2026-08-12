import { Router } from "express";
import { login, logout, refresh, signup } from "../controllers/authController.js";

const router = Router();

router.post("/login", login);
router.post("/signup", signup);
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
