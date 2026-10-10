// api/export.js
// JOVIA Network — Inactive & Unpaid Users CSV Export
import { connectDB } from '../lib/db.js';
import User from '../models/User.js';
export default async function handler(req, res) {
    // Allow downloads only through GET requests.
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({
            success: false,
            message: 'Method not allowed.'
        });
    }
    try {
        // Connect to the existing database.
        await connectDB();
        // Find unpaid users.
        const users = await User.find({
            isPaid: false
        })
        .select('username email')
        .sort({ username: 1 })
        .lean();
        // Protect exported values against spreadsheet formula injection.
        function sanitizeValue(value) {
            let text = String(value ?? '');
            if (/^[\s]*[=+\-@]/.test(text)) {
                text = "'" + text;
            }
            return text;
        }
        // Escape CSV values correctly.
        function escapeCsv(value) {
            return '"' +
                sanitizeValue(value).replace(/"/g, '""') +
                '"';
        }
        // Generate CSV content.
        const rows = [
            ['Username', 'Email Address'],
            ...users.map(user => [
                user.username,
                user.email
            ])
        ];
        const csv =
            '\uFEFF' +
            rows
                .map(row => row.map(escapeCsv).join(','))
                .join('\r\n');
        // Generate a timestamped filename.
        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-');
        const filename = `jovia_unpaid_users_${timestamp}.csv`;
        // Set download headers.
        res.setHeader(
            'Content-Type',
            'text/csv; charset=utf-8'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.status(200).send(csv);
    } catch (error) {
        console.error('JOVIA user export failed:', error);
        return res.status(500).json({
            success: false,
            message: 'Unable to export users at this time.'
        });
    }
}
