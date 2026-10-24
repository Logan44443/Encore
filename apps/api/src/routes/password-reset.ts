import { passwordResetConfirmSchema, passwordResetRequestSchema } from "@encore/shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { clientIp, RateLimiter, tooMany } from "../lib/rate-limit";
import { supabaseAdmin, supabaseForOneCall } from "../lib/supabase";
import { validate } from "../lib/validate";

const MINUTE = 60_000;

/** Stops the endpoint being used to spam someone's inbox. Supabase Auth adds its own limits on top. */
const requestByIp = new RateLimiter(10, 60 * MINUTE);
const requestByEmail = new RateLimiter(3, 15 * MINUTE);
const confirmByIp = new RateLimiter(30, 15 * MINUTE);
const confirmByEmail = new RateLimiter(10, 15 * MINUTE);

const INVALID = "That code is wrong or has expired. Request a new one.";

/**
 * Supabase Auth sends the code (the "Reset password" email template shows
 * {{ .Token }}) and checks it, including expiry and attempt limits.
 */
export const passwordResetRoutes = new Hono()
  /** Always answers the same way so it can't be used to find out which emails have accounts. */
  .post("/request", validate("json", passwordResetRequestSchema), async (c) => {
    const email = c.req.valid("json").email.toLowerCase();
    const wait = Math.max(requestByIp.hit(clientIp(c)), requestByEmail.hit(email));
    if (wait > 0) tooMany(wait);
    // Not awaited: how long sending takes would otherwise reveal whether the account exists.
    void supabaseForOneCall()
      .auth.resetPasswordForEmail(email)
      .then(({ error }) => {
        if (error) console.error("[password-reset] Supabase couldn't send the code:", error.message);
      });
    return c.json({ ok: true as const });
  })

  /** Sets the new password and signs out every session, as a reset always has. Sign in afterwards. */
  .post("/confirm", validate("json", passwordResetConfirmSchema), async (c) => {
    const { code, password } = c.req.valid("json");
    const email = c.req.valid("json").email.toLowerCase();
    const wait = Math.max(confirmByIp.hit(clientIp(c)), confirmByEmail.hit(email));
    if (wait > 0) tooMany(wait);

    const client = supabaseForOneCall();
    const verified = await client.auth.verifyOtp({ email, token: code, type: "recovery" });
    const session = verified.data.session;
    if (verified.error || !session) throw new HTTPException(400, { message: INVALID });

    const updated = await client.auth.updateUser({ password });
    if (updated.error) {
      if (updated.error.code === "weak_password" || updated.error.code === "same_password") {
        throw new HTTPException(400, { message: updated.error.message });
      }
      throw updated.error;
    }
    await supabaseAdmin.auth.admin.signOut(session.access_token, "global");
    confirmByEmail.reset(email);
    return c.json({ ok: true as const });
  });
