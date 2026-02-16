import { Router } from "express";
import { getPatientById, registerPatient } from "../controllers/patientController.js";

const router = Router();

router.post("/register", registerPatient);
router.get("/:patientId", getPatientById);

export default router;
