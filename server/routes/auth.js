import { Router } from "express";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { normalizeSection, normalizeStudentNumber } from "../../src/lib/campus.js";
import {
  endSession,
  hashPassword,
  loadUser,
  publicUser,
  requireRole,
  safeEqual,
  sha256,
  startSession,
  verifyAgainstDummy,
  verifyPassword,
} from "../auth.js";
import { getDb } from "../db/client.js";
import { sessions, students, users } from "../db/schema.js";
import { clientIp, fail, parse, tooManyAttempts } from "../http.js";
import { normalizeLinkCode } from "./student.js";

const router = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const email = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .max(160, "That email address is too long.")
  .refine((value) => EMAIL.test(value), "Enter a valid email address.");
const password = z
  .string({ error: "Enter a password." })
  .min(8, "Use at least 8 characters for your password.")
  .max(200, "That password is too long.");

const registerSchema = z.object({
  role: z.enum(["student", "parent", "teacher"], { error: "Choose whether you are a student, parent, or teacher." }),
  fullName: z.string({ error: "Enter your full name." }).trim().min(2, "Enter your full name.").max(120, "That name is too long."),
  email,
  password,
  studentNumber: z.string().max(40).optional(),
  gradeSection: z.string().max(80).optional(),
  childStudentNumber: z.string().max(40).optional(),
  linkCode: z.string().max(40).optional(),
  teacherCode: z.string().max(60).optional(),
});

const loginSchema = z.object({
  email: z.string({ error: "Enter your email address." }).trim().toLowerCase().max(160),
  password: z.string({ error: "Enter your password." }).min(1, "Enter your password.").max(200),
});

const isUniqueViolation = (error) => error?.code === "23505" || error?.cause?.code === "23505";

router.get("/session", async (req, res) => {
  const user = await loadUser(req);
  res.json({ user: user ? publicUser(user) : null });
});

router.post("/register", async (req, res) => {
  if (tooManyAttempts(`register:${clientIp(req)}`, 20, 60 * 60 * 1000)) {
    fail(429, "Too many sign-up attempts from this network. Please try again later.");
  }
  const input = parse(registerSchema, req.body);
  const db = getDb();

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (taken) fail(409, "An account with this email already exists. Log in instead.");

  let studentNumber = null;
  let gradeSection = null;
  let child = null;

  if (input.role === "student") {
    studentNumber = normalizeStudentNumber(input.studentNumber);
    if (!studentNumber) fail(400, "Enter your student number in the format 2026-0001.");
    gradeSection = normalizeSection(input.gradeSection);
    if (!gradeSection) fail(400, "Choose your grade and section.");
    const [duplicate] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.studentNumber, studentNumber))
      .limit(1);
    if (duplicate) fail(409, "That student number is already registered.");
  } else if (input.role === "parent") {
    const childNumber = normalizeStudentNumber(input.childStudentNumber);
    if (!childNumber) fail(400, "Enter your child's student number in the format 2026-0001.");
    const code = normalizeLinkCode(input.linkCode);
    if (!code) fail(400, "Enter the 8-character parent link code from your child's CampusPulse app.");
    [child] = await db.select().from(students).where(eq(students.studentNumber, childNumber)).limit(1);
    if (!child) fail(404, "No student is registered with that number yet. Ask your child to create their account first.");
    if (child.parentUserId) fail(409, "That student is already linked to a parent account.");
    const codeOk =
      child.linkCodeHash && child.linkCodeExpiresAt > new Date() && safeEqual(child.linkCodeHash, sha256(code));
    if (!codeOk) fail(400, "That link code is wrong or has expired. Ask your child to make a new one in their app.");
  } else {
    const expected = process.env.TEACHER_SIGNUP_CODE;
    if (!expected) fail(503, "Teacher sign-up is not set up on the server yet.");
    const given = String(input.teacherCode || "").trim().toUpperCase();
    if (!safeEqual(given, expected.trim().toUpperCase())) fail(403, "The teacher access code is not correct.");
    gradeSection = normalizeSection(input.gradeSection);
    if (!gradeSection) fail(400, "Choose the grade and section you handle.");
  }

  const passwordHash = await hashPassword(input.password);
  let user;
  try {
    [user] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        role: input.role,
        gradeSection: input.role === "teacher" ? gradeSection : null,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) fail(409, "An account with this email already exists. Log in instead.");
    throw error;
  }

  try {
    if (input.role === "student") {
      await db.insert(students).values({ userId: user.id, studentNumber, fullName: input.fullName, gradeSection });
    } else if (input.role === "parent") {
      const [linked] = await db
        .update(students)
        .set({ parentUserId: user.id, parentLinkedAt: new Date(), linkCodeHash: null, linkCodeExpiresAt: null })
        .where(
          and(eq(students.id, child.id), isNull(students.parentUserId), eq(students.linkCodeHash, child.linkCodeHash)),
        )
        .returning({ id: students.id });
      if (!linked) fail(409, "That student was just linked to another parent account.");
    }
  } catch (error) {
    await db.delete(users).where(eq(users.id, user.id));
    if (isUniqueViolation(error)) fail(409, "That student number is already registered.");
    throw error;
  }

  await startSession(res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const input = parse(loginSchema, req.body);
  if (tooManyAttempts(`login:${clientIp(req)}:${input.email}`, 10, 15 * 60 * 1000)) {
    fail(429, "Too many attempts. Wait 15 minutes and try again.");
  }
  const [user] = await getDb().select().from(users).where(eq(users.email, input.email)).limit(1);
  const ok = user ? await verifyPassword(input.password, user.passwordHash) : await verifyAgainstDummy(input.password);
  if (!ok) fail(401, "Wrong email or password.");
  await startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

router.post("/logout", async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

router.post("/password", requireRole(), async (req, res) => {
  const input = parse(z.object({ currentPassword: z.string().max(200), newPassword: password }), req.body);
  const ok = await verifyPassword(input.currentPassword, req.user.passwordHash);
  if (!ok) fail(400, "Your current password is not correct.");
  const db = getDb();
  await db.update(users).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(users.id, req.user.id));
  // Sign out every other device that used the old password.
  await db.delete(sessions).where(and(eq(sessions.userId, req.user.id), ne(sessions.id, req.sessionId)));
  res.json({ ok: true });
});

export default router;
