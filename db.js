import mongoose from "mongoose";
import { Appointment, Client, Employee, Specialty, Treatment, User } from "./models/index.js";

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
  console.log(`Spojeno na MongoDB: ${mongoose.connection.name}`);
}

export const models = {
  Appointment,
  Client,
  Employee,
  Specialty,
  Treatment,
  User,
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
  const validUsers = new Set([
    ...employees.map((employee) => `employee:${employee.id}`),
    ...clients.map((client) => `client:${client.id}`),
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

  const users = await User.find().lean();
  const staleUserIds = users
    .filter((user) => !validUsers.has(`${user.sourceType}:${user.sourceId}`))
    .map((user) => user._id);

  if (staleUserIds.length) {
    await User.deleteMany({ _id: { $in: staleUserIds } });
  }
}

async function ensureDefaultSpecialties() {
  await Promise.all(
    ["Haircut", "Facial", "Massage"].map((name) =>
      Specialty.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true }),
    ),
  );
}
