import { Router } from "express";
import {
  getMyPatientProfile,
  getPatientById,
  registerPatient,
  updateMyPatientProfile
} from "../controllers/patientController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRole } from "../middleware/authorizeRole.js";

const router = Router();

router.post("/register", registerPatient);
router.get("/me", authenticate, authorizeRole("patient"), getMyPatientProfile);
router.put("/me", authenticate, authorizeRole("patient"), updateMyPatientProfile);
router.get("/:patientId", getPatientById);

export default router;
