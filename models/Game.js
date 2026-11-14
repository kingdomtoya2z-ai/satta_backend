import mongoose from "mongoose";

const gameSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  shortName: { type: String },
  time: { type: String, required: true },
  timeOrder: { type: Number, required: true },
  showInChart: { type: Boolean, default: false },
  section: { type: String, default: "REST" },
}, { timestamps: true });

export default mongoose.model("Game", gameSchema);
