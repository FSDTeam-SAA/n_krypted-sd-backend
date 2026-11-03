import AppSettings from "../models/appSettings.model.js";
import Restaurant from "../models/restaurant.model.js";

export const publicReviewVisibility = async () => {
  const settings = await AppSettings.findOne({ key: "public" })
    .select("showTeamReviews")
    .lean();
  const hiddenRestaurants = await Restaurant.distinct("_id", {
    showTeamReviews: false,
  });
  return {
    $or: [
      { reviewType: "customer" },
      ...(settings?.showTeamReviews !== false
        ? [{ reviewType: "sd_admin", restaurant: { $nin: hiddenRestaurants } }]
        : []),
    ],
  };
};
