import mongoose from 'mongoose';

const InstagramPostSlideSchema = new mongoose.Schema(
    {
        slide: {
            type: Number,
            required: true,
        },
        visual: {
            type: String,
            default: '',
        },
        headline: {
            type: String,
            default: '',
        },
        body_text: {
            type: String,
            default: '',
        },
        design_direction: {
            type: String,
            default: '',
        },
    },
    { _id: false }
);

const InstagramPostIdeaItemSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            default: '',
        },
        title: {
            type: String,
            default: '',
        },
        post_type: {
            type: String,
            default: 'carousel',
        },
        angle: {
            type: String,
            default: '',
        },
        objective: {
            type: String,
            default: '',
        },
        hook: {
            type: String,
            default: '',
        },
        slides: {
            type: [InstagramPostSlideSchema],
            default: [],
        },
        creative_prompt: {
            type: String,
            default: '',
        },
        caption: {
            type: String,
            default: '',
        },
        cta: {
            type: String,
            default: '',
        },
        hashtags: {
            type: [String],
            default: [],
        },
        production_notes: {
            type: [String],
            default: [],
        },
    },
    { _id: false }
);

const InstagramPostIdeaRunSchema = new mongoose.Schema(
    {
        runId: {
            type: String,
            required: true,
            index: true,
        },

        campaign_title: {
            type: String,
            required: true,
            trim: true,
        },

        platform: {
            type: String,
            default: 'instagram_post',
        },

        format: {
            type: String,
            default: 'feed_post',
        },

        strategy_summary: {
            type: String,
            default: '',
        },

        brand_name: {
            type: String,
            default: 'Arka Smart Analyzer',
        },

        product_or_service: {
            type: String,
            default: '',
        },

        app_website_url: {
            type: String,
            default: 'http://web.arkaanalyzer.com/',
        },

        shopify_app_store_url: {
            type: String,
            default: 'https://apps.shopify.com/arka-smart-analyzer',
        },

        target_audience: {
            type: String,
            required: true,
            trim: true,
        },

        campaign_goal: {
            type: String,
            required: true,
            trim: true,
        },

        campaign_name: {
            type: String,
            default: '',
        },

        brand_voice: {
            type: String,
            default: '',
        },

        offer: {
            type: String,
            default: '',
        },

        key_message: {
            type: String,
            default: '',
        },

        visual_style: {
            type: String,
            default: '',
        },

        language: {
            type: String,
            default: 'English',
        },

        number_of_ideas: {
            type: Number,
            default: 5,
        },

        post_format: {
            type: String,
            default: 'carousel',
        },

        notes: {
            type: String,
            default: '',
        },

        ideas: {
            type: [InstagramPostIdeaItemSchema],
            default: [],
        },

        markdown: {
            type: String,
            default: '',
        },

        raw: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

InstagramPostIdeaRunSchema.index({ createdAt: -1 });

const InstagramPostIdeaRun =
    mongoose.models.InstagramPostIdeaRun ||
    mongoose.model('InstagramPostIdeaRun', InstagramPostIdeaRunSchema);

export default InstagramPostIdeaRun;