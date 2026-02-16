import { Router } from "express";
import {
  getProviderByWallet,
  registerProvider
} from "../controllers/providerController.js";

const router = Router();

router.post("/register", registerProvider);
router.get("/:walletAddress", getProviderByWallet);

export default router;
