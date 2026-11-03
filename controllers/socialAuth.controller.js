import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomBytes, createHash } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import User from "../models/user.model.js";
import ApiError from "../utils/ApiError.js";
import catchAsync from "../utils/catchAsync.js";
import { validate } from "../utils/content.js";
import { createAuthTokens } from "../utils/authTokens.js";
import { legacyUser } from "../utils/legacySerializers.js";
import { sendLegacy } from "../utils/legacyApi.js";

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);
const Challenge = mongoose.model(
  "SocialChallenge",
  new mongoose.Schema({
    nonceHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, expires: 0 },
  }),
);
export const socialChallenge = catchAsync(async (req, res) => {
  const nonce = randomBytes(32).toString("hex");
  await Challenge.create({
    nonceHash: createHash("sha256").update(nonce).digest("hex"),
    expiresAt: new Date(Date.now() + 300000),
  });
  sendLegacy(res, { nonce });
});
export const appleCallback = catchAsync(async (req, res) => {
  const state = validate(z.string().regex(/^[a-f0-9]{64}$/), req.body.state);
  const nonceHash = createHash("sha256").update(state).digest("hex");
  if (!(await Challenge.exists({ nonceHash, expiresAt: { $gt: new Date() } })))
    throw new ApiError(400, "Expired login challenge");
  const packageName =
    process.env.APPLE_ANDROID_PACKAGE || "com.example.n_krepted_flutter";
  if (!/^[a-zA-Z][a-zA-Z0-9_.]+$/.test(packageName))
    throw new ApiError(503, "Apple login is not configured");
  const params = new URLSearchParams();
  for (const key of ["code", "id_token", "state", "user", "error"]) {
    if (typeof req.body[key] === "string") params.set(key, req.body[key]);
  }
  res
    .set("Cache-Control", "no-store")
    .redirect(
      302,
      `intent://callback?${params}#Intent;package=${packageName};scheme=signinwithapple;end`,
    );
});
export const socialLogin = catchAsync(async (req, res) => {
  const data = validate(
    z.object({
      provider: z.enum(["google", "apple"]),
      idToken: z.string().min(20).max(12000),
      nonce: z.string().optional(),
      name: z.string().trim().max(100).optional(),
    }),
    req.body,
  );
  const audiences = (
    data.provider === "google"
      ? process.env.GOOGLE_CLIENT_IDS
      : process.env.APPLE_CLIENT_IDS
  )
    ?.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!audiences?.length)
    throw new ApiError(503, "Diese Anmeldung ist noch nicht konfiguriert.");
  let identity;
  try {
    ({ payload: identity } = await jwtVerify(
      data.idToken,
      data.provider === "google" ? googleKeys : appleKeys,
      {
        issuer:
          data.provider === "google"
            ? ["https://accounts.google.com", "accounts.google.com"]
            : "https://appleid.apple.com",
        audience: audiences,
        algorithms: ["RS256"],
      },
    ));
  } catch {
    throw new ApiError(401, "Invalid identity token");
  }
  if (!identity.sub) throw new ApiError(401, "Missing identity");
  if (data.provider === "apple") {
    const nonceHash = createHash("sha256")
      .update(data.nonce || "")
      .digest("hex");
    if (
      identity.nonce !== nonceHash ||
      !(await Challenge.findOneAndDelete({
        nonceHash,
        expiresAt: { $gt: new Date() },
      }))
    )
      throw new ApiError(401, "Invalid or expired login challenge");
  }
  const subjectKey =
    data.provider === "google" ? "googleSubject" : "appleSubject";
  let user = await User.findOne({ [subjectKey]: identity.sub });
  if (req.user) {
    if (user && String(req.user._id) !== String(user._id)) {
      throw new ApiError(409, "This provider is linked to a different account");
    }
    const account = await User.findById(req.user._id).select(`+${subjectKey}`);
    if (!account || ["blocked", "deleted"].includes(account.status)) {
      throw new ApiError(403, "This account is not active");
    }
    if (account[subjectKey] && account[subjectKey] !== identity.sub) {
      throw new ApiError(
        409,
        "A different identity is already linked to this provider",
      );
    }
    account[subjectKey] = identity.sub;
    user = await account.save();
  } else if (!user) {
    if (!identity.email || ![true, "true"].includes(identity.email_verified))
      throw new ApiError(401, "A verified email is required");
    const email = String(identity.email).toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) {
      throw new ApiError(
        409,
        "Bitte zuerst mit E-Mail anmelden und das Konto im Profil verknüpfen.",
      );
    } else {
      user = await User.create({
        name: data.name || identity.name || email.split("@")[0],
        email,
        [subjectKey]: identity.sub,
        role: "customer",
        emailVerified: true,
        emailVerifiedAt: new Date(),
      });
    }
  }
  if (["blocked", "deleted"].includes(user.status))
    throw new ApiError(403, "This account is not active");
  if (req.user && String(req.user._id) !== String(user._id))
    throw new ApiError(409, "This provider is linked to a different account");
  const tokens = await createAuthTokens(user);
  sendLegacy(res, {
    data: legacyUser(user),
    token: tokens.token,
    refreshToken: tokens.refreshToken,
  });
});
