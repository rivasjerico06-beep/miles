// CampusPulse API (Node.js + Express). On Vercel it runs as one function: api/index.js.
import express from "express";
import { sql } from "drizzle-orm";
import { sameOriginOnly } from "./auth.js";
import { jsonBody } from "./body.js";
import { getDb } from "./db/client.js";
import { HttpError } from "./http.js";
import authRoutes from "./routes/auth.js";
import deviceRoutes from "./routes/device.js";
import parentRoutes from "./routes/parent.js";
import pushRoutes from "./routes/push.js";
import studentRoutes from "./routes/student.js";
import teacherRoutes from "./routes/teacher.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(jsonBody);
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", sameOriginOnly);

  app.get("/api/health", async (req, res) => {
    let database = "ok";
    try {
      await getDb().execute(sql`select 1`);
    } catch {
      database = "unavailable";
    }
    res.status(database === "ok" ? 200 : 503).json({ ok: database === "ok", database, time: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/student", studentRoutes);
  app.use("/api/parent", parentRoutes);
  app.use("/api/teacher", teacherRoutes);
  app.use("/api", pushRoutes);
  app.use("/api", deviceRoutes);

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "The request body is not valid JSON." });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message, ...(error.extra || {}) });
    if (error?.status === 503) return res.status(503).json({ error: error.message });
    console.error("[api]", error);
    res.status(500).json({ error: "Something went wrong on the server. Please try again." });
  });

  return app;
}

export default createApp();
