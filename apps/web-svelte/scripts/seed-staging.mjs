process.env.SEED_TARGET = process.env.SEED_TARGET ?? "staging";
await import("./seed-personas.mjs");
