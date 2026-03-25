import Provider from "../models/Provider.js";
import { walletRegex } from "../utils/walletQuery.js";

export async function registerProvider(req, res, next) {
  try {
    const { walletAddress, name, hospitalName, specialization, email, encryptionPublicKey } =
      req.body;

    if (!walletAddress || !name) {
      return res.status(400).json({ message: "walletAddress and name are required" });
    }

    const normalizedWallet = String(walletAddress).toLowerCase();
    const exists = await Provider.findOne({ walletAddress: normalizedWallet });
    if (exists) {
      return res.status(409).json({ message: "Provider already registered" });
    }

    const provider = await Provider.create({
      walletAddress: normalizedWallet,
      name,
      hospitalName: hospitalName ? String(hospitalName).trim() : "",
      specialization: specialization ? String(specialization).trim() : "",
      email: email ? String(email).trim() : "",
      encryptionPublicKey: encryptionPublicKey || ""
    });
    return res.status(201).json(provider);
  } catch (error) {
    return next(error);
  }
}

export async function getProviderByWallet(req, res, next) {
  try {
    const { walletAddress } = req.params;
    const normalized = String(walletAddress).toLowerCase();
    const pattern = walletRegex(normalized);
    const provider = await Provider.findOne({
      $or: [{ walletAddress: normalized }, ...(pattern ? [{ walletAddress: pattern }] : [])]
    });

    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    return res.status(200).json(provider);
  } catch (error) {
    return next(error);
  }
}

export async function updateProviderEncryptionKey(req, res, next) {
  try {
    const { walletAddress } = req.params;
    const { encryptionPublicKey } = req.body;
    if (!encryptionPublicKey) {
      return res.status(400).json({ message: "encryptionPublicKey is required" });
    }

    const normalized = String(walletAddress).toLowerCase();
    const pattern = walletRegex(normalized);
    const provider = await Provider.findOneAndUpdate(
      {
        $or: [{ walletAddress: normalized }, ...(pattern ? [{ walletAddress: pattern }] : [])]
      },
      { encryptionPublicKey, walletAddress: normalized },
      { returnDocument: "after" }
    );

    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    return res.status(200).json(provider);
  } catch (error) {
    return next(error);
  }
}

export async function getMyProviderProfile(req, res, next) {
  try {
    const wallet = String(req.user?.walletAddress || "").toLowerCase();
    if (!wallet) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const pattern = walletRegex(wallet);
    const provider = await Provider.findOne({
      $or: [{ walletAddress: wallet }, ...(pattern ? [{ walletAddress: pattern }] : [])]
    });
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    return res.status(200).json(provider);
  } catch (error) {
    return next(error);
  }
}

export async function updateMyProviderProfile(req, res, next) {
  try {
    const wallet = String(req.user?.walletAddress || "").toLowerCase();
    if (!wallet) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { name, hospitalName, specialization, email } = req.body || {};
    const updates = {};

    if (name !== undefined) {
      const trimmed = String(name || "").trim();
      if (!trimmed) {
        return res.status(400).json({ message: "name is required" });
      }
      updates.name = trimmed;
    }
    if (hospitalName !== undefined) {
      updates.hospitalName = String(hospitalName || "").trim();
    }
    if (specialization !== undefined) {
      updates.specialization = String(specialization || "").trim();
    }
    if (email !== undefined) {
      updates.email = String(email || "").trim();
    }
    updates.walletAddress = wallet;

    const pattern = walletRegex(wallet);
    const provider = await Provider.findOneAndUpdate(
      {
        $or: [{ walletAddress: wallet }, ...(pattern ? [{ walletAddress: pattern }] : [])]
      },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    return res.status(200).json(provider);
  } catch (error) {
    return next(error);
  }
}
