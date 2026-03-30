import { Router } from "express";
import {
  getMyNotificationSettings,
  getMyPatientProfile,
  getPatientById,
  registerPatient,
  updateMyNotificationSettings,
  updateMyPatientProfile
} from "../controllers/patientController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRole } from "../middleware/authorizeRole.js";

const router = Router();

router.post("/register", registerPatient);
router.get("/me", authenticate, authorizeRole("patient"), getMyPatientProfile);
router.put("/me", authenticate, authorizeRole("patient"), updateMyPatientProfile);
router.get("/me/notifications", authenticate, authorizeRole("patient"), getMyNotificationSettings);
router.put("/me/notifications", authenticate, authorizeRole("patient"), updateMyNotificationSettings);
router.get("/:patientId", getPatientById);

export default router;
