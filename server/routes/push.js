import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth.js";
import { getDb } from "../db/client.js";
import { parse } from "../http.js";
import { markDelivered, pushPublicKey, removePushSubscription, savePushSubscription } from "../services/notify.js";

const router = Router();

const subscriptionSchema = z.object({
  endpoint: z.string().url("Invalid push endpoint.").max(1000).refine((value) => value.startsWith("https://"), "Invalid push endpoint."),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

router.get("/push/key", (req, res) => {
  res.json({ publicKey: pushPublicKey() });
});

router.post("/push/subscribe", requireRole(), async (req, res) => {
  const subscription = parse(subscriptionSchema, req.body);
  await savePushSubscription(getDb(), req.user.id, subscription, req.get("user-agent"));
  res.json({ ok: true });
});

router.post("/push/unsubscribe", requireRole(), async (req, res) => {
  const { endpoint } = parse(z.object({ endpoint: z.string().max(1000) }), req.body);
  await removePushSubscription(getDb(), req.user.id, endpoint);
  res.json({ ok: true });
});

// Sent by the service worker the moment a push notification reaches the phone.
router.post("/notifications/ack", requireRole("parent"), async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).min(1).max(50) }), req.body);
  await markDelivered(getDb(), req.user.id, ids, "push");
  res.json({ ok: true });
});

export default router;
