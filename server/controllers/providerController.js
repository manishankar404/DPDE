import Provider from "../models/Provider.js";

export async function registerProvider(req, res, next) {
  try {
    const { walletAddress, hospitalName, encryptionPublicKey } = req.body;

    if (!walletAddress || !hospitalName) {
      return res.status(400).json({ message: "walletAddress and hospitalName are required" });
    }

    const exists = await Provider.findOne({ walletAddress });
    if (exists) {
      return res.status(409).json({ message: "Provider already registered" });
    }

    const provider = await Provider.create({
      walletAddress,
      hospitalName,
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
    const provider = await Provider.findOne({ walletAddress });

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

    const provider = await Provider.findOneAndUpdate(
      { walletAddress },
      { encryptionPublicKey },
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
