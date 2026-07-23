const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');

const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Helmet's default Content-Security-Policy blocks external resources like
// Google Fonts, the Leaflet map CDN, and OpenStreetMap tiles by default.
// This opens it up just enough for those specific sources. Tighten this
// further once you know exactly what your production domain needs.
app.use(
  helmet({
    contentSecurityPolicy: {
      // Stops Helmet from silently merging in its own default directives
      // (like upgrade-insecure-requests) alongside these custom ones.
      // upgrade-insecure-requests forces the browser to rewrite every
      // http:// request to https:// - which breaks local network testing
      // (e.g. loading the site from a phone via http://192.168.x.x:5000)
      // since there's no SSL certificate for that address.
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
        connectSrc: ["'self'", 'https://nominatim.openstreetmap.org', 'ws:', 'wss:'],
      },
    },
  })
);
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// NOTE: the Flutterwave webhook route needs the raw JSON body too, which
// express.json() already provides here - no special-casing needed.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());

// Serve uploaded rider documents / complaint photos
app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads')));

// Serve the frontend (all the HTML/CSS/JS in /public) from this same server,
// so the whole app - API and website - runs as one process on one port.
// This is what makes `npm run dev` bring up everything together, and makes
// hosting simple: one service, one deploy.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
