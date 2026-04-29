import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 50,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    refreshToken: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to hash password before saving the user
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return; // Skip if password isn't modified

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;  // Let the error propagate if there's an issue hashing the password
  }
});

// Method to compare password during login
userSchema.methods.comparePassword = async function (plainPassword) {
  const result = await bcrypt.compare(plainPassword, this.password);
  return result;
};

export default mongoose.model('User', userSchema);