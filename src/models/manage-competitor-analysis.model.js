import mongoose from 'mongoose';

const selectedCompetitorSchema = new mongoose.Schema(
  {
    competitorId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    links: {
      type: [String],
      default: [],
    },
  },
  {
    _id: false,
  }
);

const manageCompetitorAnalysisSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: 'Manage Competitor Analysis',
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
      default: 'manage_competitor_analysis',
      trim: true,
    },
    analysisGoal: {
      type: String,
      default: '',
      trim: true,
    },
    selectedCompetitorIds: {
      type: [String],
      default: [],
    },
    excludedCompetitorIds: {
      type: [String],
      default: [],
    },
    maxSelectedCompetitors: {
      type: Number,
      default: 0,
    },
    selectedCompetitors: {
      type: [selectedCompetitorSchema],
      default: [],
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
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'manage_competitor_analyses',
  }
);

manageCompetitorAnalysisSchema.index({ createdAt: -1 });
manageCompetitorAnalysisSchema.index({ generatedAt: -1 });

const ManageCompetitorAnalysis =
  mongoose.models.ManageCompetitorAnalysis ||
  mongoose.model('ManageCompetitorAnalysis', manageCompetitorAnalysisSchema);

export default ManageCompetitorAnalysis;