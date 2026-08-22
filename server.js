import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import clientRoutes from "./routes/clients.routes.js";
import employeeRoutes from "./routes/employees.routes.js";
import appointmentRoutes from "./routes/appointments.routes.js";
import treatmentRoutes from "./routes/treatments.routes.js";
import productOrderRoutes from "./routes/productOrders.routes.js";
import reviewRoutes from "./routes/reviews.routes.js";
import salesRoutes from "./routes/sales.routes.js";
import loyaltySettingsRoutes from "./routes/loyaltySettings.routes.js";
import { connectToDatabase } from "./db.js";
import { requireAuth } from "./middleware/auth.js";

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || "http://localhost:5173";
const app = express();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured before starting the API");
}

app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-user-role");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "Beauty Diary API" });
});

app.use("/api/auth", authRoutes);
app.use("/api/clients", requireAuth, clientRoutes);
app.use("/api/employees", requireAuth, employeeRoutes);
app.use("/api/appointments", requireAuth, appointmentRoutes);
app.use("/api/treatments", requireAuth, treatmentRoutes);
app.use("/api/product-orders", requireAuth, productOrderRoutes);
app.use("/api/reviews", requireAuth, reviewRoutes);
app.use("/api/sales", requireAuth, salesRoutes);
app.use("/api/loyalty-settings", requireAuth, loyaltySettingsRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((error, req, res, next) => {
  if (error.name === "ValidationError") {
    return res.status(400).json({ message: error.message });
  }

  if (error.code === 11000) {
    return res.status(409).json({ message: "Duplicate value already exists" });
  }

  if (error.name === "CastError") {
    return res.status(400).json({ message: error.message });
  }

  console.error(error);
  res.status(500).json({ message: error.message || "Server error" });
});

connectToDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server sluša na portu http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  });
