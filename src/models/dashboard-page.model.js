import mongoose from 'mongoose';

const dashboardPageSchema = new mongoose.Schema(
  {
    html: {
      type: String,
      required: true,
      trim: true,
    },
    crew: {
      type: String,
      default: 'dashboard',
      index: true,
    },
    sourceFile: {
      type: String,
      default: 'dashboard_file.md',
    },
    executedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    executedByName: {
      type: String,
      default: 'Unknown user',
      trim: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    telegram: {
      published: { type: Boolean, default: false },
      channelId: { type: String, default: '' },
      messageIds: [{ type: Number }],
      publishedAt: { type: Date, default: null },
      reportHtml: { type: String, default: '' },
      error: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

const DashboardPage =
  mongoose.models.DashboardPage ||
  mongoose.model('DashboardPage', dashboardPageSchema);

export default DashboardPage;