/**
 * Request Validation Middleware
 *
 * Validates request bodies using Zod schemas and returns detailed error messages.
 */
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
/**
 * Create validation middleware for a Zod schema
 */
export declare function validateRequest(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => any;
/**
 * Validate query parameters
 */
export declare function validateQuery(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => any;
/**
 * Validate path parameters
 */
export declare function validateParams(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => any;
