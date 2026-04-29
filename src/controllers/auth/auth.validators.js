import { body } from 'express-validator';

export const registerValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('username must be between 3 and 50 chars'),

  body('password')
    .notEmpty()
    .withMessage('password is required')
    .isLength({ min: 6 })
    .withMessage('password must be at least 6 chars'),
];

export const loginValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('username is required'),

  body('password')
    .notEmpty()
    .withMessage('password is required'),
];

export const refreshValidator = [
  body('refreshToken')
    .notEmpty()
    .withMessage('refreshToken is required'),
];