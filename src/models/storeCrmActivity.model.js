import mongoose from 'mongoose';

const ACTIVITY_TYPES = [
  'note',
  'email_sent',
  'email_reply',
  'call',
  'meeting',
  'follow_up',
  'status_change',
];

const OUTCOMES = [
  'none',
  'positive',
  'neutral',
  'negative',
  'no_response',
  'interested',
  'not_interested',
];

const storeCrmActivitySchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ACTIVITY_TYPES,
      default: 'note',
      index: true,
    },

    title: {
      type: String,
      trim: true,
      default: '',
    },

    body: {
      type: String,
      trim: true,
      default: '',
    },

    emailSent: {
      type: Boolean,
      default: false,
      index: true,
    },

    emailTo: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },

    emailSubject: {
      type: String,
      trim: true,
      default: '',
    },

    contactPerson: {
      type: String,
      trim: true,
      default: '',
    },

    outcome: {
      type: String,
      enum: OUTCOMES,
      default: 'none',
      index: true,
    },

    nextFollowUpAt: {
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

storeCrmActivitySchema.pre('validate', function () {
  if (this.type === 'email_sent') {
    this.emailSent = true;
  }

  if (this.emailTo) {
    this.emailTo = String(this.emailTo).trim().toLowerCase();
  }

  if (!ACTIVITY_TYPES.includes(this.type)) {
    this.type = 'note';
  }

  if (!OUTCOMES.includes(this.outcome)) {
    this.outcome = 'none';
  }
});

storeCrmActivitySchema.index({ store: 1, createdAt: -1 });
storeCrmActivitySchema.index({ store: 1, emailSent: 1 });
storeCrmActivitySchema.index({ store: 1, type: 1, createdAt: -1 });
storeCrmActivitySchema.index({ store: 1, nextFollowUpAt: 1 });
storeCrmActivitySchema.index({
  title: 'text',
  body: 'text',
  emailSubject: 'text',
  contactPerson: 'text',
});

const StoreCrmActivity =
  mongoose.models.StoreCrmActivity ||
  mongoose.model('StoreCrmActivity', storeCrmActivitySchema);

export default StoreCrmActivity;