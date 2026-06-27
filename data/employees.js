export const specialties = ["Haircut", "Facial", "Massage"];

const defaultSchedule = {
  Monday: { start: "09:00", end: "17:00" },
  Tuesday: { start: "09:00", end: "17:00" },
  Wednesday: { start: "09:00", end: "17:00" },
  Thursday: { start: "09:00", end: "17:00" },
  Friday: { start: "09:00", end: "17:00" },
  Saturday: { start: "-", end: "-" },
  Sunday: { start: "-", end: "-" },
};

export const employees = [
  {
    id: 1,
    name: "Tara",
    surname: "",
    username: "Tara",
    password: "tara",
    role: "Admin",
    specialties: ["Massage", "Facial"],
    schedule: {
      Monday: { start: "07:00", end: "17:00" },
      Tuesday: { start: "08:00", end: "16:00" },
      Wednesday: { start: "07:00", end: "15:00" },
      Thursday: { start: "08:00", end: "18:00" },
      Friday: { start: "07:00", end: "15:00" },
      Saturday: { start: "-", end: "-" },
      Sunday: { start: "-", end: "-" },
    },
    reviews: [
      { client: "Margarita Marić", rating: 5, comment: "Odličan tretman." },
    ],
    productOrders: [{ text: "Ručnici", checked: false }],
    vacations: [],
  },
  {
    id: 2,
    name: "Luna",
    surname: "",
    username: "Luna",
    password: "luna",
    role: "Beautician",
    specialties: ["Facial"],
    schedule: {
      Monday: { start: "10:00", end: "18:00" },
      Tuesday: { start: "10:00", end: "18:00" },
      Wednesday: { start: "10:00", end: "18:00" },
      Thursday: { start: "10:00", end: "18:00" },
      Friday: { start: "10:00", end: "18:00" },
      Saturday: { start: "-", end: "-" },
      Sunday: { start: "-", end: "-" },
    },
    reviews: [],
    productOrders: [{ text: "", checked: false }],
    vacations: [],
  },
  {
    id: 3,
    name: "Ana",
    surname: "",
    username: "Ana",
    password: "ana",
    role: "Beautician",
    specialties: ["Haircut"],
    schedule: defaultSchedule,
    reviews: [],
    productOrders: [{ text: "", checked: false }],
    vacations: [],
  },
];

export function createEmployee(name) {
  const schedule = {};
  Object.keys(defaultSchedule).forEach((day) => {
    schedule[day] = { start: "-", end: "-" };
  });

  return {
    id: Date.now(),
    name,
    surname: "",
    username: name,
    password: name.toLowerCase(),
    role: "Beautician",
    specialties: [],
    schedule,
    reviews: [],
    productOrders: [{ text: "", checked: false }],
    vacations: [],
  };
}
