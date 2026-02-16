import { Router } from "express";
import { getFilesByPatientId, registerFile } from "../controllers/fileController.js";

const router = Router();

router.post("/register", registerFile);
router.get("/:patientId", getFilesByPatientId);

export default router;
