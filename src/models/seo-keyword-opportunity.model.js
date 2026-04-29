import mongoose from 'mongoose';

const seoKeywordOpportunitySchema = new mongoose.Schema(
  {
    websiteUrl: {
      type: String,
      required: true,
      trim: true,
    },
    brandName: {
      type: String,
      default: '',
      trim: true,
    },
    tone: {
      type: String,
      default: 'professional and analytical',
      trim: true,
    },
    maxKeywords: {
      type: Number,
      default: 12,
    },
    crewName: {
      type: String,
      default: 'seo_keyword_opportunity',
    },
    resultContent: {
      type: String,
      required: true,
    },
    tasksOutput: {
      type: [String],
      default: [],
    },
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
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
  }
);

seoKeywordOpportunitySchema.index({ websiteUrl: 1, createdAt: -1 });

export default mongoose.model(
  'SeoKeywordOpportunity',
  seoKeywordOpportunitySchema
);