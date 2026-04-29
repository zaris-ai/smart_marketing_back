export function requireFields(body, fields = []) {
    const missing = fields.filter((field) => {
        const value = body?.[field];
        return value === undefined || value === null || value === '';
    });

    if (missing.length) {
        const error = new Error(`Missing required fields: ${missing.join(', ')}`);
        error.statusCode = 400;
        throw error;
    }
}