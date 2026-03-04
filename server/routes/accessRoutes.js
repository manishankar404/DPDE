import { Router } from "express";
import {
  approveAccess,
  getByProviderWallet,
  getPendingByPatientId,
  rejectAccess,
  requestAccess
} from "../controllers/accessController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRole } from "../middleware/authorizeRole.js";

const router = Router();

router.post("/request", authenticate, authorizeRole("provider"), requestAccess);
router.post("/approve", authenticate, authorizeRole("patient"), approveAccess);
router.post("/reject", authenticate, authorizeRole("patient"), rejectAccess);
router.get("/pending/:patientId", authenticate, authorizeRole("patient"), getPendingByPatientId);
router.get("/provider/:providerWallet", authenticate, authorizeRole("provider"), getByProviderWallet);

export default router;
