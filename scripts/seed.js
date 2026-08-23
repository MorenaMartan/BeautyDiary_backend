import "dotenv/config";
import mongoose from "mongoose";
import { appointments } from "../data/appointments.js";
import { clients } from "../data/clients.js";
import { employees, specialties } from "../data/employees.js";
import { treatments } from "../data/treatments.js";
import {
  connectToDatabase,
  models,
  syncAppointmentBeauticians,
  syncAppointmentClientEmails,
  syncUsersCollection,
} from "../db.js";

try {
  await connectToDatabase();

  await Promise.all([
    insertMissing(models.Appointment, appointments),
    insertMissing(models.Client, clients.map(normalizeClient)),
    insertMissing(models.Employee, employees),
    insertMissing(models.Specialty, specialties.map((name) => ({ name })), "name"),
    insertMissing(models.Treatment, treatments),
  ]);

  await syncUsersCollection();
  await syncAppointmentClientEmails();
  await syncAppointmentBeauticians();

  console.log("MongoDB seed completed without deleting or replacing existing data.");
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

async function insertMissing(Model, documents, uniqueField = "id") {
  if (!documents.length) return;

  await Model.bulkWrite(
    documents.map((document) => ({
      updateOne: {
        filter: { [uniqueField]: document[uniqueField] },
        update: { $setOnInsert: document },
        upsert: true,
      },
    })),
  );
}
