import { StatusCodes } from 'http-status-codes';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import sendSuccess from '../utils/apiResponse.js';
import StaticPage from '../models/staticPage.model.js';

export const getPage = catchAsync(async (req, res) => {
  const page = await StaticPage.findOne({ slug: req.params.slug });

  if (!page) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Page not found');
  }

  sendSuccess(res, StatusCodes.OK, 'Page fetched successfully', { page });
});
