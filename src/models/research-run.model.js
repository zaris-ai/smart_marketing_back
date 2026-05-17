import mongoose from 'mongoose';

const { Schema } = mongoose;

const researchSourceSchema = new Schema(
    {
        title: {
            type: String,
            default: '',
            trim: true,
        },
        url: {
            type: String,
            default: '',
            trim: true,
        },
        note: {
            type: String,
            default: '',
            trim: true,
        },
    },
    { _id: false }
);

const researchRunSchema = new Schema(
    {
        runId: {
            type: Schema.Types.ObjectId,
            ref: 'CrewRun',
            index: true,
            default: null,
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            index: true,
            default: null,
        },

        crewName: {
            type: String,
            default: 'research',
            index: true,
        },

        status: {
            type: String,
            enum: ['queued', 'running', 'success', 'failed'],
            default: 'queued',
            index: true,
        },

        title: {
            type: String,
            default: '',
            trim: true,
        },

        topic: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },

        audience: {
            type: String,
            default: 'marketing manager',
            trim: true,
        },

        market: {
            type: String,
            default: 'global market',
            trim: true,
        },

        business_context: {
            type: String,
            default: '',
            trim: true,
        },

        goal: {
            type: String,
            default: '',
            trim: true,
        },

        product_context: {
            type: String,
            default: '',
            trim: true,
        },

        country: {
            type: String,
            default: 'us',
            trim: true,
        },

        locale: {
            type: String,
            default: 'en',
            trim: true,
        },

        max_sources: {
            type: Number,
            default: 10,
            min: 1,
            max: 50,
        },

        approved: {
            type: Boolean,
            default: false,
        },

        reportTitle: {
            type: String,
            default: '',
            trim: true,
        },

        reportMarkdown: {
            type: String,
            default: '',
        },

        sources: {
            type: [researchSourceSchema],
            default: [],
        },

        reviewerNotes: {
            type: String,
            default: '',
        },

        tasksOutput: {
            type: [String],
            default: [],
        },

        rawContent: {
            type: String,
            default: '',
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
            name: {
                type: String,
                default: '',
            },
        },

        meta: {
            type: Schema.Types.Mixed,
            default: {},
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
    }
);

researchRunSchema.index({ userId: 1, createdAt: -1 });
researchRunSchema.index({ status: 1, createdAt: -1 });
researchRunSchema.index({ topic: 'text', title: 'text', reportTitle: 'text' });

const ResearchRun =
    mongoose.models.ResearchRun ||
    mongoose.model('ResearchRun', researchRunSchema);

export default ResearchRun;