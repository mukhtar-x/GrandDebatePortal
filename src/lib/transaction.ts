import mongoose, { type ClientSession } from "mongoose";
import connectDB from "@/lib/db";

export async function withTransaction<T>(
    operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
    await connectDB();
    const session = await mongoose.startSession();

    try {
        let result: T;
        await session.withTransaction(async () => {
            result = await operation(session);
            return result;
        });
        return result!;
    } finally {
        await session.endSession();
    }
}
