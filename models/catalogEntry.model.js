import mongoose from "mongoose";

// Managed discovery vocabulary; names remain compatible with existing string fields.
const schema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["city", "tag"], required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    previousNames: [{ type: String, trim: true }],
    country: { type: String, trim: true, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
schema.index({ kind: 1, name: 1 }, { unique: true });
export default mongoose.model("CatalogEntry", schema);
