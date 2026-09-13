import { ZodError, type ZodType } from "zod";
import { AppError, badRequest } from "./errors";

export type ApiError = { error: string; message: string };

/** Wraps a Route Handler: JSON response, AppError → status code, ZodError → 400. */
export function handler<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      const data = await fn(req, ctx);
      if (data instanceof Response) return data;
      return Response.json(data ?? { ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        return Response.json({ error: err.code, message: err.message } satisfies ApiError, { status: err.status });
      }
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const message = first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input";
        return Response.json({ error: "BAD_REQUEST", message } satisfies ApiError, { status: 400 });
      }
      console.error("[api]", err);
      return Response.json({ error: "INTERNAL", message: "Something went wrong. Please try again." } satisfies ApiError, {
        status: 500,
      });
    }
  };
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Expected a JSON body");
  }
  return schema.parse(body);
}
