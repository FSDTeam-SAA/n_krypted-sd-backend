import { StatusCodes } from 'http-status-codes';
import { getBilingualMessage } from '../utils/messages.js';

const notFound = (req, res) => {
  const message = getBilingualMessage(`Route not found: ${req.originalUrl}`);

  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: message.de,
    messageEn: message.en
  });
};

export default notFound;
