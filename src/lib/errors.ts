export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string) => new AppError(400, "BAD_REQUEST", message);
export const unauthorized = (message = "Please log in") => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You are not allowed to do that") => new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") => new AppError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new AppError(409, "CONFLICT", message);
export const tooMany = (message: string) => new AppError(429, "TOO_MANY_REQUESTS", message);
