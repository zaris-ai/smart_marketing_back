import mongoose from 'mongoose';

const ShopifyTrendsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    targetAppName: {
      type: String,
      default: 'Arka: Smart Analyzer',
      trim: true,
    },
    targetAppUrl: {
      type: String,
      default: 'https://apps.shopify.com/arka-smart-analyzer',
      trim: true,
    },
    crewName: {
      type: String,
      required: true,
      default: 'shopify_trends',
      trim: true,
    },
    html: {
      type: String,
      required: true,
    },
    rawResult: {
      type: mongoose.Schema.Types.Mixed,
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

const ShopifyTrends =
  mongoose.models.ShopifyTrends ||
  mongoose.model('ShopifyTrends', ShopifyTrendsSchema);

export default ShopifyTrends;