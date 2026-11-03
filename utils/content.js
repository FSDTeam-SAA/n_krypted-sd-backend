import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import ApiError from "./ApiError.js";

export const cleanHtml = (value) =>
  sanitizeHtml(String(value || ""), {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
      "span",
    ],
    allowedAttributes: { a: ["href", "title"], "*": ["class", "style"] },
    allowedClasses: {
      "*": ["ql-align-center", "ql-align-right", "ql-align-justify"],
    },
    allowedStyles: { "*": { "text-align": [/^(left|right|center|justify)$/] } },
    allowedSchemes: ["https", "http", "mailto", "tel"],
  });
export const validate = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      400,
      result.error.issues
        .map((item) => `${item.path.join(".")}: ${item.message}`)
        .join("; "),
    );
  return result.data;
};
export const safeUrl = z
  .string()
  .trim()
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS URL");
export const hasVisibleText = (value) =>
  cleanHtml(value)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .trim().length > 0;
export const openingHoursSchema = z
  .array(
    z.object({
      day: z.enum([
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ]),
      open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      closed: z.boolean().default(false),
    }),
  )
  .max(7)
  .refine(
    (hours) => new Set(hours.map((row) => row.day)).size === hours.length,
    "Duplicate opening day",
  );
