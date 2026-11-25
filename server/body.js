import express from "express";

// Large enough for a scanner camera picture (base64 JPEG); everything else is a few hundred bytes.
const parseJson = express.json({ limit: "300kb" });

/**
 * JSON request bodies. On Vercel the Node.js runtime may already have read the body and
 * exposes it as a lazy `req.body`; reuse that instead of reading the stream a second time.
 * Locally (plain Node.js) express.json() reads it as usual.
 */
export function jsonBody(req, res, next) {
  if (!Object.getOwnPropertyDescriptor(req, "body")) return parseJson(req, res, next);
  let value;
  try {
    value = req.body;
  } catch {
    return res.status(400).json({ error: "The request body is not valid JSON." });
  }
  req.body = value && typeof value === "object" && !Buffer.isBuffer(value) ? value : {};
  return next();
}
