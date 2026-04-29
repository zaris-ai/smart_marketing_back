export function requireFields(body, fields) {
    const missing = fields.filter((field) => {
        const value = body?.[field];

        if (Array.isArray(value)) {
            return value.length === 0;
        }

        return value === undefined || value === null || String(value).trim() === '';
    });

    if (missing.length > 0) {
        const error = new Error(`Missing required fields: ${missing.join(', ')}`);
        error.statusCode = 400;
        throw error;
    }
}