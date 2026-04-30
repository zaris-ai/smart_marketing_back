import mongoose from 'mongoose';

const gmailEmailSchema = new mongoose.Schema(
  {
    gmailId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    threadId: {
      type: String,
      default: '',
      index: true,
    },

    labelIds: {
      type: [String],
      default: [],
    },

    localTags: {
      type: [String],
      default: [],
      index: true,
    },

    status: {
      type: String,
      enum: ['read', 'unread'],
      default: 'unread',
      index: true,
    },

    answerStatus: {
      type: String,
      enum: ['answered', 'not_answered'],
      default: 'not_answered',
      index: true,
    },

    snippet: {
      type: String,
      default: '',
    },

    historyId: {
      type: String,
      default: '',
    },

    internalDate: {
      type: String,
      default: '',
    },

    from: {
      type: String,
      default: '',
    },

    to: {
      type: String,
      default: '',
    },

    cc: {
      type: String,
      default: '',
    },

    bcc: {
      type: String,
      default: '',
    },

    subject: {
      type: String,
      default: '',
    },

    date: {
      type: String,
      default: '',
    },

    textPlain: {
      type: String,
      default: '',
    },

    textHtml: {
      type: String,
      default: '',
    },

    headers: {
      type: [
        {
          name: String,
          value: String,
        },
      ],
      default: [],
    },

    threadMessages: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    latestAnalysis: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    analysisHistory: {
      type: [
        {
          analyzedAt: {
            type: Date,
            default: Date.now,
          },
          crewName: {
            type: String,
            default: '',
          },
          payload: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
          },
          result: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
          },
        },
      ],
      default: [],
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('GmailEmail', gmailEmailSchema);