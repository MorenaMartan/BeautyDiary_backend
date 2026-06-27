export function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function toTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function dayName(dateString) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    new Date(dateString).getDay()
  ];
}

export function overlaps(startA, durationA, startB, durationB) {
  const aStart = toMinutes(startA);
  const aEnd = aStart + Number(durationA);
  const bStart = toMinutes(startB);
  const bEnd = bStart + Number(durationB);

  return aStart < bEnd && bStart < aEnd;
}
