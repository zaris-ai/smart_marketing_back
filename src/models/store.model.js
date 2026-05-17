import mongoose from 'mongoose';

function normalizeDomain(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

const discoveredEmailSchema = new mongoose.Schema(
  {
    value: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    sourceUrl: {
      type: String,
      trim: true,
      default: '',
    },
    kind: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

const discoveredPhoneSchema = new mongoose.Schema(
  {
    value: {
      type: String,
      trim: true,
      default: '',
    },
    sourceUrl: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

const discoveredSocialProfileSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: [
        'instagram',
        'telegram',
        'linkedin',
        'facebook',
        'twitter',
        'youtube',
        'tiktok',
        'pinterest',
        'whatsapp',
        'other',
      ],
      default: 'other',
    },
    url: {
      type: String,
      trim: true,
      default: '',
    },
    sourceUrl: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

const discoveredContactFormSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      default: '',
    },
    action: {
      type: String,
      trim: true,
      default: '',
    },
    method: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'GET',
    },
  },
  { _id: false }
);

const discoveredPageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: Number,
      default: null,
    },
    ok: {
      type: Boolean,
      default: false,
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

const crawlErrorSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      default: '',
    },
    message: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

const discoverySummarySchema = new mongoose.Schema(
  {
    emailCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    phoneCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    socialProfileCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    contactFormCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    pagesVisited: {
      type: Number,
      default: 0,
      min: 0,
    },
    errorCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const contactDiscoverySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'running', 'success', 'partial', 'failed'],
      default: 'pending',
    },

    inputDomain: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },

    requestedUrl: {
      type: String,
      trim: true,
      default: '',
    },

    startedAt: {
      type: Date,
      default: null,
    },

    finishedAt: {
      type: Date,
      default: null,
    },

    maxPages: {
      type: Number,
      default: 30,
      min: 1,
      max: 100,
    },

    pageCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    primaryEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },

    emails: {
      type: [discoveredEmailSchema],
      default: [],
    },

    phones: {
      type: [discoveredPhoneSchema],
      default: [],
    },

    socialProfiles: {
      type: [discoveredSocialProfileSchema],
      default: [],
    },

    contactForms: {
      type: [discoveredContactFormSchema],
      default: [],
    },

    pages: {
      type: [discoveredPageSchema],
      default: [],
    },

    // Do not call this field "errors".
    // "errors" is a reserved Mongoose pathname.
    crawlErrors: {
      type: [crawlErrorSchema],
      default: [],
    },

    summary: {
      type: discoverySummarySchema,
      default: () => ({}),
    },
  },
  {
    _id: false,
    strict: false,
  }
);

const metadataSchema = new mongoose.Schema(
  {
    contactDiscovery: {
      type: contactDiscoverySchema,
      default: undefined,
    },
  },
  {
    _id: false,
    strict: false,
  }
);

const storeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    domain: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    platform: {
      type: String,
      enum: ['shopify'],
      default: 'shopify',
      immutable: true,
    },

    country: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },

    contactName: {
      type: String,
      trim: true,
      default: '',
    },

    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      default: '',
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isChecked: {
      type: Boolean,
      default: false,
      index: true,
    },

    checkedAt: {
      type: Date,
      default: null,
      index: true,
    },

    metadata: {
      type: metadataSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

storeSchema.pre('validate', function () {
  if (this.domain) {
    this.domain = normalizeDomain(this.domain);
  }

  this.platform = 'shopify';

  if (this.contactEmail) {
    this.contactEmail = normalizeEmail(this.contactEmail);
  }

  const discovery = this.metadata?.contactDiscovery;

  if (!this.contactEmail && discovery?.primaryEmail) {
    this.contactEmail = normalizeEmail(discovery.primaryEmail);
  }

  if (discovery?.inputDomain) {
    discovery.inputDomain = normalizeDomain(discovery.inputDomain);
  }

  // Backward compatibility:
  // If an old controller/service still sends contactDiscovery.errors,
  // move it to crawlErrors before save.
  if (discovery?.errors && !discovery?.crawlErrors) {
    discovery.crawlErrors = discovery.errors;
    delete discovery.errors;
  }
  
  // Backward compatibility:
  // If old service still sends summary.errors,
  // move it to summary.errorCount.
  if (
    discovery?.summary &&
    discovery.summary.errors !== undefined &&
    discovery.summary.errorCount === undefined
  ) {
    discovery.summary.errorCount = discovery.summary.errors;
    delete discovery.summary.errors;
  }

  if (this.isModified('isChecked')) {
    this.checkedAt = this.isChecked ? new Date() : null;
  }
});

storeSchema.index({ createdAt: -1 });
storeSchema.index({ updatedAt: -1 });
storeSchema.index({ checkedAt: -1 });
storeSchema.index({ isChecked: 1, createdAt: -1 });
storeSchema.index({ isActive: 1, createdAt: -1 });
storeSchema.index({ country: 1, createdAt: -1 });

storeSchema.index({
  name: 'text',
  domain: 'text',
  contactName: 'text',
  contactEmail: 'text',
  notes: 'text',
});

storeSchema.index(
  { 'metadata.contactDiscovery.status': 1, createdAt: -1 },
  { sparse: true }
);

storeSchema.index(
  { 'metadata.contactDiscovery.primaryEmail': 1 },
  { sparse: true }
);

storeSchema.index(
  { 'metadata.contactDiscovery.finishedAt': -1 },
  { sparse: true }
);

storeSchema.index(
  { 'metadata.contactDiscovery.socialProfiles.platform': 1 },
  { sparse: true }
);

const Store = mongoose.models.Store || mongoose.model('Store', storeSchema);

export { normalizeDomain };
export default Store;