export const sendSuccess = (res, statusCode, message, data = null, meta = undefined) => {
  res.status(statusCode).json({
    success: true,
    message,
    ...(data !== null && { data }),
    ...(meta && { meta })
  });
};

export default sendSuccess;
