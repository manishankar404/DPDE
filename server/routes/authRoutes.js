import { Router } from "express";
import { requestNonce, verifySignature } from "../controllers/authController.js";

const router = Router();

router.post("/request-nonce", requestNonce);
router.post("/verify", verifySignature);
// Backward/forward-compatible aliases (avoid breaking old frontends).
router.post("/verifySignature", verifySignature);
router.post("/verify-signature", verifySignature);
router.get("/verify", (_req, res) => {
  return res.status(200).json({ message: "Auth verify endpoint is POST /api/auth/verify" });
});

export default router;
