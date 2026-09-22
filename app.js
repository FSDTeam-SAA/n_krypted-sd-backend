import express from 'express';
import cors from 'cors';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import categoryRoutes from './routes/category.routes.js';
import dishRoutes from './routes/dish.routes.js';
import ownerRoutes from './routes/owner.routes.js';
import pageRoutes from './routes/page.routes.js';
import restaurantRoutes from './routes/restaurant.routes.js';
import reviewRoutes from './routes/review.routes.js';
import myReviewRoutes from './routes/myReview.routes.js';
import savedRoutes from './routes/saved.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import legacyRoutes from './routes/legacy.routes.js';
import notFound from './middlewares/notFound.js';
import globalErrorHandler from './middlewares/globalErrorHandler.js';
import { getBilingualMessage } from './utils/messages.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  const message = getBilingualMessage('n_krypted API is running');

  res.status(200).json({
    success: true,
    message: message.de,
    messageEn: message.en
  });
});

// The shipped Flutter app and dashboard use the original /api contract.
// Keep it as an explicit compatibility surface while /api/v1 remains available.
app.use('/api', legacyRoutes);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/restaurants', restaurantRoutes);
app.use('/api/v1/dishes', dishRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/me/reviews', myReviewRoutes);
app.use('/api/v1/me/saved', savedRoutes);
app.use('/api/v1/pages', pageRoutes);
app.use('/api/v1/owner', ownerRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/uploads', uploadRoutes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
