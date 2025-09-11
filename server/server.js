const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
require('dotenv').config();

const app = express();

// Trust proxy for production deployment (fixes rate limiting issues)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const eventRoutes = require('./routes/events');
const financeRoutes = require('./routes/finance');
const appRoutes = require('./routes/apps');
const dashboardRoutes = require('./routes/dashboard');
const organizerRoutes = require('./routes/organizer');
const pageRoutes = require('./routes/pages');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crowd_events');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

connectDB();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://apis.google.com"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcAttr: ["'unsafe-inline'"], // Allow inline styles
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.google.com", "https://accounts.google.com", "https://crowd-backend-zxxp.onrender.com", "http://localhost:5000", "http://localhost:3004", "http://localhost:3003", "http://localhost:3002", "http://localhost:3001", "http://localhost:3000"]
    }
  }
}));

// Rate limiting - More relaxed for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 500 // Higher limit for development
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 10 : 50 // Higher limit for development
});

// CORS configuration with enhanced preflight handling
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://relaxed-syrniki-d198c9.netlify.app',
        'https://serene-florentine-4e8889.netlify.app',
        'https://magnificent-haupia-4fdebf.netlify.app',
        'https://dazzling-pithivier-2cf3ce.netlify.app',
        process.env.FRONTEND_URL
      ].filter(Boolean) // Remove any undefined values
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://localhost:8001', 'http://localhost:8080', 'http://127.0.0.1:8080', 'http://127.0.0.1:5500'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  preflightContinue: false,
  optionsSuccessStatus: 200 // For legacy browser support
};
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration for Passport
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Passport configuration
require('./config/passport')(passport);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', '..', 'netlify-frontend', 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Static files
app.use(express.static(path.join(__dirname, '..')));

// Authentication middleware for template rendering
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = !!req.user;
  next();
});

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/apps', appRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/organizer', organizerRoutes);

// Page routes
app.use('/', pageRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const currentPort = process.env.PORT || 3002;
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    server: `http://localhost:${currentPort}`,
    endpoints: {
      auth: `http://localhost:${currentPort}/api/auth`,
      users: `http://localhost:${currentPort}/api/users`,
      events: `http://localhost:${currentPort}/api/events`,
      finance: `http://localhost:${currentPort}/api/finance`,
      apps: `http://localhost:${currentPort}/api/apps`,
      dashboard: `http://localhost:${currentPort}/api/dashboard`,
      organizer: `http://localhost:${currentPort}/api/organizer`,
      frontend: `http://localhost:${currentPort}`
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 API endpoints available at:`);
  console.log(`   • Health: http://localhost:${PORT}/api/health`);
  console.log(`   • Auth: http://localhost:${PORT}/api/auth`);
  console.log(`   • Users: http://localhost:${PORT}/api/users`);
  console.log(`   • Events: http://localhost:${PORT}/api/events`);
  console.log(`   • Finance: http://localhost:${PORT}/api/finance`);
  console.log(`   • Apps: http://localhost:${PORT}/api/apps`);
  console.log(`   • Dashboard: http://localhost:${PORT}/api/dashboard`);
  console.log(`   • Organizer: http://localhost:${PORT}/api/organizer`);
  console.log(`   • Frontend: http://localhost:${PORT}`);
});