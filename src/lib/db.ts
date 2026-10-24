import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

interface CachedConnection {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
    committeeSeedPromise: Promise<void> | null;
}

declare global {
    var mongooseCache: CachedConnection | undefined;
}

const cached: CachedConnection =
    global.mongooseCache ??
    (global.mongooseCache = { conn: null, promise: null, committeeSeedPromise: null });

function seedDefaultCommittees(): Promise<void> {
    cached.committeeSeedPromise ??= import("@/lib/seedCommittees")
        .then(({ seedCommittees }) => seedCommittees())
        .catch((error: unknown) => {
            cached.committeeSeedPromise = null;
            throw error;
        });
    return cached.committeeSeedPromise;
}

async function connectDB(options: { skipCommitteeSeed?: boolean } = {}) {
    if (cached.conn) {
        if (!options.skipCommitteeSeed) await seedDefaultCommittees();
        return cached.conn;
    }

    if (!cached.promise) {
        if (!MONGODB_URI) {
            throw new Error("Please define the MONGODB_URI environment variable inside .env.local");
        }

        const opts = {
            bufferCommands: false,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        };

        cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
            return mongooseInstance;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    if (!options.skipCommitteeSeed) await seedDefaultCommittees();

    return cached.conn;
}

export default connectDB;