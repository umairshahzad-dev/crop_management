require('dotenv').config();
const express = require('express');
const path    = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── View engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'frontend/views'));

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'frontend/public')));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/',                 require('./backend/routes/index'));
app.use('/crud',             require('./backend/routes/crud'));
app.use('/district-details', require('./backend/routes/districtDetails'));

// ── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).render('error', { title: '404 Not Found', message: 'Page not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    res.status(500).render('error', {
        title:   'Server Error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message,
    });
});

// ── Export for Vercel (must be at top level, not conditional) ─────────────────
module.exports = app;

// ── Local dev server ─────────────────────────────────────────────────────────
if (require.main === module) {
    const db = require('./database/connection');
    (async () => {
        try {
            const client = await db.pool.connect();
            console.log('✓ Database connected');
            client.release();
            app.listen(PORT, () => console.log(`✓ Server running at http://localhost:${PORT}`));
        } catch (err) {
            console.error('✗ Database connection failed:', err.message);
            process.exit(1);
        }
    })();
}
