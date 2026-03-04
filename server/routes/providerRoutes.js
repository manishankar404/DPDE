import { Router } from "express";
import {
  getProviderByWallet,
  registerProvider,
  updateProviderEncryptionKey
} from "../controllers/providerController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRole } from "../middleware/authorizeRole.js";

const router = Router();

router.post("/register", registerProvider);
router.put(
  "/:walletAddress/encryption-key",
  authenticate,
  authorizeRole("provider"),
  updateProviderEncryptionKey
);
router.get("/:walletAddress", getProviderByWallet);

export default router;
