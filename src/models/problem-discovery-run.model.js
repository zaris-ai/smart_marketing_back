import mongoose from 'mongoose';

const ProblemDiscoveryItemSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    pain_category: {
      type: String,
      enum: ['conversion', 'aov', 'customer'],
      required: true,
    },
    frequency_score: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    source: {
      type: String,
      required: true,
      trim: true,
    },
    source_question_page: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    can_arka_solve: {
      type: Boolean,
      required: true,
    },
    arka_solution: {
      type: String,
      default: '',
      trim: true,
    },
    feature_gap: {
      type: String,
      default: '',
      trim: true,
    },
    recommended_feature: {
      type: String,
      default: '',
      trim: true,
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
  { _id: false }
);

const ProblemDiscoveryRunSchema = new mongoose.Schema(
  {
    sourceUrls: {
      type: [String],
      default: [],
    },
    appReferenceUrl: {
      type: String,
      default: 'https://apps.shopify.com/arka-smart-analyzer',
    },
    maxResults: {
      type: Number,
      default: 20,
    },
    items: {
      type: [ProblemDiscoveryItemSchema],
      default: [],
    },
    summary: {
      total_candidates: {
        type: Number,
        default: 0,
      },
      accepted_count: {
        type: Number,
        default: 0,
      },
    },
    crewName: {
      type: String,
      default: 'problem_discovery',
    },
    rawResult: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model(
  'ProblemDiscoveryRun',
  ProblemDiscoveryRunSchema
);