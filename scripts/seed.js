import "dotenv/config";
import mongoose from "mongoose";
import { appointments } from "../data/appointments.js";
import { clients } from "../data/clients.js";
import { employees, specialties } from "../data/employees.js";
import { treatments } from "../data/treatments.js";
import { connectToDatabase, models } from "../db.js";

try {
  await connectToDatabase();

  await Promise.all([
    models.Appointment.deleteMany({}),
    models.Client.deleteMany({}),
    models.Employee.deleteMany({}),
    models.Specialty.deleteMany({}),
    models.Treatment.deleteMany({}),
    models.User.deleteMany({}),
  ]);

  await Promise.all([
    models.Appointment.insertMany(appointments),
    models.Client.insertMany(clients.map(normalizeClient)),
    models.Employee.insertMany(employees),
    models.Specialty.insertMany(specialties.map((name) => ({ name }))),
    models.Treatment.insertMany(treatments),
  ]);

  await models.User.bulkWrite([
    ...employees.map((employee) => ({
      updateOne: {
        filter: { sourceId: employee.id, sourceType: "employee" },
        update: {
          $set: {
            sourceId: employee.id,
            sourceType: "employee",
            name: employee.name,
            surname: employee.surname || "",
            username: employee.username,
            password: employee.password,
            role: employee.role,
            email: employee.email || "",
            mobile: employee.mobile || "",
          },
        },
        upsert: true,
      },
    })),
    ...clients.map(normalizeClient).map((client) => ({
      updateOne: {
        filter: { sourceId: client.id, sourceType: "client" },
        update: {
          $set: {
            sourceId: client.id,
            sourceType: "client",
            name: client.name,
            surname: client.surname || "",
            username: client.username,
            password: client.password,
            role: "Client",
            email: client.email || "",
            mobile: client.mobile || "",
          },
        },
        upsert: true,
      },
    })),
  ]);

  console.log("MongoDB seed completed.");
  await mongoose.connection.close();
} catch (error) {
  console.error("MongoDB seed failed:", error.message);
  await mongoose.connection.close();
  process.exit(1);
}

function normalizeClient(client) {
  return {
    ...client,
    password: client.password?.startsWith("[") ? client.name.toLowerCase() : client.password,
    createdAt: client.createdAt || new Date(),
  };
}
