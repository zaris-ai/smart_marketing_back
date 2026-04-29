import fs from 'node:fs/promises';
import path from 'node:path';
import asyncHandler from '../../utils/asyncHandler.js';
import UploadedImage from '../../models/uploaded-image.model.js';

function getBaseUrl(req) {
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;

    if (publicBaseUrl) {
        return publicBaseUrl.replace(/\/$/, '');
    }

    const protocol = req.get('x-forwarded-proto') || req.protocol;
    return `${protocol}://${req.get('host')}`;
}

export const uploadImage = asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'Image file is required',
        });
    }

    const baseUrl = getBaseUrl(req);
    const imageUrl = `${baseUrl}/uploads/images/${req.file.filename}`;

    const image = await UploadedImage.create({
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: imageUrl,
        path: req.file.path,
        provider: 'local',
        status: 'active',
    });

    res.status(201).json({
        success: true,
        message: 'Image uploaded successfully',
        data: image,
    });
});

export const listUploadedImages = asyncHandler(async (_req, res) => {
    const images = await UploadedImage.find({ status: 'active' })
        .sort({ createdAt: -1 })
        .lean();

    res.json({
        success: true,
        message: 'Uploaded images fetched successfully',
        data: images,
    });
});

export const deleteUploadedImage = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const image = await UploadedImage.findById(id);

    if (!image) {
        return res.status(404).json({
            success: false,
            message: 'Image not found',
        });
    }

    try {
        await fs.unlink(path.resolve(image.path));
    } catch {
        // file may already be missing; DB status still gets updated
    }

    image.status = 'deleted';
    await image.save();

    res.json({
        success: true,
        message: 'Image deleted successfully',
        data: image,
    });
});