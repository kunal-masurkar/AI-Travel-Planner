import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Express 4 does not catch rejected promises; forward them to the error middleware. */
export function handle(fn: (request: Request, response: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (request, response, next) => {
    fn(request, response, next).catch(next);
  };
}
