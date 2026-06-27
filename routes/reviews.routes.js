import { Router } from "express";
import { createReview, getReviews } from "../controllers/reviewsController.js";

const router = Router();

router.get("/", getReviews);
router.post("/:employee", createReview);

export default router;
