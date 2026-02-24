import { Router } from "express";
import {
  approveAccess,
  getByProviderWallet,
  getPendingByPatientId,
  rejectAccess,
  requestAccess
} from "../controllers/accessController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/request", authenticate, requestAccess);
router.post("/approve", authenticate, approveAccess);
router.post("/reject", authenticate, rejectAccess);
router.get("/pending/:patientId", authenticate, getPendingByPatientId);
router.get("/provider/:providerWallet", authenticate, getByProviderWallet);

export default router;
