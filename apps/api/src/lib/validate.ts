import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

/** zValidator that returns `{ error, issues }` with a readable first message. */
export function validate<T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      return c.json({ error: `${where}${issue?.message ?? "Invalid request"}`, issues: result.error.issues }, 400);
    }
  });
}
