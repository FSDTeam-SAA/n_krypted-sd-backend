export const isOpenNow = (restaurant, now = new Date()) => {
  if (restaurant.opensAt && restaurant.opensAt > now) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: restaurant.timeZone || "Europe/Berlin",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (key) => parts.find((part) => part.type === key)?.value;
  const day = get("weekday");
  const time = `${get("hour")}:${get("minute")}`;
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const previous = days[(days.indexOf(day) + 6) % 7];
  return (restaurant.openingHours || []).some((hours) => {
    if (hours.closed || !hours.open || !hours.close) return false;
    if (hours.open === hours.close) return hours.day === day;
    if (hours.open < hours.close)
      return hours.day === day && time >= hours.open && time < hours.close;
    return (
      (hours.day === day && time >= hours.open) ||
      (hours.day === previous && time < hours.close)
    );
  });
};

export const defaultTags = [
  "Gluten-free",
  "Low-carb",
  "Contains nuts",
  "Vegan",
  "Vegetarian",
  "New",
  "Spicy",
];
