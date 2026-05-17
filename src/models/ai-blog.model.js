import mongoose from 'mongoose';

function normalizeTitle(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, '');
}

const AiBlogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    normalizedTitle: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    slug: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },

    topic: {
      type: String,
      required: true,
      trim: true,
    },

    audience: {
      type: String,
      default: 'Shopify merchants',
      trim: true,
    },

    appName: {
      type: String,
      default: 'Arka: Smart Analyzer',
      trim: true,
    },

    sourceLinks: {
      type: [String],
      default: [],
      validate: {
        validator(value) {
          if (this.decisionSource === 'auto_from_links') {
            return Array.isArray(value) && value.length === 2;
          }

          return Array.isArray(value);
        },
        message: 'sourceLinks must contain exactly 2 links for auto_from_links blogs',
      },
    },

    suggestedKeywords: {
      type: [String],
      default: [],
    },

    metaDescription: {
      type: String,
      default: '',
      trim: true,
    },

    excerpt: {
      type: String,
      default: '',
      trim: true,
    },

    coverImage: {
      url: { type: String, default: '', trim: true },
      sourcePage: { type: String, default: '', trim: true },
      query: { type: String, default: '', trim: true },
      alt: { type: String, default: '', trim: true },
    },

    contentHtml: {
      type: String,
      required: true,
    },

    contentMarkdown: {
      type: String,
      default: '',
    },

    editorData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    decisionSource: {
      type: String,
      enum: ['auto_from_links', 'manual'],
      default: 'auto_from_links',
      index: true,
    },

    crewName: {
      type: String,
      required: true,
      default: 'blog_from_links',
      trim: true,
    },

    rawResult: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },

    publishedAt: {
      type: Date,
      default: null,
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

AiBlogSchema.pre('validate', function () {
  this.normalizedTitle = normalizeTitle(this.title || '');

  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  if (this.status === 'draft') {
    this.publishedAt = null;
  }
});

const AiBlog = mongoose.models.AiBlog || mongoose.model('AiBlog', AiBlogSchema);

export { normalizeTitle };
export default AiBlog;