import { Router } from "express";
import { getPatientAuditLogs, logPatientFileAction, logProviderFileAction } from "../controllers/auditController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRole } from "../middleware/authorizeRole.js";

const router = Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/patient/:wallet", authenticate, authorizeRole("patient"), getPatientAuditLogs);
router.post("/file-action", authenticate, authorizeRole("provider"), logProviderFileAction);
router.post("/patient/file-action", authenticate, authorizeRole("patient"), logPatientFileAction);

export default router;
