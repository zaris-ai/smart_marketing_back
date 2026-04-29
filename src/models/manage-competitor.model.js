import mongoose from 'mongoose';

const manageCompetitorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },
    links: {
      type: [String],
      required: true,
      default: [],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'links must contain at least one URL',
      },
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'manage_competitors',
  }
);

manageCompetitorSchema.index({ createdAt: -1 });
manageCompetitorSchema.index({ name: 1 }, { unique: true });

const ManageCompetitor =
  mongoose.models.ManageCompetitor ||
  mongoose.model('ManageCompetitor', manageCompetitorSchema);

export default ManageCompetitor;