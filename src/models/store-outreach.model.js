import mongoose from 'mongoose';

const StoreOutreachSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            default: 'Store Outreach Analysis',
        },
        websiteUrl: {
            type: String,
            required: true,
            trim: true,
        },
        normalizedWebsiteUrl: {
            type: String,
            required: true,
            trim: true,
            unique: true,
            index: true,
        },
        storeName: {
            type: String,
            default: '',
            trim: true,
        },
        managerName: {
            type: String,
            default: '',
            trim: true,
        },
        crewName: {
            type: String,
            required: true,
            default: 'store_outreach',
            trim: true,
        },
        targetAppName: {
            type: String,
            default: 'Arka: Smart Analyzer',
            trim: true,
        },
        targetAppShopifyUrl: {
            type: String,
            default: 'https://apps.shopify.com/arka-smart-analyzer',
            trim: true,
        },
        targetAppWebsiteUrl: {
            type: String,
            default: 'https://web.arkaanalyzer.com/',
            trim: true,
        },
        analysis: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        email: {
            subject: { type: String, default: '' },
            previewLine: { type: String, default: '' },
            body: { type: String, default: '' },
        },
        rawResult: {
            type: mongoose.Schema.Types.Mixed,
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

const StoreOutreach =
    mongoose.models.StoreOutreach ||
    mongoose.model('StoreOutreach', StoreOutreachSchema);

export default StoreOutreach;