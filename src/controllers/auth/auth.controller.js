import bcrypt from 'bcryptjs';
import User from '../../models/user.model.js';
import { signAccessToken, signRefreshToken } from '../../utils/jwt.js';
import asyncHandler from '../../utils/asyncHandler.js';

const sanitizeUser = (user) => ({
  id: user._id,
  username: user.username,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const register = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const existingUser = await User.findOne({ username: username.toLowerCase() });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: 'Username already exists',
    });
  }

  const user = await User.create({
    username,
    password,
  });

  return res.status(201).json({
    success: true,
    message: 'User created successfully',
    user: sanitizeUser(user),
  });
});

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username: username.toLowerCase() });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid username or password',
    });
  }

  const isValidPassword = await user.comparePassword(password);

  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      message: 'Invalid username or password',
    });
  }
  
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
  user.refreshToken = hashedRefreshToken;
  await user.save();

  return res.status(200).json({
    success: true,
    message: 'Login successful',
    user: sanitizeUser(user),
    tokens: {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1d',
      refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token',
    });
  }

  if (decoded.type !== 'refresh') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token type',
    });
  }

  const user = await User.findById(decoded.sub);

  if (!user || !user.refreshToken) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token not recognized',
    });
  }

  const isRefreshTokenMatch = await bcrypt.compare(refreshToken, user.refreshToken);

  if (!isRefreshTokenMatch) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token mismatch',
    });
  }

  const newAccessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);

  user.refreshToken = await bcrypt.hash(newRefreshToken, 10);
  await user.save();

  return res.status(200).json({
    success: true,
    message: 'Token refreshed successfully',
    tokens: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1d',
      refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.sub);

    if (user) {
      user.refreshToken = null;
      await user.save();
    }
  } catch (error) {
    // intentionally silent to avoid leaking token state
  }

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.sub).select('-password -refreshToken');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  return res.status(200).json({
    success: true,
    user,
  });
});