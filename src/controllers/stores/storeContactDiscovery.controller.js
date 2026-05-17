import Store from '../../models/store.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { discoverStoreContactPoints } from '../../services/store-contact-discovery.service.js';

function normalizeDomain(value = '') {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');
}

function makeStoreNameFromDomain(domain) {
    const base = String(domain || '').split('.')[0] || 'Store';

    return base
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildDiscoveryNote(discovery) {
    const socialPlatforms = [
        ...new Set((discovery.socialProfiles || []).map((item) => item.platform)),
    ];

    const parts = [];

    if (discovery.primaryEmail) {
        parts.push(`primaryEmail=${discovery.primaryEmail}`);
    }

    if (socialPlatforms.length) {
        parts.push(`social=${socialPlatforms.join(',')}`);
    }

    if (discovery.contactForms?.length) {
        parts.push(`forms=${discovery.contactForms.length}`);
    }

    if (discovery.phones?.length) {
        parts.push(`phones=${discovery.phones.length}`);
    }

    parts.push(`pages=${discovery.pageCount || 0}`);
    parts.push(`status=${discovery.status}`);

    return `[contact-discovery] ${new Date().toISOString()} ${parts.join(' | ')}`;
}

function upsertContactDiscoveryNote(notes = '', nextNote = '') {
    const cleaned = String(notes || '')
        .replace(/\n?\[contact-discovery\].*/g, '')
        .trim();

    if (!cleaned) return nextNote;

    return `${cleaned}\n\n${nextNote}`;
}

async function saveDiscoveryToStore(store, discovery, options = {}) {
    const shouldAppendNotes = options.appendNotes !== false;

    store.metadata = {
        ...(store.metadata || {}),
        contactDiscovery: discovery,
    };

    store.markModified('metadata');

    if (!store.contactEmail && discovery.primaryEmail) {
        store.contactEmail = discovery.primaryEmail;
    }

    store.isChecked = true;
    store.checkedAt = new Date();

    if (shouldAppendNotes) {
        store.notes = upsertContactDiscoveryNote(
            store.notes,
            buildDiscoveryNote(discovery)
        );
    }

    await store.save();

    return store;
}

function parseMaxPages(value) {
    const parsed = Number(value || 30);

    if (!Number.isFinite(parsed)) return 30;

    return Math.min(Math.max(parsed, 1), 100);
}

export const discoverStoreContacts = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const store = await Store.findById(id);

    if (!store) {
        return res.status(404).json({
            success: false,
            message: 'Store not found.',
        });
    }

    const discovery = await discoverStoreContactPoints(store.domain, {
        maxPages: parseMaxPages(req.body?.maxPages || req.query?.maxPages),
    });

    const updatedStore = await saveDiscoveryToStore(store, discovery, {
        appendNotes: req.body?.appendNotes !== false,
    });

    res.json({
        success: true,
        message: 'Contact discovery completed.',
        data: {
            store: updatedStore,
            discovery,
        },
    });
});

export const discoverContactsByUrl = asyncHandler(async (req, res) => {
    const url = String(req.body?.url || req.body?.domain || '').trim();

    if (!url) {
        return res.status(400).json({
            success: false,
            message: 'Website URL or domain is required.',
        });
    }

    const domain = normalizeDomain(url);

    if (!domain || !domain.includes('.')) {
        return res.status(400).json({
            success: false,
            message: 'Valid website domain is required.',
        });
    }

    let store = await Store.findOne({ domain });

    if (!store) {
        store = new Store({
            name: req.body?.name || makeStoreNameFromDomain(domain),
            domain,
            country: req.body?.country || '',
            platform: 'shopify',
            isActive: true,
        });
    }

    const discovery = await discoverStoreContactPoints(domain, {
        maxPages: parseMaxPages(req.body?.maxPages || req.query?.maxPages),
    });

    const updatedStore = await saveDiscoveryToStore(store, discovery, {
        appendNotes: req.body?.appendNotes !== false,
    });

    res.status(store.isNew ? 201 : 200).json({
        success: true,
        message: store.isNew
            ? 'Store created and contact discovery completed.'
            : 'Store updated and contact discovery completed.',
        data: {
            store: updatedStore,
            discovery,
        },
    });
});

