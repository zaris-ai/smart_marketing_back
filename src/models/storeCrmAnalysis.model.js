import mongoose from 'mongoose';

const ANALYSIS_STATUS = ['success', 'failed'];

const telegramSchema = new mongoose.Schema(
    {
        published: {
            type: Boolean,
            default: false,
        },

        channelId: {
            type: String,
            trim: true,
            default: '',
        },

        messageIds: {
            type: [Number],
            default: [],
        },

        publishedAt: {
            type: Date,
            default: null,
        },

        reportHtml: {
            type: String,
            default: '',
        },

        error: {
            type: String,
            trim: true,
            default: '',
        },
    },
    {
        _id: false,
    }
);

const storeCrmAnalysisSchema = new mongoose.Schema(
    {
        store: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Store',
            required: true,
            index: true,
        },

        storeName: {
            type: String,
            trim: true,
            default: '',
        },

        storeDomain: {
            type: String,
            trim: true,
            lowercase: true,
            default: '',
            index: true,
        },

        title: {
            type: String,
            trim: true,
            default: 'Store CRM Analysis',
        },

        crewName: {
            type: String,
            trim: true,
            default: 'store_crm_analysis',
            index: true,
        },

        analysis: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        html: {
            type: String,
            default: '',
        },

        rawResult: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        status: {
            type: String,
            enum: ANALYSIS_STATUS,
            default: 'success',
            index: true,
        },

        error: {
            type: String,
            trim: true,
            default: '',
        },

        generatedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },

        telegram: {
            type: telegramSchema,
            default: () => ({}),
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

storeCrmAnalysisSchema.pre('validate', function () {
    if (this.storeDomain) {
        this.storeDomain = String(this.storeDomain).trim().toLowerCase();
    }

    if (!ANALYSIS_STATUS.includes(this.status)) {
        this.status = 'failed';
    }

    if (!this.crewName) {
        this.crewName = 'store_crm_analysis';
    }

    if (!this.title) {
        this.title = 'Store CRM Analysis';
    }
});

storeCrmAnalysisSchema.index({ store: 1, createdAt: -1 });
storeCrmAnalysisSchema.index({ store: 1, status: 1, createdAt: -1 });
storeCrmAnalysisSchema.index({ status: 1, createdAt: -1 });
storeCrmAnalysisSchema.index({ crewName: 1, createdAt: -1 });
storeCrmAnalysisSchema.index({
    title: 'text',
    storeName: 'text',
    storeDomain: 'text',
});

const StoreCrmAnalysis =
    mongoose.models.StoreCrmAnalysis ||
    mongoose.model('StoreCrmAnalysis', storeCrmAnalysisSchema);

export default StoreCrmAnalysis;