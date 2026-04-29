import { body } from 'express-validator';

export const createAdminValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('username must be between 3 and 50 characters'),

  body('password')
    .notEmpty()
    .withMessage('password is required')
    .isLength({ min: 6 })
    .withMessage('password must be at least 6 characters'),
];

export const updateAdminValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('username must be between 3 and 50 characters'),

  body('password')
    .optional({ values: 'falsy' })
    .isLength({ min: 6 })
    .withMessage('password must be at least 6 characters'),
];