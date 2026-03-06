require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const connectDB = require('./config/db');
const logger = require('./utils/logger');

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Session — configured after DB connects (see start() below)


// Start
async function start() {
  await connectDB();

  // Set up session store using the already-connected mongoose connection
  const mongoose = require('mongoose');
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'xtool-secret',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        client: mongoose.connection.getClient(),
        collectionName: 'sessions',
      }),
      cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
    })
  );

  // Routes must be after session middleware
  app.use('/', authRoutes);
  app.use('/', dashboardRoutes);
  app.use('/api', apiRoutes);

  app.listen(PORT, () => {
    logger.info(`XTool dashboard running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
