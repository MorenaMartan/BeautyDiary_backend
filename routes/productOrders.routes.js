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
router.post("/:employeeId", createProductOrder);
router.patch("/:employeeId/:index", updateProductOrder);
router.delete("/:employeeId/:index", deleteProductOrder);

export default router;
