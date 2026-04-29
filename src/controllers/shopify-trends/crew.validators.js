export function requireFields(body, fields = []) {
    const missingFields = fields.filter((field) => {
        const value = body?.[field];
        return value === undefined || value === null || value === '';
    });

    if (missingFields.length) {
        const error = new Error(`Missing required field(s): ${missingFields.join(', ')}`);
        error.statusCode = 400;
        throw error;
    }
}