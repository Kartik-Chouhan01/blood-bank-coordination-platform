import mongoose, { type ClientSession, type SchemaOptions } from 'mongoose';

/**
 * Default schema options: timestamps, and a JSON shape with `id` instead of `_id`/`__v`.
 * Fields listed in `hidden` are always removed from serialised output.
 */
export function baseSchemaOptions<T>(hidden: string[] = []): SchemaOptions<T> {
  return {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        for (const field of hidden) delete ret[field];
        return ret;
      },
    },
  };
}

/**
 * Runs `work` inside a MongoDB transaction, retrying transient errors (write conflicts, primary
 * elections) as recommended by the driver. Every write inside must pass `{ session }`.
 */
export async function withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
