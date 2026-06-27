import { Router } from "express";
import {
  cleanupProductOrders,
  createProductOrder,
  deleteProductOrder,
  getProductOrders,
  updateProductOrder,
} from "../controllers/productOrdersController.js";

const router = Router();

router.get("/", getProductOrders);
router.post("/cleanup", cleanupProductOrders);
router.post("/:employee", createProductOrder);
router.patch("/:employee/:index", updateProductOrder);
router.delete("/:employee/:index", deleteProductOrder);

export default router;
