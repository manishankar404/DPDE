import { Router } from "express";
import {
  getFilesByPatientId,
  registerFile,
  revokeWrappedKeys,
  wrapKeyForProvider
} from "../controllers/fileController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.post("/register", authenticate, registerFile);
router.post("/wrap-key", authenticate, wrapKeyForProvider);
router.post("/revoke-key", authenticate, revokeWrappedKeys);
router.get("/:patientId", authenticate, getFilesByPatientId);

export default router;
