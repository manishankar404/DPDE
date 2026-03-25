import { Router } from "express";
import { resolveSingleWallet, resolveWalletBatch } from "../controllers/profileController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRole } from "../middleware/authorizeRole.js";

const router = Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/resolve/:wallet", authenticate, authorizeRole("patient", "provider"), resolveSingleWallet);
router.post("/resolve", authenticate, authorizeRole("patient", "provider"), resolveWalletBatch);

export default router;

