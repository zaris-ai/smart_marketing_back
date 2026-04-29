import mongoose from 'mongoose';

const InstagramStoryFrameSchema = new mongoose.Schema(
    {
        frame: {
            type: Number,
            required: true,
        },
        visual: {
            type: String,
            default: '',
        },
        on_screen_text: {
            type: String,
            default: '',
        },
        voiceover: {
            type: String,
            default: '',
        },
        motion_direction: {
            type: String,
            default: '',
        },
        duration_seconds: {
            type: Number,
            default: 3,
        },
    },
    { _id: false }
);

const InstagramStoryIdeaItemSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            default: '',
        },
        title: {
            type: String,
            default: '',
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
        story_sequence: {
            type: [InstagramStoryFrameSchema],
            default: [],
        },
        video_prompt: {
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

const InstagramStoryIdeaRunSchema = new mongoose.Schema(
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
            default: 'instagram_story',
        },

        format: {
            type: String,
            default: 'vertical_9_16',
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

        story_length_seconds: {
            type: Number,
            default: 15,
        },

        notes: {
            type: String,
            default: '',
        },

        ideas: {
            type: [InstagramStoryIdeaItemSchema],
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

InstagramStoryIdeaRunSchema.index({ createdAt: -1 });

const InstagramStoryIdeaRun =
    mongoose.models.InstagramStoryIdeaRun ||
    mongoose.model('InstagramStoryIdeaRun', InstagramStoryIdeaRunSchema);

export default InstagramStoryIdeaRun;