import { Router } from "express";
import {
  approveAccess,
  getByProviderWallet,
  getPendingByPatientId,
  rejectAccess,
  requestAccess
} from "../controllers/accessController.js";

const router = Router();

router.post("/request", requestAccess);
router.post("/approve", approveAccess);
router.post("/reject", rejectAccess);
router.get("/pending/:patientId", getPendingByPatientId);
router.get("/provider/:providerWallet", getByProviderWallet);

export default router;
