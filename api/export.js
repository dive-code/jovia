// api/export.js - FIXED for Jovia
import { connectDB } from '../lib/db.js';
import User from '../models/User.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    await connectDB();
    
    const users = await User.find({ isPaid: false })
      .select('username email')
      .sort({ username: 1 })
      .lean();

    function escapeCsv(value) {
      const text = String(value ?? '');
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    }

    const rows = [
      ['Username', 'Email Address'],
      ...users.map(u => [u.username, u.email])
    ];

    const csv = '\uFEFF' + rows.map(r => r.map(escapeCsv).join(',')).join('\r\n');

    const timestamp = new Date().toISOString().slice(0,10);
    const filename = `jovia_unpaid_users_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    
    return res.status(200).send(csv);

  } catch (error) {
    console.error('JOVIA export failed:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
