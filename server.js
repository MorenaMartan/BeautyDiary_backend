import express from "express";
import "dotenv/config";
import authRoutes from "./routes/auth.routes.js";
import clientRoutes from "./routes/clients.routes.js";
import employeeRoutes from "./routes/employees.routes.js";
import appointmentRoutes from "./routes/appointments.routes.js";
import treatmentRoutes from "./routes/treatments.routes.js";
import productOrderRoutes from "./routes/productOrders.routes.js";
import reviewRoutes from "./routes/reviews.routes.js";
import salesRoutes from "./routes/sales.routes.js";
import { connectToDatabase } from "./db.js";

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-user-role");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "Beauty Diary API" });
});

app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/treatments", treatmentRoutes);
app.use("/api/product-orders", productOrderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/sales", salesRoutes);

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
