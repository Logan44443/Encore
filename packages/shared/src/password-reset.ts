import { z } from "zod";

/** Length of the one-time code emailed to the user. */
export const RESET_CODE_LENGTH = 6;

export const passwordResetRequestSchema = z.object({
  email: z.email().max(254),
});

export const passwordResetConfirmSchema = z.object({
  email: z.email().max(254),
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${RESET_CODE_LENGTH}}$`), `Enter the ${RESET_CODE_LENGTH}-digit code from the email`),
  /** Same rule as sign-up. */
  password: z.string().min(8).max(200),
});

export type PasswordResetRequestInput = z.input<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.input<typeof passwordResetConfirmSchema>;
