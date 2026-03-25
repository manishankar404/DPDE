import { resolveWallet, resolveWallets } from "../utils/profileResolver.js";

export async function resolveSingleWallet(req, res, next) {
  try {
    const wallet = String(req.params.wallet || "");
    if (!wallet) {
      return res.status(400).json({ message: "wallet is required" });
    }
    const profile = await resolveWallet(wallet);
    return res.status(200).json(profile);
  } catch (error) {
    return next(error);
  }
}

export async function resolveWalletBatch(req, res, next) {
  try {
    const wallets = req.body?.wallets;
    if (!Array.isArray(wallets)) {
      return res.status(400).json({ message: "wallets must be an array" });
    }
    const profiles = await resolveWallets(wallets);
    return res.status(200).json({ profiles });
  } catch (error) {
    return next(error);
  }
}

