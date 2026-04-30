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
storeSchema.index({ name: 'text', domain: 'text', contactEmail: 'text' });

const Store = mongoose.models.Store || mongoose.model('Store', storeSchema);

export default Store;