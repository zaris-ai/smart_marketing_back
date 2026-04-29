import mongoose from 'mongoose';

const competitorAnalysisSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: 'Arka Smart Analyzer Competitive Analysis',
      trim: true,
    },
    appName: {
      type: String,
      default: 'Arka: Smart Analyzer',
      trim: true,
    },
    appUrl: {
      type: String,
      default: 'https://apps.shopify.com/arka-smart-analyzer',
      trim: true,
    },
    crewName: {
      type: String,
      default: 'competitor_analysis',
      trim: true,
    },
    html: {
      type: String,
      required: true,
    },
    rawResult: {
      type: Object,
      default: null,
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
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
    versionKey: false,
    collection: 'competitor_analyses',
  }
);

competitorAnalysisSchema.index({ createdAt: -1 });
competitorAnalysisSchema.index({ generatedAt: -1 });

const CompetitorAnalysis =
  mongoose.models.CompetitorAnalysis ||
  mongoose.model('CompetitorAnalysis', competitorAnalysisSchema);

export default CompetitorAnalysis;