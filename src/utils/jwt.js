import jwt from 'jsonwebtoken';

export const signAccessToken = (user) => {
  return jwt.sign(
    {
      sub: user._id.toString(),
      username: user.username,
      type: 'access',
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1d',
    }
  );
};

export const signRefreshToken = (user) => {
  return jwt.sign(
    {
      sub: user._id.toString(),
      username: user.username,
      type: 'refresh',
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    }
  );
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};