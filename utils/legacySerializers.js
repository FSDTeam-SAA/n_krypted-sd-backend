const plain = (value) => {
  if (!value) return value;
  return typeof value.toObject === 'function' ? value.toObject() : value;
};

export const imageUrl = (image) => {
  if (!image) return '';
  return typeof image === 'string' ? image : image.secure_url || image.url || '';
};

export const imageUrls = (images = []) => images.map(imageUrl).filter(Boolean);

export const externalImageAsset = (url, index = 0) => ({
  public_id: `external/${Buffer.from(`${url}:${index}`).toString('base64url').slice(0, 80)}`,
  secure_url: url
});

export const legacyUser = (value) => {
  const user = plain(value) || {};
  return {
    _id: String(user._id || user.id || ''),
    name: user.name || '',
    email: user.email || '',
    phoneNumber: user.phone || user.phoneNumber || '',
    role: user.role === 'customer' ? 'user' : (user.role || 'user'),
    isVerified: Boolean(user.emailVerified),
    avatar: imageUrl(user.avatar),
    country: user.country || '',
    cityState: user.cityState || '',
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

export const legacyDish = (value) => {
  const dish = plain(value) || {};
  const images = imageUrls(dish.images);
  return {
    _id: String(dish._id || dish.id || ''),
    name: dish.name || '',
    description: dish.description || '',
    price: Number(dish.price) || 0,
    image: images[0] || '',
    images,
    category: dish.category || '',
    specialtyDescription: dish.specialtyDescription || '',
    ingredients: dish.ingredients || [],
    preparationProcess: dish.preparationMethod || '',
    isSignatureDish: Boolean(dish.isSignature),
    isActive: dish.status === 'active',
    rating: Number(dish.ratingAverage) || 0,
    reviewCount: Number(dish.ratingCount) || 0,
    createdAt: dish.createdAt,
    updatedAt: dish.updatedAt
  };
};

const legacyLocation = (restaurant) => {
  const coordinates = restaurant.location?.coordinates || [];
  return {
    address: restaurant.address || '',
    city: restaurant.city || '',
    country: restaurant.country || '',
    longitude: coordinates[0],
    latitude: coordinates[1]
  };
};

export const legacyRestaurant = (value, dishes = []) => {
  const restaurant = plain(value) || {};
  const category = restaurant.categories?.[0];
  const status = restaurant.status === 'active' ? 'activate' : 'deactivate';
  const approvalStatus = restaurant.status === 'active'
    ? 'approved'
    : restaurant.status === 'blocked' && restaurant.rejectionReason
      ? 'rejected'
      : 'pending';
  const openingHours = (restaurant.openingHours || [])
    .map((hours) => hours.closed ? `${hours.day}: Closed` : `${hours.day}: ${hours.open || ''}-${hours.close || ''}`)
    .join(', ');

  return {
    _id: String(restaurant._id || restaurant.id || ''),
    title: restaurant.name || '',
    shortDescription: restaurant.shortDescription || '',
    description: restaurant.description || '',
    price: Number(restaurant.price) || 0,
    location: legacyLocation(restaurant),
    owner: restaurant.owner && typeof restaurant.owner === 'object'
      ? legacyUser(restaurant.owner)
      : String(restaurant.owner || ''),
    approvalStatus,
    rejectionReason: restaurant.rejectionReason,
    dishes: dishes.map(legacyDish),
    images: imageUrls(restaurant.gallery),
    offers: restaurant.offers || [],
    status,
    category: category ? { _id: category, categoryName: category } : undefined,
    rating: Number(restaurant.ratingAverage) || 0,
    sdRating: Number(restaurant.ratingAverage) || 0,
    reviewCount: Number(restaurant.ratingCount) || 0,
    totalCheckIns: Number(restaurant.checkInCount) || 0,
    opensAt: restaurant.opensAt,
    openingHours,
    contactEmail: restaurant.email || '',
    contactPhone: restaurant.phone || '',
    reservationRequired: restaurant.reservationRequired,
    createdAt: restaurant.createdAt,
    updatedAt: restaurant.updatedAt
  };
};

export const legacyCheckIn = (value, restaurantDishes = []) => {
  const checkIn = plain(value) || {};
  return {
    _id: String(checkIn._id || checkIn.id || ''),
    userId: checkIn.user && typeof checkIn.user === 'object'
      ? legacyUser(checkIn.user)
      : String(checkIn.user || ''),
    restaurantId: checkIn.restaurant && typeof checkIn.restaurant === 'object'
      ? legacyRestaurant(checkIn.restaurant, restaurantDishes)
      : String(checkIn.restaurant || ''),
    checkedInAt: checkIn.createdAt,
    partySize: Number(checkIn.partySize) || 1,
    distanceMeters: Number(checkIn.distanceMeters) || 0,
    status: checkIn.status || 'verified'
  };
};

export const legacyReview = (value) => {
  const review = plain(value) || {};
  const restaurant = review.restaurant && typeof review.restaurant === 'object'
    ? legacyRestaurant(review.restaurant)
    : review.restaurant;
  const dish = review.dish && typeof review.dish === 'object' ? legacyDish(review.dish) : review.dish;
  const checkIn = review.checkIn && typeof review.checkIn === 'object'
    ? legacyCheckIn(review.checkIn)
    : review.checkIn;

  return {
    _id: String(review._id || review.id || ''),
    userID: review.user && typeof review.user === 'object'
      ? legacyUser(review.user)
      : String(review.user || ''),
    dealID: restaurant,
    dishID: dish,
    checkInID: checkIn,
    dishName: dish && typeof dish === 'object' ? dish.name : undefined,
    reviewComment: review.comment || '',
    ratings: Number(review.rating) || 0,
    images: imageUrls(review.images),
    status: review.status,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
  };
};

export const legacyMeta = (total, page, limit) => ({
  currentPage: page,
  totalPages: Math.ceil(total / limit) || 0,
  totalItems: total,
  itemsPerPage: limit
});
