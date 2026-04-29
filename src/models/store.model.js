import mongoose from 'mongoose';

function normalizeDomain(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

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
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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
    this.contactEmail = String(this.contactEmail).trim().toLowerCase();
  }
});

storeSchema.index({ createdAt: -1 });
storeSchema.index({ name: 'text', domain: 'text' });

const Store = mongoose.model('Store', storeSchema);

export default Store;