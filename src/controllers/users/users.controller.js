import User from '../../models/user.model.js';
import asyncHandler from '../../utils/asyncHandler.js';

const getAdmins = asyncHandler(async (req, res) => {
  const users = await User.find({})
    .select('_id username createdAt updatedAt')
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    users,
  });
});

const createAdmin = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const normalizedUsername = username?.trim()?.toLowerCase();

  if (!normalizedUsername || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required',
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters',
    });
  }

  const existingUser = await User.findOne({ username: normalizedUsername });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: 'Username already exists',
    });
  }

  const user = await User.create({
    username: normalizedUsername,
    password,
  });

  return res.status(201).json({
    success: true,
    message: 'Admin created successfully',
    user: {
      _id: user._id,
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

const updateAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { username, password } = req.body;

  const user = await User.findById(id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Admin not found',
    });
  }

  const normalizedUsername = username?.trim()?.toLowerCase();

  if (!normalizedUsername) {
    return res.status(400).json({
      success: false,
      message: 'Username is required',
    });
  }

  const existingUser = await User.findOne({
    username: normalizedUsername,
    _id: { $ne: id },
  });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: 'Username already exists',
    });
  }

  user.username = normalizedUsername;

  if (password !== undefined && password !== null && password !== '') {
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    user.password = password;
  }

  await user.save();

  return res.status(200).json({
    success: true,
    message: 'Admin updated successfully',
    user: {
      _id: user._id,
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

const deleteAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Admin not found',
    });
  }

  await User.findByIdAndDelete(id);

  return res.status(200).json({
    success: true,
    message: 'Admin deleted successfully',
  });
});

export {
  createAdmin, deleteAdmin, updateAdmin, getAdmins
}