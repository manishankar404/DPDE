import { Router } from "express";
import {
  getProviderByWallet,
  registerProvider,
  updateProviderEncryptionKey
} from "../controllers/providerController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", registerProvider);
router.put("/:walletAddress/encryption-key", authenticate, updateProviderEncryptionKey);
router.get("/:walletAddress", getProviderByWallet);

export default router;
