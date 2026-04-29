import mongoose from 'mongoose';

const seoAuditSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    websiteUrl: {
      type: String,
      required: true,
      trim: true,
      default: 'https://web.arkaanalyzer.com/',
      index: true,
    },
    crewName: {
      type: String,
      default: 'seo_audit',
      index: true,
    },
    html: {
      type: String,
      default: '',
    },
    rawResult: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
      index: true,
    },
    error: {
      type: String,
      default: null,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    telegram: {
      published: { type: Boolean, default: false },
      channelId: { type: String },
      messageIds: [{ type: Number }],
      publishedAt: { type: Date },
      html: { type: String },
      error: { type: String },
    },
  },
  {
    timestamps: true,
    collection: 'seoaudits',
  }
);

const SeoAudit =
  mongoose.models.SeoAudit || mongoose.model('SeoAudit', seoAuditSchema);

export default SeoAudit;