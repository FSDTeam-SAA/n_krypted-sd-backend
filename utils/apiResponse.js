import { getBilingualMessage } from './messages.js';

export const sendSuccess = (res, statusCode, message, data = null, meta = undefined) => {
  const bilingualMessage = getBilingualMessage(message);

  res.status(statusCode).json({
    success: true,
    message: bilingualMessage.de,
    messageEn: bilingualMessage.en,
    ...(data !== null && { data }),
    ...(meta && { meta })
  });
};

export default sendSuccess;
