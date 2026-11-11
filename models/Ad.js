import mongoose from "mongoose";

const adSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ["image", "video"], required: true },
  url: { type: String, required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model("Ad", adSchema);
