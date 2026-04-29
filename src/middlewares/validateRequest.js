import { validationResult } from 'express-validator';

export default function validateRequest(req, res, next) {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }

  next();
}