function parseBatchLimit(value) {
    const parsed = Number(value || process.env.STORE_CONTACT_BULK_MAX || 50);

    if (!Number.isFinite(parsed)) return 50;

    return Math.min(Math.max(parsed, 1), 100);
}

async function runWithConcurrency(items, concurrency, worker) {
    const results = [];
    let currentIndex = 0;

    async function runner() {
        while (currentIndex < items.length) {
            const index = currentIndex;
            currentIndex += 1;

            try {
                results[index] = await worker(items[index], index);
            } catch (error) {
                results[index] = {
                    success: false,
                    error: error?.message || 'Unknown bulk processing error',
                };
            }
        }
    }

    const workers = Array.from(
        { length: Math.min(concurrency, items.length) },
        () => runner()
    );

    await Promise.all(workers);

    return results;
}

export const bulkDiscoverStoreContacts = asyncHandler(async (req, res) => {
    const storeIds = Array.isArray(req.body?.storeIds)
        ? req.body.storeIds.map(String)
        : [];

    const uniqueStoreIds = [...new Set(storeIds)].filter(Boolean);
    const maxBatchSize = parseBatchLimit(req.body?.maxBatchSize);
    const maxPages = parseMaxPages(req.body?.maxPages);
    const concurrency = Math.min(
        Math.max(Number(req.body?.concurrency || 3), 1),
        5
    );

    if (!uniqueStoreIds.length) {
        return res.status(400).json({
            success: false,
            message: 'storeIds array is required.',
        });
    }

    if (uniqueStoreIds.length > maxBatchSize) {
        return res.status(400).json({
            success: false,
            message: `Too many stores selected. Maximum allowed per request is ${maxBatchSize}.`,
            data: {
                selectedCount: uniqueStoreIds.length,
                maxBatchSize,
            },
        });
    }

    const startedAt = new Date();

    const results = await runWithConcurrency(
        uniqueStoreIds,
        concurrency,
        async (storeId) => {
            const store = await Store.findById(storeId);

            if (!store) {
                return {
                    storeId,
                    success: false,
                    status: 'not_found',
                    message: 'Store not found.',
                };
            }

            try {
                const discovery = await discoverStoreContactPoints(store.domain, {
                    maxPages,
                });

                const updatedStore = await saveDiscoveryToStore(store, discovery, {
                    appendNotes: req.body?.appendNotes !== false,
                });

                return {
                    storeId,
                    domain: store.domain,
                    success: true,
                    status: discovery.status,
                    message: 'Contact discovery completed.',
                    store: updatedStore,
                    summary: discovery.summary,
                };
            } catch (error) {
                store.metadata = {
                    ...(store.metadata || {}),
                    contactDiscovery: {
                        status: 'failed',
                        inputDomain: store.domain,
                        startedAt,
                        finishedAt: new Date(),
                        maxPages,
                        pageCount: 0,
                        primaryEmail: '',
                        emails: [],
                        phones: [],
                        socialProfiles: [],
                        contactForms: [],
                        pages: [],
                        crawlErrors: [
                            {
                                url: store.domain,
                                message: error?.message || 'Unknown discovery error',
                            },
                        ],
                        summary: {
                            emailCount: 0,
                            phoneCount: 0,
                            socialProfileCount: 0,
                            contactFormCount: 0,
                            pagesVisited: 0,
                            errorCount: 1,
                        },
                    },
                };

                store.isChecked = true;
                store.checkedAt = new Date();
                store.markModified('metadata');
                await store.save();

                return {
                    storeId,
                    domain: store.domain,
                    success: false,
                    status: 'failed',
                    message: error?.message || 'Contact discovery failed.',
                    store,
                };
            }
        }
    );

    const successCount = results.filter((item) => item?.success).length;
    const failedCount = results.length - successCount;

    return res.json({
        success: failedCount === 0,
        message:
            failedCount === 0
                ? `Bulk contact discovery completed for ${successCount} stores.`
                : `Bulk contact discovery completed with ${successCount} success and ${failedCount} failed.`,
        data: {
            startedAt,
            finishedAt: new Date(),
            requestedCount: uniqueStoreIds.length,
            successCount,
            failedCount,
            maxPages,
            concurrency,
            results,
        },
    });
});

