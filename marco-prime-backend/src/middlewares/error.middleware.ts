import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export const errorHandler = async (err: Error, c: Context) => {
  // Les refus attendus (401, 403, 409, 422…) ne sont pas des incidents :
  // on ne pollue pas les journaux avec leur pile d'appels.
  const expected =
    err instanceof HTTPException && err.status >= 400 && err.status < 500;
  if (process.env.NODE_ENV !== "test" && !expected) {
    console.error("Error:", err);
  }

  // Handle Hono's HTTPException (from bearerAuth, validators, custom errors, etc.)
  if (err instanceof HTTPException) {
    const response = err.getResponse();

    // If the response is plain text, convert it to JSON format
    const contentType = response.headers.get("Content-Type");
    if (contentType?.includes("text/plain")) {
      return c.json({ error: err.message }, err.status);
    }

    return response;
  }

  // Handle unexpected errors
  return c.json({ error: "An unexpected error occurred" }, 500);
};
