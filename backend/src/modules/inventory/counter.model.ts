import { Schema, model } from 'mongoose';

/** Atomic sequence per key, e.g. "unit:PUN-CENTRAL:260929" for daily unit numbering. */
interface Counter {
  key: string;
  seq: number;
}

const counterSchema = new Schema<Counter>({
  key: { type: String, required: true },
  seq: { type: Number, default: 0 },
});
counterSchema.index({ key: 1 }, { unique: true });

export const CounterModel = model<Counter>('Counter', counterSchema);

export async function nextSequence(key: string, count = 1): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate(
    { key },
    { $inc: { seq: count } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  // Returns the first number of the reserved block.
  return counter!.seq - count + 1;
}
