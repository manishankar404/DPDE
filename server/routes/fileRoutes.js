import { Router } from "express";
import {
  getFilesByPatientId,
  registerFile,
  revokeWrappedKeys,
  wrapKeyForProvider
} from "../controllers/fileController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRole } from "../middleware/authorizeRole.js";

const router = Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.post("/register", authenticate, authorizeRole("patient"), registerFile);
router.post("/wrap-key", authenticate, authorizeRole("patient"), wrapKeyForProvider);
router.post("/revoke-key", authenticate, authorizeRole("patient"), revokeWrappedKeys);
router.get("/:patientId", authenticate, authorizeRole("patient", "provider"), getFilesByPatientId);

export default router;
