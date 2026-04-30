export function parsePagination(query = {}, options = {}) {
    const defaultPage = options.defaultPage || 1;
    const defaultLimit = options.defaultLimit || 20;
    const maxLimit = options.maxLimit || 100;

    const rawPage = Number.parseInt(query.page, 10);
    const rawLimit = Number.parseInt(query.limit, 10);

    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : defaultPage;

    const limit =
        Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(rawLimit, maxLimit)
            : defaultLimit;

    const skip = (page - 1) * limit;

    return {
        page,
        limit,
        skip,
    };
}

export function buildPaginationMeta({ page, limit, total }) {
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
        page,
        limit,
        total,
        totalPages,
        hasPrevPage: page > 1,
        hasNextPage: totalPages > 0 && page < totalPages,
        prevPage: page > 1 ? page - 1 : null,
        nextPage: totalPages > 0 && page < totalPages ? page + 1 : null,
    };
}