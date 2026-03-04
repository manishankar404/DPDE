import File from "../models/File.js";

export async function checkFileOwnership(req, res, next) {
  try {
    const fileId = req.params.fileId || req.body.fileId;
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required" });
    }

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    if ((file.patientWallet || "").toLowerCase() !== req.user.walletAddress.toLowerCase()) {
      return res.status(403).json({ error: "Not owner of this file" });
    }

    req.file = file;
    return next();
  } catch (error) {
    return next(error);
  }
}
