import User from "../models/user.model.js";
import { verifyAccessToken } from "../utils/jwt.js";

export default async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token is missing",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    if (decoded.type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type",
      });
    }

    const userId = decoded.id || decoded.userId || decoded._id || decoded.sub;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    const user = await User.findById(userId).select(
      "_id name fullName firstName lastName username email role"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    req.user = {
      _id: user._id,
      id: user._id.toString(),
      name:
        user.name ||
        user.fullName ||
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.username ||
        user.email,
      fullName: user.fullName,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      role: user.role,
      token: decoded,
    };

    next();
  } catch (error) {
    console.log(error)
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }
}