import mongoose from 'mongoose';

const { Schema } = mongoose;

const crewRunSchema = new Schema(
  {
    crewName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    title: {
      type: String,
      default: '',
      trim: true,
    },

    status: {
      type: String,
      enum: ['queued', 'running', 'success', 'failed', 'cancelled', 'canceled'],
      default: 'queued',
      index: true,
    },

    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },

    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },

    result: {
      type: Schema.Types.Mixed,
      default: null,
    },

    error: {
      message: {
        type: String,
        default: '',
      },
      stack: {
        type: String,
        default: '',
      },
    },

    savedRecord: {
      model: {
        type: String,
        default: null,
      },
      id: {
        type: String,
        default: null,
        index: true,
      },
    },

    jobId: {
      type: String,
      default: null,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    finishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

crewRunSchema.index({ status: 1, createdAt: -1 });
crewRunSchema.index({ crewName: 1, createdAt: -1 });

const CrewRun =
  mongoose.models.CrewRun || mongoose.model('CrewRun', crewRunSchema);

export default CrewRun;