import mongoose from "mongoose";

const resultSchema = new mongoose.Schema({
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: "Game", required: true },
  gameName: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  result: { type: String, default: "XX" },
  generatedAt: { type: Date, default: null },
}, { timestamps: true });

resultSchema.index({ date: 1, gameId: 1 }, { unique: true });

export default mongoose.model("Result", resultSchema);
