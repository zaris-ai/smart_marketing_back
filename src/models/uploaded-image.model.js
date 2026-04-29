import mongoose from 'mongoose';

const uploadedImageSchema = new mongoose.Schema(
    {
        filename: {
            type: String,
            required: true,
            trim: true,
            unique: true,
        },
        originalName: {
            type: String,
            required: true,
            trim: true,
        },
        mimetype: {
            type: String,
            required: true,
            trim: true,
        },
        size: {
            type: Number,
            required: true,
        },
        url: {
            type: String,
            required: true,
            trim: true,
        },
        path: {
            type: String,
            required: true,
            trim: true,
        },
        provider: {
            type: String,
            enum: ['local'],
            default: 'local',
        },
        status: {
            type: String,
            enum: ['active', 'deleted'],
            default: 'active',
        },
    },
    {
        timestamps: true,
    }
);

uploadedImageSchema.index({ createdAt: -1 });
uploadedImageSchema.index({ status: 1 });

const UploadedImage =
    mongoose.models.UploadedImage ||
    mongoose.model('UploadedImage', uploadedImageSchema);

export default UploadedImage;