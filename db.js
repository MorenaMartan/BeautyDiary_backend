import mongoose from "mongoose";
import { Appointment, Client, Employee, Specialty, Treatment, User, LoyaltySettings } from "./models/index.js";

const DEFAULT_MONGODB_URI = "mongodb://127.0.0.1:27017/beautydiary";

export async function connectToDatabase() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || DEFAULT_MONGODB_URI;
  const dbName = process.env.MONGO_DB_NAME;
  const options = { serverSelectionTimeoutMS: 10000 };

  if (dbName) {
    options.dbName = dbName;
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, options);
  await ensureDefaultSpecialties();
  await syncUsersCollection();
  await syncAppointmentClientEmails();
  await syncAppointmentBeauticians();
  console.log(`Spojeno na MongoDB: ${mongoose.connection.name}`);
}

export const models = {
  Appointment,
  Client,
  Employee,
  Specialty,
  Treatment,
  User,
  LoyaltySettings,
};

export async function nextId(Model) {
  const lastDocument = await Model.findOne().sort({ id: -1 }).select("id").lean();
  return (lastDocument?.id || 0) + 1;
}

export async function syncUsersCollection() {
  const [employees, clients] = await Promise.all([
    Employee.find().lean(),
    Client.find().lean(),
  ]);
  const operations = [
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
    ...clients.map((client) => ({
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
  ];

  if (operations.length) {
    await User.bulkWrite(operations);
  }
}

export async function syncAppointmentClientEmails() {
  const clients = await Client.find().select("id name surname email").lean();
  const nameCounts = clients.reduce((counts, client) => {
    const key = `${client.name}\u0000${client.surname || ""}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());

  for (const client of clients) {
    if (!client.email) continue;

    await Appointment.updateMany(
      { clientId: client.id },
      { $set: { client_email: client.email } },
    );

    const key = `${client.name}\u0000${client.surname || ""}`;
    if (nameCounts.get(key) === 1) {
      await Appointment.updateMany(
        {
          client_email: { $in: [null, ""] },
          client_name: client.name,
          client_surname: client.surname || "",
        },
        { $set: { clientId: client.id, client_email: client.email } },
      );
    }
  }
}

export async function syncAppointmentBeauticians() {
  const employees = await Employee.find().select("id name surname email").lean();
  const nameCounts = employees.reduce((counts, employee) => {
    counts.set(employee.name, (counts.get(employee.name) || 0) + 1);
    return counts;
  }, new Map());

  for (const employee of employees) {
    const identity = {
      beauticianId: employee.id,
      beautician: employee.name,
      beautician_surname: employee.surname || "",
      beautician_email: (employee.email || "").trim().toLowerCase(),
    };

    await Appointment.updateMany(
      { beauticianId: employee.id },
      { $set: identity },
    );

    if (nameCounts.get(employee.name) === 1) {
      await Appointment.updateMany(
        { beauticianId: { $exists: false }, beautician: employee.name },
        { $set: identity },
      );
    }
  }
}

async function ensureDefaultSpecialties() {
  await Promise.all(
    ["Nokti", "Depilacija", "Masaža"].map((name) =>
      Specialty.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true }),
    ),
  );
}
